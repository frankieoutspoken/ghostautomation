#!/bin/bash
set -e

# Update AgentCore Gateway tool schema
AWS_REGION="us-east-1"
GATEWAY_ID="ghost-agent-gateway-t18kxjosdh"
TARGET_ID="QG9PLBYIQL"
LAMBDA_ARN="arn:aws:lambda:us-east-1:806162193304:function:ghost-content-agent"

# Tool schema - single ask tool
TOOL_SCHEMA='[
  {
    "name": "ask",
    "description": "Ask the Pretty Perspectives content agent to perform a task. The agent can list/read interviews, search the web, check for duplicates, and create draft articles autonomously.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "request": {"type": "string", "description": "What you want the content agent to do"}
      },
      "required": ["request"]
    }
  }
]'

echo "📝 Updating tool schema..."

cat > /tmp/target-config.json << EOF
{
  "mcp": {
    "lambda": {
      "lambdaArn": "${LAMBDA_ARN}",
      "toolSchema": {
        "inlinePayload": ${TOOL_SCHEMA}
      }
    }
  }
}
EOF

aws bedrock-agentcore-control update-gateway-target \
  --gateway-identifier ${GATEWAY_ID} \
  --target-id ${TARGET_ID} \
  --name ghost-content-agent \
  --target-configuration file:///tmp/target-config.json \
  --credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]' \
  --region ${AWS_REGION} \
  --no-cli-pager > /dev/null

echo "✅ Tool schema updated!"
