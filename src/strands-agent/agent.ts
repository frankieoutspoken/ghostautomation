import Anthropic from '@anthropic-ai/sdk';
import { listInterviews, getInterview, listArticleIdeas, getIdea } from '../services/google-docs.js';
import { getExistingArticles, searchExistingArticles, checkArticleExists, createDraftArticle } from '../services/ghost.js';
import { generateSlug, generateMetaTitle, generateMetaDescription, suggestTags } from '../utils/metadata.js';
import { searchWeb, researchTopic, initResearchService } from '../services/research.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

// Initialize research service if API key available
if (process.env.TAVILY_API_KEY) {
  initResearchService(process.env.TAVILY_API_KEY);
}

// Tool definitions for the agent
const tools: Anthropic.Tool[] = [
  {
    name: 'list_interviews',
    description: 'List all interview documents from Google Drive. Returns id, title, vendor name, type, and date for each.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_interview',
    description: 'Read the full content of a specific interview document by its ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        documentId: { type: 'string', description: 'The Google Docs document ID' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'list_articles',
    description: 'List existing articles on the Ghost blog. Returns title, slug, and publish date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max articles to return (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'search_articles',
    description: 'Search existing articles by title or slug to check for duplicates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_duplicate',
    description: 'Check if an article with similar title already exists. Returns exact match status and similar articles.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'The proposed article title' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_draft',
    description: 'Create a draft article in Ghost. Provide the complete HTML content ready to publish.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        html: { type: 'string', description: 'Complete HTML content' },
        excerpt: { type: 'string', description: 'Article excerpt/summary' },
        metaDescription: { type: 'string', description: 'SEO meta description' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Article tags' },
      },
      required: ['title', 'html'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information on a topic. Useful for researching wedding industry trends, statistics, or background information for articles.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Maximum results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'research_topic',
    description: 'Research a topic and get a formatted summary of findings. Good for gathering background info before writing an article.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Topic to research' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'list_ideas',
    description: 'List article ideas from the ideas folder in Google Drive. Each idea doc contains a topic/request like "Piece on AI - look for interview quotes".',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_idea',
    description: 'Read the full content of an idea document by its ID. The content contains instructions for what article to create.',
    input_schema: {
      type: 'object' as const,
      properties: {
        documentId: { type: 'string', description: 'The Google Docs document ID' },
      },
      required: ['documentId'],
    },
  },
];

// Tool execution
async function executeTool(name: string, input: Record<string, unknown>, folderId: string, ideasFolderId?: string): Promise<string> {
  switch (name) {
    case 'list_interviews': {
      const interviews = await listInterviews(folderId);
      const result = interviews.map(i => ({
        id: i.id,
        title: i.title,
        vendorName: i.vendorName,
        vendorType: i.vendorType,
        createdAt: i.createdAt?.toLocaleDateString(),
      }));
      return JSON.stringify(result, null, 2);
    }

    case 'read_interview': {
      const interview = await getInterview(input.documentId as string);
      return JSON.stringify({
        id: interview.id,
        title: interview.title,
        vendorName: interview.vendorName,
        vendorType: interview.vendorType,
        content: interview.content,
      }, null, 2);
    }

    case 'list_articles': {
      const articles = await getExistingArticles();
      const limit = (input.limit as number) || 20;
      const result = articles.slice(0, limit).map(a => ({
        title: a.title,
        slug: a.slug,
        publishedAt: a.publishedAt,
      }));
      return JSON.stringify(result, null, 2);
    }

    case 'search_articles': {
      const articles = await searchExistingArticles(input.query as string);
      const result = articles.map(a => ({
        title: a.title,
        slug: a.slug,
        publishedAt: a.publishedAt,
      }));
      return JSON.stringify(result, null, 2);
    }

    case 'check_duplicate': {
      const check = await checkArticleExists(input.title as string);
      return JSON.stringify({
        exactMatch: check.exactMatch,
        similarArticles: check.similarArticles.slice(0, 5).map(a => a.title),
      }, null, 2);
    }

    case 'create_draft': {
      const slug = generateSlug(input.title as string);
      const metaTitle = generateMetaTitle(input.title as string);

      const result = await createDraftArticle({
        title: input.title as string,
        slug,
        html: input.html as string,
        excerpt: input.excerpt as string | undefined,
        metaTitle,
        metaDescription: input.metaDescription as string | undefined,
        tags: input.tags as string[] | undefined,
        status: 'draft',
      });

      return JSON.stringify({
        success: true,
        id: result.id,
        url: result.url,
        message: `Draft created: "${input.title}"`,
      }, null, 2);
    }

    case 'web_search': {
      const results = await searchWeb(
        input.query as string,
        (input.maxResults as number) || 5
      );
      return JSON.stringify(results, null, 2);
    }

    case 'research_topic': {
      const research = await researchTopic(input.topic as string);
      return research;
    }

    case 'list_ideas': {
      const effectiveIdeasFolderId = ideasFolderId || process.env.GOOGLE_IDEAS_FOLDER_ID;
      if (!effectiveIdeasFolderId) {
        return JSON.stringify({ error: 'Ideas folder not configured' });
      }
      const ideas = await listArticleIdeas(effectiveIdeasFolderId);
      const result = ideas.map(i => ({
        id: i.id,
        title: i.title,
        createdAt: i.createdAt?.toLocaleDateString(),
      }));
      return JSON.stringify(result, null, 2);
    }

    case 'read_idea': {
      const idea = await getIdea(input.documentId as string);
      return JSON.stringify({
        id: idea.id,
        title: idea.title,
        content: idea.content,
      }, null, 2);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/**
 * Run the content agent with a user request.
 * The agent will autonomously use tools to complete the task.
 */
export async function runContentAgent(request: string, folderId: string, ideasFolderId?: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: request },
  ];

  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  });

  // Agentic loop - keep going until no more tool calls
  let iterations = 0;
  const maxIterations = 15;

  while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
    iterations++;
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        console.error(`[Agent] Executing tool: ${block.name}`);
        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>, folderId, ideasFolderId);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        } catch (error) {
          console.error(`[Agent] Tool error: ${error}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
  }

  // Extract final text response
  const textBlocks = response.content.filter(b => b.type === 'text');
  const finalResponse = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('\n');

  if (iterations >= maxIterations) {
    return `${finalResponse}\n\n(Note: Agent reached iteration limit)`;
  }

  return finalResponse;
}
