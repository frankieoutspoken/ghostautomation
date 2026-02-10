import { getInterview, listInterviews } from '../services/google-docs.js';
import { checkArticleExists, createDraftArticle } from '../services/ghost.js';
import { generateInterviewArticle } from '../services/ai.js';
import { generateSlug, generateMetaTitle, generateMetaDescription, suggestTags } from '../utils/metadata.js';
import type { Interview, GeneratorOptions, Article } from '../types/index.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

// Cache generated content to ensure preview matches final upload
const CACHE_DIR = '/tmp/ghost-agent-cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachePath(documentId: string): string {
  return `${CACHE_DIR}/${documentId}.json`;
}

function getCachedArticle(documentId: string): { article: Article; excerpt: string } | null {
  try {
    const path = getCachePath(documentId);
    if (!existsSync(path)) return null;

    const data = JSON.parse(readFileSync(path, 'utf-8'));
    if (Date.now() - data.timestamp > CACHE_TTL) return null;

    return { article: data.article, excerpt: data.excerpt };
  } catch {
    return null;
  }
}

function cacheArticle(documentId: string, article: Article, excerpt: string): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(getCachePath(documentId), JSON.stringify({
      article,
      excerpt,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Failed to cache article:', e);
  }
}

export async function generateFromInterview(
  documentId: string,
  options: GeneratorOptions = {}
): Promise<{ success: boolean; message: string; articleUrl?: string; preview?: string }> {
  try {
    // Check cache first - use cached content if available (ensures preview = final)
    const cached = getCachedArticle(documentId);

    let article: Article;
    let excerpt: string;

    if (cached && !options.dryRun) {
      // Use cached content for final upload (matches what user previewed)
      article = cached.article;
      excerpt = cached.excerpt;
    } else {
      // Fetch the interview
      if (options.verbose) console.log('Fetching interview document...');
      const interview = await getInterview(documentId);

      if (!interview.content || interview.content.trim().length < 100) {
        return {
          success: false,
          message: 'Interview document appears to be empty or too short.',
        };
      }

      // Generate the article
      if (options.verbose) console.log('Generating article with AI...');
      const result = await generateInterviewArticle(interview);

      // Enhance metadata
      article = result.article;
      const vendorName = interview.vendorName || interview.title;
      article.slug = generateSlug(article.title || vendorName);
      article.metaTitle = article.metaTitle || generateMetaTitle(article.title);
      article.metaDescription = article.metaDescription || generateMetaDescription(result.excerpt);

      // Add/merge tags
      const autoTags = suggestTags(interview.content, interview.vendorType);
      article.tags = [...new Set([...(article.tags || []), ...autoTags])];
      excerpt = result.excerpt;

      // Cache for later confirmation
      cacheArticle(documentId, article, excerpt);
    }

    if (options.dryRun) {
      // Return full preview with exact content that will be uploaded
      const preview = `
**Title:** ${article.title}

**Tags:** ${article.tags?.join(', ')}

**Meta Description:** ${article.metaDescription}

**Excerpt:** ${excerpt}

---

**Article HTML Preview:**

${article.html}
`.trim();

      return {
        success: true,
        message: `Preview generated. Call again without dryRun to publish this exact content as a draft.`,
        preview,
      };
    }

    // Check for duplicates only when actually publishing
    if (options.verbose) console.log('Checking for existing articles...');
    const duplicateCheck = await checkArticleExists(article.title || '');

    if (duplicateCheck.exactMatch) {
      return {
        success: false,
        message: `An article with exact title "${article.title}" already exists. Check Ghost for duplicates.`,
      };
    }

    // Warn about similar articles but don't block
    let similarWarning = '';
    if (duplicateCheck.similarArticles.length > 0) {
      const titles = duplicateCheck.similarArticles.slice(0, 3).map(a => a.title).join(', ');
      similarWarning = `\n\nNote: Found similar articles: ${titles}`;
    }

    // Create draft in Ghost
    if (options.verbose) console.log('Creating draft in Ghost...');
    const ghostResult = await createDraftArticle(article);

    return {
      success: true,
      message: `Created draft article: "${article.title}"${similarWarning}`,
      articleUrl: ghostResult.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to generate article: ${errorMessage}`,
    };
  }
}

export async function listAvailableInterviews(
  folderId: string
): Promise<Interview[]> {
  return listInterviews(folderId);
}
