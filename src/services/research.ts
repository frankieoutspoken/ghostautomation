import { filterBlockedUrls, getBlockedDomains } from '../utils/blocklist.js';
import type { ResearchResult } from '../types/index.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';

let tavilyApiKey: string | null = null;

export function initResearchService(apiKey?: string): void {
  tavilyApiKey = apiKey || null;
}

export async function searchWeb(query: string, maxResults: number = 10): Promise<ResearchResult[]> {
  if (!tavilyApiKey) {
    console.warn('Tavily API key not configured. Skipping web research.');
    return [];
  }

  try {
    const blockedDomains = getBlockedDomains();

    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: `${query} wedding industry`,
        search_depth: 'advanced',
        max_results: maxResults * 2, // Request more since we'll filter some out
        exclude_domains: blockedDomains,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();

    const results: ResearchResult[] = (data.results || []).map((result: any) => ({
      title: result.title,
      url: result.url,
      snippet: result.content || result.snippet,
      source: new URL(result.url).hostname,
    }));

    // Double-check filtering (in case Tavily didn't exclude all)
    const filtered = filterBlockedUrls(results);

    return filtered.slice(0, maxResults);
  } catch (error) {
    console.error('Research search failed:', error);
    return [];
  }
}

export async function researchTopic(topic: string): Promise<string> {
  const results = await searchWeb(topic, 5);

  if (results.length === 0) {
    return 'No research results available.';
  }

  const context = results
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source}] (${r.url})\n${r.title}\n${r.snippet}`
    )
    .join('\n\n---\n\n');

  return `Research findings on "${topic}":\n\n${context}`;
}

export async function researchKeywords(keywords: string[]): Promise<string> {
  const allResults: ResearchResult[] = [];

  for (const keyword of keywords.slice(0, 3)) {
    const results = await searchWeb(keyword, 3);
    allResults.push(...results);
  }

  // Deduplicate by URL
  const uniqueResults = allResults.filter(
    (result, index, self) =>
      index === self.findIndex(r => r.url === result.url)
  );

  if (uniqueResults.length === 0) {
    return 'No research results available.';
  }

  const context = uniqueResults
    .slice(0, 8)
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source}] (${r.url})\n${r.title}\n${r.snippet}`
    )
    .join('\n\n---\n\n');

  return `Research findings:\n\n${context}`;
}

export function isResearchAvailable(): boolean {
  return tavilyApiKey !== null;
}
