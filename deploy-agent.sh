#!/bin/bash
set -e

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="806162193304"
ECR_REPO="ghost-content-agent"
LAMBDA_NAME="ghost-content-agent"
SECRET_ARN="arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:ghost-agent/credentials-CG2FEX"

echo "🔨 Building..."
npm run build

echo "🐳 Building Docker image..."
docker build --platform linux/amd64 --provenance=false --sbom=false -f Dockerfile.agent-lambda -t ${ECR_REPO}:latest .

echo "📤 Pushing to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Create repo if it doesn't exist
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${AWS_REGION} 2>/dev/null || \
  aws ecr create-repository --repository-name ${ECR_REPO} --region ${AWS_REGION}

docker tag ${ECR_REPO}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest

CONTAINER_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest"

# Check if Lambda exists
LAMBDA_EXISTS=$(aws lambda get-function --function-name ${LAMBDA_NAME} --region ${AWS_REGION} 2>/dev/null || echo "")

if [ -z "$LAMBDA_EXISTS" ]; then
  echo "🚀 Creating Lambda function..."

  # Use existing role from MCP Lambda
  ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/ghost-agent-mcp-lambda-role"

  aws lambda create-function \
    --function-name ${LAMBDA_NAME} \
    --package-type Image \
    --code ImageUri=${CONTAINER_URI} \
    --role ${ROLE_ARN} \
    --timeout 900 \
    --memory-size 1024 \
    --environment "Variables={SECRET_ARN=${SECRET_ARN}}" \
    --region ${AWS_REGION} \
    --no-cli-pager

  echo "⏳ Waiting for Lambda to be ready..."
  aws lambda wait function-active --function-name ${LAMBDA_NAME} --region ${AWS_REGION}

  echo "🔗 Creating Function URL..."
  aws lambda create-function-url-config \
    --function-name ${LAMBDA_NAME} \
    --auth-type NONE \
    --region ${AWS_REGION} \
    --no-cli-pager

  # Add permission for public access
  aws lambda add-permission \
    --function-name ${LAMBDA_NAME} \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region ${AWS_REGION} \
    --no-cli-pager 2>/dev/null || true

else
  echo "🔄 Updating Lambda function..."
  aws lambda update-function-code \
    --function-name ${LAMBDA_NAME} \
    --image-uri ${CONTAINER_URI} \
    --region ${AWS_REGION} \
    --no-cli-pager > /dev/null

  echo "⏳ Waiting for Lambda to be ready..."
  aws lambda wait function-updated --function-name ${LAMBDA_NAME} --region ${AWS_REGION}
fi

# Get Function URL
FUNCTION_URL=$(aws lambda get-function-url-config --function-name ${LAMBDA_NAME} --region ${AWS_REGION} --query 'FunctionUrl' --output text 2>/dev/null || echo "")

echo "✅ Deployed!"
echo ""
echo "Lambda: ${LAMBDA_NAME}"
if [ -n "$FUNCTION_URL" ]; then
  echo "URL: ${FUNCTION_URL}"
  echo ""
  echo "Test with:"
  echo "  curl -X POST ${FUNCTION_URL} -H 'Content-Type: application/json' -d '{\"request\": \"List all interviews\"}'"
fi
