#!/usr/bin/env node

import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { parse } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { initGoogleClients } from '../services/google-docs.js';
import { initGhostClient } from '../services/ghost.js';
import { runContentAgent } from './agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load secrets from AWS Secrets Manager
async function loadSecrets(): Promise<void> {
  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) return;

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
      console.log('Loaded secrets from Secrets Manager');
    }
  } catch (error) {
    console.error('Failed to load secrets:', error);
    throw error;
  }
}

// Load environment variables from .env for local dev
const envPath = resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  const envConfig = parse(readFileSync(envPath));
  for (const key in envConfig) {
    process.env[key] = envConfig[key];
  }
}

// Write Google token to /tmp if provided as JSON
function setupGoogleToken() {
  if (process.env.GOOGLE_TOKEN_JSON) {
    const tokenPath = '/tmp/google-token.json';
    process.env.GOOGLE_TOKEN_PATH = tokenPath;
    writeFileSync(tokenPath, process.env.GOOGLE_TOKEN_JSON);
  }
}

let servicesInitialized = false;

async function initializeServices(): Promise<void> {
  if (servicesInitialized) return;

  // Load secrets from Secrets Manager if running in AWS
  await loadSecrets();
  setupGoogleToken();

  // Ghost
  if (!process.env.GHOST_URL || !process.env.GHOST_ADMIN_API_KEY) {
    throw new Error('Missing GHOST_URL or GHOST_ADMIN_API_KEY');
  }
  initGhostClient({
    url: process.env.GHOST_URL,
    key: process.env.GHOST_ADMIN_API_KEY,
  });

  // Google
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  if (!process.env.GOOGLE_INTERVIEWS_FOLDER_ID) {
    throw new Error('Missing GOOGLE_INTERVIEWS_FOLDER_ID');
  }
  await initGoogleClients({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    tokenPath: process.env.GOOGLE_TOKEN_PATH || './config/google-token.json',
    interviewsFolderId: process.env.GOOGLE_INTERVIEWS_FOLDER_ID,
    ideasFolderId: process.env.GOOGLE_IDEAS_FOLDER_ID,
  });

  servicesInitialized = true;
}

// Express server for AgentCore Runtime
const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Health check
app.get('/ping', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main invocation endpoint for AgentCore
app.post('/invocations', async (req, res) => {
  try {
    await initializeServices();

    // Decode binary payload
    const payload = new TextDecoder().decode(req.body);
    const request = JSON.parse(payload);

    console.log('Received request:', request.prompt || request.message || request);

    const userMessage = request.prompt || request.message || request.input || JSON.stringify(request);
    const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;

    const result = await runContentAgent(userMessage, folderId);

    res.json({
      response: result,
      status: 'success',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
    });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Ghost Agent server running on port ${PORT}`);
});
