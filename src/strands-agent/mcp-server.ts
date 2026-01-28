#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initGoogleClients } from '../services/google-docs.js';
import { initGhostClient } from '../services/ghost.js';
import { initResearchService } from '../services/research.js';
import { runContentAgent } from './agent.js';

let servicesInitialized = false;

async function initializeServices(): Promise<{ success: boolean; error?: string }> {
  if (servicesInitialized) return { success: true };

  try {
    if (!process.env.GHOST_URL || !process.env.GHOST_ADMIN_API_KEY) {
      return { success: false, error: 'Missing GHOST_URL or GHOST_ADMIN_API_KEY' };
    }
    initGhostClient({
      url: process.env.GHOST_URL,
      key: process.env.GHOST_ADMIN_API_KEY,
    });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return { success: false, error: 'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' };
    }
    if (!process.env.GOOGLE_INTERVIEWS_FOLDER_ID) {
      return { success: false, error: 'Missing GOOGLE_INTERVIEWS_FOLDER_ID' };
    }
    await initGoogleClients({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      tokenPath: process.env.GOOGLE_TOKEN_PATH || '/tmp/google-token.json',
      interviewsFolderId: process.env.GOOGLE_INTERVIEWS_FOLDER_ID,
    });

    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'Missing ANTHROPIC_API_KEY' };
    }

    // Initialize research service (optional)
    initResearchService(process.env.TAVILY_API_KEY);

    servicesInitialized = true;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

const server = new Server(
  {
    name: 'ghost-content-agent',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ask',
        description: `Ask the Pretty Perspectives content agent to perform a task. The agent can:

- List and read interview documents from Google Drive
- Search the web for current trends and research topics (with competitor filtering)
- Check for existing/duplicate articles on the Ghost blog
- Generate and create draft articles in the correct Style Me Pretty format

The agent handles full workflows autonomously:
1. For interviews: check duplicates → read interview → generate article → create draft
2. For SEO/topics: check duplicates → research topic → generate article → create draft

Example requests:
- "List all interviews"
- "Create an article from the Nigel interview"
- "What articles do we have about pricing?"
- "Write an SEO article about wedding photography trends in 2026"`,
        inputSchema: {
          type: 'object',
          properties: {
            request: {
              type: 'string',
              description: 'What you want the content agent to do',
            },
          },
          required: ['request'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const initResult = await initializeServices();
  if (!initResult.success) {
    return {
      content: [{ type: 'text', text: `Initialization error: ${initResult.error}` }],
      isError: true,
    };
  }

  if (name !== 'ask') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const { request: agentRequest } = args as { request: string };
  const folderId = process.env.GOOGLE_INTERVIEWS_FOLDER_ID!;

  try {
    const result = await runContentAgent(agentRequest, folderId);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ghost Content Agent MCP server running');
}

main().catch(console.error);
