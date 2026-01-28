import { checkArticleExists, createDraftArticle } from '../services/ghost.js';
import { generateSEOArticle } from '../services/ai.js';
import { researchKeywords, isResearchAvailable } from '../services/research.js';
import { generateSlug, generateMetaTitle, generateMetaDescription, suggestTags } from '../utils/metadata.js';
import type { GeneratorOptions } from '../types/index.js';

export async function generateSEOContent(
  topic: string,
  keywords?: string[],
  options: GeneratorOptions = {}
): Promise<{ success: boolean; message: string; articleUrl?: string }> {
  try {
    // Generate keywords from topic if not provided
    const targetKeywords = keywords || extractKeywordsFromTopic(topic);

    // Check for duplicates
    if (options.verbose) console.log('Checking for existing articles...');
    const exists = await checkArticleExists(topic);
    if (exists) {
      return {
        success: false,
        message: `An article about "${topic}" may already exist. Check Ghost for duplicates.`,
      };
    }

    // Research the topic
    let researchContext = 'No additional research available.';
    if (isResearchAvailable()) {
      if (options.verbose) console.log('Researching topic and keywords...');
      researchContext = await researchKeywords([topic, ...targetKeywords]);
    }

    // Generate the article
    if (options.verbose) console.log('Generating SEO-optimized article...');
    const result = await generateSEOArticle(topic, targetKeywords, researchContext);

    // Enhance metadata
    const article = result.article;
    article.slug = generateSlug(article.title || topic);
    article.metaTitle = article.metaTitle || generateMetaTitle(article.title);
    article.metaDescription = article.metaDescription || generateMetaDescription(result.excerpt);

    // Add tags including keywords
    const autoTags = suggestTags(article.html);
    const keywordTags = targetKeywords.map(k => k.toLowerCase().replace(/\s+/g, '-'));
    article.tags = [...new Set([...(article.tags || []), ...autoTags, ...keywordTags])];

    if (options.dryRun) {
      return {
        success: true,
        message: `[DRY RUN] Would create SEO article: "${article.title}"\nTarget keywords: ${targetKeywords.join(', ')}\nTags: ${article.tags?.join(', ')}`,
      };
    }

    // Create draft in Ghost
    if (options.verbose) console.log('Creating draft in Ghost...');
    const ghostResult = await createDraftArticle(article);

    return {
      success: true,
      message: `Created SEO article: "${article.title}"`,
      articleUrl: ghostResult.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to generate SEO article: ${errorMessage}`,
    };
  }
}

function extractKeywordsFromTopic(topic: string): string[] {
  // Common wedding business SEO keywords to match against
  const keywordPatterns: Record<string, string[]> = {
    marketing: ['wedding vendor marketing', 'wedding business marketing', 'marketing tips'],
    pricing: ['wedding pricing', 'how to price wedding services', 'wedding vendor pricing'],
    booking: ['booking more weddings', 'wedding leads', 'client booking'],
    portfolio: ['wedding portfolio', 'portfolio tips', 'showcase work'],
    social: ['wedding social media', 'instagram for weddings', 'social media marketing'],
    networking: ['wedding vendor networking', 'wedding industry connections', 'vendor relationships'],
    client: ['wedding client experience', 'client communication', 'client relationships'],
    trends: ['wedding trends', 'wedding industry trends', 'upcoming trends'],
  };

  const lowerTopic = topic.toLowerCase();
  const keywords: string[] = [];

  for (const [pattern, relatedKeywords] of Object.entries(keywordPatterns)) {
    if (lowerTopic.includes(pattern)) {
      keywords.push(...relatedKeywords);
    }
  }

  // Always include the base topic as a keyword
  keywords.push(topic.toLowerCase());

  // Add wedding vendor base keywords
  keywords.push('wedding vendors', 'wedding business');

  // Deduplicate and limit
  return [...new Set(keywords)].slice(0, 5);
}

export function suggestSEOTopics(): string[] {
  return [
    'How to Market Your Wedding Photography Business in 2024',
    'Pricing Strategies for Wedding Vendors',
    'Building a Wedding Portfolio That Books Clients',
    'Social Media Tips for Wedding Professionals',
    'How to Network Effectively in the Wedding Industry',
    'Creating Memorable Client Experiences',
    'Wedding Industry Trends Every Vendor Should Know',
    'How to Get More Wedding Referrals',
    'Building Your Wedding Brand Identity',
    'Email Marketing for Wedding Vendors',
  ];
}
