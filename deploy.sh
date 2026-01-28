#!/bin/bash
set -e

# Ghost Agent MCP - Quick Deploy to Lambda
# Usage: ./deploy.sh

AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="806162193304"
ECR_REPO="ghost-agent-mcp-lambda"
LAMBDA_NAME="ghost-agent-mcp"
GATEWAY_ID="ghost-agent-gateway-t18kxjosdh"
TARGET_ID="QG9PLBYIQL"

echo "🔨 Building..."
npm run build

echo "🐳 Building Docker image..."
DOCKER_BUILDKIT=1 docker build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  -f Dockerfile.lambda \
  -t ${ECR_REPO}:latest . --quiet

echo "📤 Pushing to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com 2>/dev/null
docker tag ${ECR_REPO}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest --quiet

echo "🚀 Updating Lambda..."
aws lambda update-function-code \
  --function-name ${LAMBDA_NAME} \
  --image-uri ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest \
  --region ${AWS_REGION} \
  --no-cli-pager > /dev/null

echo "⏳ Waiting for Lambda to be ready..."
aws lambda wait function-updated --function-name ${LAMBDA_NAME} --region ${AWS_REGION}

echo "✅ Deployed!"
echo ""
echo "MCP URL: https://${GATEWAY_ID}.gateway.bedrock-agentcore.${AWS_REGION}.amazonaws.com/mcp"
