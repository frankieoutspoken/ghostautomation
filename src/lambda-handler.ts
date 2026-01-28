import { Handler, Context } from 'aws-lambda';
import {
  BedrockAgentCoreGatewayTargetHandler,
  StdioServerAdapterRequestHandler,
} from '@aws/run-mcp-servers-with-aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let secretsLoaded = false;

async function loadSecrets(): Promise<void> {
  if (secretsLoaded) return;

  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) {
    console.error('SECRET_ARN environment variable not set');
    return;
  }

  try {
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

      secretsLoaded = true;
    }
  } catch (error) {
    console.error('Failed to load secrets:', error);
    throw error;
  }
}

export const handler: Handler = async (event: Record<string, unknown>, context: Context) => {
  await loadSecrets();

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const serverParams = {
    command: 'node',
    args: ['dist/mcp-server.js'],
    env,
  };

  const requestHandler = new StdioServerAdapterRequestHandler(serverParams);
  const eventHandler = new BedrockAgentCoreGatewayTargetHandler(requestHandler);

  return eventHandler.handle(event, context);
};
