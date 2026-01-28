import { Handler, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { writeFileSync } from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpError, ResultSchema } from '@modelcontextprotocol/sdk/types.js';

let secretsLoaded = false;

async function loadSecrets(): Promise<void> {
  if (secretsLoaded) return;

  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) {
    console.error('SECRET_ARN not set');
    return;
  }

  const client = new SecretsManagerClient({});
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (response.SecretString) {
    const secrets = JSON.parse(response.SecretString);
    process.env.GHOST_URL = secrets.GHOST_URL;
    process.env.GHOST_ADMIN_API_KEY = secrets.GHOST_ADMIN_API_KEY;
    process.env.GOOGLE_CLIENT_ID = secrets.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = secrets.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_INTERVIEWS_FOLDER_ID = secrets.GOOGLE_INTERVIEWS_FOLDER_ID;
    process.env.GOOGLE_TOKEN_JSON = secrets.GOOGLE_TOKEN_JSON;
    process.env.ANTHROPIC_API_KEY = secrets.ANTHROPIC_API_KEY;
    process.env.TAVILY_API_KEY = secrets.TAVILY_API_KEY;
    secretsLoaded = true;
  }
}

// Custom MCP handler with extended timeout (10 minutes)
async function handleMcpRequest(
  event: Record<string, unknown>,
  env: Record<string, string>
): Promise<unknown> {
  const { jsonrpc, id, ...request } = event as { jsonrpc: string; id: number; [key: string]: unknown };

  const client = new Client({
    name: 'mcp-client',
    version: '1.0.0',
  });

  const serverParams = {
    command: 'node',
    args: ['dist/strands-agent/mcp-server.js'],
    env,
  };

  try {
    const transport = new StdioClientTransport(serverParams);
    await client.connect(transport);

    // Extended timeout: 10 minutes (600000ms)
    const result = await client.request(request as Parameters<typeof client.request>[0], ResultSchema, {
      timeout: 600000,
    });

    await client.close();

    return {
      jsonrpc,
      id,
      result,
    };
  } catch (error) {
    if (error instanceof McpError) {
      console.error(`MCP error: ${error}`);
      return {
        jsonrpc,
        id,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    } else {
      console.error(`Error: ${error}`);
      return {
        jsonrpc,
        id,
        error: {
          code: 500,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }
}

export const handler: Handler = async (event: Record<string, unknown>, context: Context) => {
  await loadSecrets();

  // Write Google token to /tmp
  if (process.env.GOOGLE_TOKEN_JSON) {
    writeFileSync('/tmp/google-token.json', process.env.GOOGLE_TOKEN_JSON);
    process.env.GOOGLE_TOKEN_PATH = '/tmp/google-token.json';
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Handle MCP protocol request directly with extended timeout
  return handleMcpRequest(event, env);
};
