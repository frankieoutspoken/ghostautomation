import { getAllInterviewsWithContent, getInterview } from '../services/google-docs.js';
import { checkArticleExists, createDraftArticle } from '../services/ghost.js';
import { generateInsightArticle, extractInsightsFromInterview } from '../services/ai.js';
import { researchTopic, isResearchAvailable } from '../services/research.js';
import { generateSlug, generateMetaTitle, generateMetaDescription, suggestTags } from '../utils/metadata.js';
import type { GeneratorOptions } from '../types/index.js';

export interface InsightSuggestion {
  insight: string;
  vendorName: string;
  interviewId: string;
}

export async function discoverInsights(
  folderId: string,
  options: GeneratorOptions = {}
): Promise<InsightSuggestion[]> {
  try {
    if (options.verbose) console.log('Loading interviews...');
    const interviews = await getAllInterviewsWithContent(folderId);

    const allInsights: InsightSuggestion[] = [];

    for (const interview of interviews) {
      if (options.verbose) console.log(`Extracting insights from: ${interview.title}`);
      const insights = await extractInsightsFromInterview(interview);

      for (const insight of insights) {
        allInsights.push({
          insight,
          vendorName: interview.vendorName || interview.title,
          interviewId: interview.id,
        });
      }
    }

    return allInsights;
  } catch (error) {
    console.error('Failed to discover insights:', error);
    return [];
  }
}

export async function generateFromInsight(
  insight: string,
  vendorName: string,
  options: GeneratorOptions = {}
): Promise<{ success: boolean; message: string; articleUrl?: string }> {
  try {
    // Check for duplicates
    if (options.verbose) console.log('Checking for existing articles...');
    const exists = await checkArticleExists(insight.slice(0, 50));
    if (exists) {
      return {
        success: false,
        message: 'A similar article may already exist. Check Ghost for duplicates.',
      };
    }

    // Research the topic
    let researchContext = 'No additional research available.';
    if (isResearchAvailable()) {
      if (options.verbose) console.log('Researching topic...');
      researchContext = await researchTopic(insight);
    }

    // Generate the article
    if (options.verbose) console.log('Generating article...');
    const result = await generateInsightArticle(insight, vendorName, researchContext);

    // Enhance metadata
    const article = result.article;
    article.slug = generateSlug(article.title || insight.slice(0, 50));
    article.metaTitle = article.metaTitle || generateMetaTitle(article.title);
    article.metaDescription = article.metaDescription || generateMetaDescription(result.excerpt);

    // Add tags
    const autoTags = suggestTags(article.html);
    article.tags = [...new Set([...(article.tags || []), ...autoTags, 'insights'])];

    if (options.dryRun) {
      return {
        success: true,
        message: `[DRY RUN] Would create insight article: "${article.title}"\nBased on insight from ${vendorName}\nTags: ${article.tags?.join(', ')}`,
      };
    }

    // Create draft in Ghost
    if (options.verbose) console.log('Creating draft in Ghost...');
    const ghostResult = await createDraftArticle(article);

    return {
      success: true,
      message: `Created insight article: "${article.title}"`,
      articleUrl: ghostResult.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to generate insight article: ${errorMessage}`,
    };
  }
}

export async function generateFromInterviewInsights(
  documentId: string,
  options: GeneratorOptions = {}
): Promise<InsightSuggestion[]> {
  try {
    if (options.verbose) console.log('Loading interview...');
    const interview = await getInterview(documentId);

    if (options.verbose) console.log('Extracting insights...');
    const insights = await extractInsightsFromInterview(interview);

    return insights.map(insight => ({
      insight,
      vendorName: interview.vendorName || interview.title,
      interviewId: interview.id,
    }));
  } catch (error) {
    console.error('Failed to extract insights:', error);
    return [];
  }
}
