import { getAllInterviewsWithContent } from '../services/google-docs.js';
import { checkArticleExists, createDraftArticle } from '../services/ghost.js';
import { generateThemeArticle, analyzeInterviewsForThemes } from '../services/ai.js';
import { generateSlug, generateMetaTitle, generateMetaDescription, suggestTags } from '../utils/metadata.js';
import type { Interview, GeneratorOptions } from '../types/index.js';

export async function discoverThemes(
  folderId: string,
  options: GeneratorOptions = {}
): Promise<{ themes: string[]; interviewCount: number }> {
  try {
    if (options.verbose) console.log('Loading all interviews...');
    const interviews = await getAllInterviewsWithContent(folderId);

    if (interviews.length < 2) {
      return { themes: [], interviewCount: interviews.length };
    }

    if (options.verbose) console.log(`Analyzing ${interviews.length} interviews for themes...`);
    const themes = await analyzeInterviewsForThemes(interviews);

    return { themes, interviewCount: interviews.length };
  } catch (error) {
    console.error('Failed to discover themes:', error);
    return { themes: [], interviewCount: 0 };
  }
}

export async function generateThemeRoundup(
  folderId: string,
  themeFocus?: string,
  options: GeneratorOptions = {}
): Promise<{ success: boolean; message: string; articleUrl?: string }> {
  try {
    // Load all interviews
    if (options.verbose) console.log('Loading interviews...');
    const interviews = await getAllInterviewsWithContent(folderId);

    if (interviews.length < 2) {
      return {
        success: false,
        message: 'Need at least 2 interviews to create a theme roundup.',
      };
    }

    // If no specific theme, discover themes first
    let theme = themeFocus;
    if (!theme) {
      if (options.verbose) console.log('Discovering themes...');
      const themes = await analyzeInterviewsForThemes(interviews);
      if (themes.length === 0) {
        return {
          success: false,
          message: 'Could not identify compelling themes from the interviews.',
        };
      }
      theme = themes[0]; // Use the first suggested theme
      if (options.verbose) console.log(`Using theme: "${theme}"`);
    }

    // Check for duplicates
    if (options.verbose) console.log('Checking for existing articles...');
    const exists = await checkArticleExists(theme);
    if (exists) {
      return {
        success: false,
        message: `An article about "${theme}" may already exist. Check Ghost for duplicates.`,
      };
    }

    // Generate the article
    if (options.verbose) console.log('Generating theme roundup article...');
    const result = await generateThemeArticle(interviews);

    // Enhance metadata
    const article = result.article;
    if (!article.title) {
      article.title = theme;
    }
    article.slug = generateSlug(article.title);
    article.metaTitle = article.metaTitle || generateMetaTitle(article.title);
    article.metaDescription = article.metaDescription || generateMetaDescription(result.excerpt);

    // Add tags
    const autoTags = suggestTags(article.html, 'industry-insights');
    article.tags = [...new Set([...(article.tags || []), ...autoTags, 'roundup'])];

    if (options.dryRun) {
      return {
        success: true,
        message: `[DRY RUN] Would create theme roundup: "${article.title}"\nBased on ${interviews.length} interviews\nTags: ${article.tags?.join(', ')}`,
      };
    }

    // Create draft in Ghost
    if (options.verbose) console.log('Creating draft in Ghost...');
    const ghostResult = await createDraftArticle(article);

    return {
      success: true,
      message: `Created theme roundup: "${article.title}" (based on ${interviews.length} interviews)`,
      articleUrl: ghostResult.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to generate theme roundup: ${errorMessage}`,
    };
  }
}

export async function suggestThemeArticles(
  folderId: string,
  options: GeneratorOptions = {}
): Promise<string[]> {
  const { themes } = await discoverThemes(folderId, options);
  return themes;
}
