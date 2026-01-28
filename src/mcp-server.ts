#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const AGENT_LAMBDA_URL = 'https://rce4t72fafpgdu5wc3vb4z3u3y0bpnjg.lambda-url.us-east-1.on.aws/';

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

// List available tools - just the agent
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
- "Write an SEO article about wedding photography trends in 2026"
- "Research wedding vendor marketing trends"`,
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

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'ask') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const { request: agentRequest } = args as { request: string };

  try {
    const response = await fetch(AGENT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: agentRequest }),
    });

    if (!response.ok) {
      throw new Error(`Agent request failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      content: [{
        type: 'text',
        text: result.response || result.error || 'No response from agent',
      }],
      isError: !!result.error,
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ghost Content Agent MCP server running on stdio');
}

main().catch(console.error);
