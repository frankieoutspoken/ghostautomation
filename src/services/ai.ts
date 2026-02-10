import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sanitizeBlockedLinks } from '../utils/blocklist.js';
import type { ArticleGenerationResult, Interview } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let anthropicClient: Anthropic | null = null;

const ARTICLE_SYSTEM_PROMPT = `You are a content writer for Pretty Perspectives by Style Me Pretty.

CRITICAL RULE - COMPETITOR BLOCKING:
You must NEVER mention, reference, cite, quote, or link to any of these competitor publications:
- The Knot (theknot.com)
- WeddingWire (weddingwire.com)
- Zola (zola.com)
- Brides (brides.com)
- Martha Stewart Weddings (marthastewartweddings.com)
- WeddingBee (weddingbee.com)
- Junebug Weddings (junebugweddings.com)
- Green Wedding Shoes (greenweddingshoes.com)
- Ruffled Blog (ruffledblog.com)

If research context includes information from these sources, you may use the factual information but must NOT attribute it to them or link to them. When citing sources, only link to non-competitor publications.`;

export function initAIClient(apiKey: string): void {
  anthropicClient = new Anthropic({ apiKey });
}

function loadPromptTemplate(templateName: string): string {
  const promptPath = join(__dirname, `../../config/prompts/${templateName}.txt`);
  return readFileSync(promptPath, 'utf-8');
}

export async function generateInterviewArticle(
  interview: Interview
): Promise<ArticleGenerationResult> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const template = loadPromptTemplate('interview-profile');
  const prompt = template
    .replace('{{interview_content}}', interview.content)
    .replace('{{vendor_name}}', interview.vendorName || 'Unknown Vendor')
    .replace('{{vendor_type}}', interview.vendorType || 'Wedding Professional');

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  const result = parseArticleResponse(content.text);
  result.article.html = sanitizeBlockedLinks(result.article.html);
  return result;
}

export async function generateThemeArticle(
  interviews: Interview[]
): Promise<ArticleGenerationResult> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const template = loadPromptTemplate('theme-roundup');

  const interviewsText = interviews
    .map(
      (i, idx) =>
        `--- Interview ${idx + 1}: ${i.vendorName || i.title} (${i.vendorType || 'Wedding Professional'}) ---\n${i.content}`
    )
    .join('\n\n');

  const prompt = template.replace('{{interviews}}', interviewsText);

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  const result = parseArticleResponse(content.text);
  result.article.html = sanitizeBlockedLinks(result.article.html);
  return result;
}

export async function generateInsightArticle(
  insight: string,
  vendorName: string,
  researchContext: string
): Promise<ArticleGenerationResult> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const template = loadPromptTemplate('insight-article');
  const prompt = template
    .replace('{{insight}}', insight)
    .replace('{{vendor_name}}', vendorName)
    .replace('{{research_context}}', researchContext);

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  const result = parseArticleResponse(content.text);
  result.article.html = sanitizeBlockedLinks(result.article.html);
  return result;
}

export async function generateSEOArticle(
  topic: string,
  keywords: string[],
  researchContext: string
): Promise<ArticleGenerationResult> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const template = loadPromptTemplate('seo-content');
  const prompt = template
    .replace('{{topic}}', topic)
    .replace('{{keywords}}', keywords.join(', '))
    .replace('{{research_context}}', researchContext);

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  const result = parseArticleResponse(content.text);
  result.article.html = sanitizeBlockedLinks(result.article.html);
  return result;
}

export async function analyzeInterviewsForThemes(
  interviews: Interview[]
): Promise<string[]> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const interviewsSummary = interviews
    .map(
      (i, idx) =>
        `Interview ${idx + 1} (${i.vendorName || i.title}): ${i.content.slice(0, 500)}...`
    )
    .join('\n\n');

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze these vendor interviews and identify 3-5 compelling themes or topics that could make great articles. Return only a JSON array of theme titles, no explanation.

INTERVIEWS:
${interviewsSummary}

Return format: ["Theme 1", "Theme 2", "Theme 3"]`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    // Extract JSON array from response
    const match = content.text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch {
    console.error('Failed to parse themes:', content.text);
    return [];
  }
}

export async function extractInsightsFromInterview(
  interview: Interview
): Promise<string[]> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Read this vendor interview and extract 3-5 notable quotes or insights that could be expanded into their own articles. Look for unique perspectives, surprising advice, or thought-provoking statements.

INTERVIEW (${interview.vendorName || interview.title}):
${interview.content}

Return only a JSON array of quotes/insights, no explanation.
Return format: ["Quote or insight 1", "Quote or insight 2", "Quote or insight 3"]`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    const match = content.text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch {
    console.error('Failed to parse insights:', content.text);
    return [];
  }
}

function parseArticleResponse(text: string): ArticleGenerationResult {
  // Extract HTML content (between first and last HTML tags or code blocks)
  let html = '';
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (htmlMatch) {
    html = htmlMatch[1].trim();
  } else {
    // Try to find HTML directly
    const directHtmlMatch = text.match(/<[^>]+>[\s\S]*<\/[^>]+>/);
    if (directHtmlMatch) {
      html = directHtmlMatch[0];
    }
  }

  // Extract title - try multiple patterns
  let title = '';

  // Pattern 1: Look for "Title:" or "**Title:**" in response
  const titlePatterns = [
    /\*\*Title[:\*]*\*\*\s*["']?([^"'\n]+)["']?/i,
    /Title:\s*["']?([^"'\n]+)["']?/i,
    /^#\s+(.+)$/m,
    /Suggested [Tt]itle:\s*["']?([^"'\n]+)["']?/i,
  ];

  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      title = match[1].trim().replace(/^\*+|\*+$/g, '').replace(/^["']|["']$/g, '');
      break;
    }
  }

  // Pattern 2: Extract from H1 in HTML
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) {
      title = h1Match[1].replace(/<[^>]*>/g, '').trim();
    }
  }

  // Pattern 3: Look for first strong/bold text that looks like a title
  if (!title) {
    const strongMatch = text.match(/\*\*([A-Z][^*\n]{10,80})\*\*/);
    if (strongMatch) {
      title = strongMatch[1].trim();
    }
  }

  // Pattern 4: Fallback - generate from first meaningful heading in HTML
  if (!title) {
    const h2Match = html.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (h2Match) {
      title = h2Match[1].replace(/<[^>]*>/g, '').trim();
    }
  }

  // Clean up title
  title = title.replace(/^["'\*]+|["'\*]+$/g, '').replace(/\\"/g, '"').trim();

  // Clean up HTML - remove escaped quotes and other artifacts
  html = html
    .replace(/\\"/g, '"')           // Fix escaped quotes
    .replace(/\\'/g, "'")           // Fix escaped single quotes
    .replace(/\\_/g, '_')           // Fix escaped underscores
    .replace(/\\\*/g, '*')          // Fix escaped asterisks
    .replace(/\\n/g, '\n')          // Fix literal \n
    .replace(/&amp;quot;/g, '"')    // Fix double-encoded quotes
    .replace(/&amp;#39;/g, "'");    // Fix double-encoded apostrophes

  // Extract suggested tags
  let suggestedTags: string[] = [];
  const tagsMatch = text.match(/Tags?:\s*(.+)/i);
  if (tagsMatch) {
    suggestedTags = tagsMatch[1]
      .split(',')
      .map(t => t.trim().toLowerCase().replace(/^["'\*]+|["'\*]+$/g, '').trim())
      .filter(t => t.length > 0);
  }

  // Extract meta description
  let metaDescription = '';
  const metaPatterns = [
    /Meta\s*[Dd]escription:\s*["']?([^"'\n]+)["']?/i,
    /\*\*Meta [Dd]escription[:\*]*\*\*\s*["']?([^"'\n]+)["']?/i,
  ];
  for (const pattern of metaPatterns) {
    const match = text.match(pattern);
    if (match) {
      metaDescription = match[1].trim();
      break;
    }
  }

  // Extract excerpt
  let excerpt = '';
  const excerptPatterns = [
    /Excerpt:\s*["']?([^"'\n]+)["']?/i,
    /\*\*Excerpt[:\*]*\*\*\s*["']?([^"'\n]+)["']?/i,
    /Custom [Ee]xcerpt:\s*["']?([^"'\n]+)["']?/i,
  ];
  for (const pattern of excerptPatterns) {
    const match = text.match(pattern);
    if (match) {
      excerpt = match[1].trim().replace(/^\*+|\*+$/g, '').trim();
      break;
    }
  }

  // Generate meta title from title
  const metaTitle = title ? `${title} | Style Me Pretty` : '';

  return {
    article: {
      title,
      slug: '',
      html,
      excerpt,
      tags: suggestedTags,
      metaTitle,
      metaDescription,
      status: 'draft',
    },
    suggestedTags,
    metaTitle,
    metaDescription,
    excerpt,
  };
}

export async function chat(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  if (!anthropicClient) throw new Error('AI client not initialized');

  const systemPrompt = `You are a content strategist for Pretty Perspectives by Style Me Pretty - the leading wedding publication helping vendors grow their businesses.

## BRAND CONTEXT
- Style Me Pretty is the premier wedding inspiration destination
- Pretty Perspectives is SMP's B2B publication for wedding vendors
- Goal: Generate leads for the Style Me Pretty vendor directory ($99 Oh Profile) and Little Black Book premium membership
- Audience: Wedding photographers, planners, florists, venues, caterers, and other wedding professionals

## YOUR ROLE
You help create content, analyze vendor interviews, and suggest article ideas that:
1. Provide genuine value to wedding vendors
2. Showcase vendor success stories
3. Drive sign-ups to Style Me Pretty's vendor programs
4. Position SMP as the go-to resource for wedding industry professionals

## VOICE & TONE
- Warm, professional, encouraging
- Like a supportive industry insider sharing wisdom
- Never salesy - always value-first
- Use "we" when referring to Style Me Pretty

## CONTENT RULES
- Never mention competitors (The Knot, WeddingWire, Zola, Brides, Martha Stewart Weddings)
- Always include a CTA for Style Me Pretty vendor directory when appropriate
- Use the Ghost CMS HTML format with kg-card classes
- Start articles with a TL;DR callout card

When asked to create articles, generate HTML content matching the Style Me Pretty format exactly.`;

  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  return content.text;
}
