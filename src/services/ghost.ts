import GhostAdminAPI from '@tryghost/admin-api';
import type { Article, ExistingArticle, GhostConfig } from '../types/index.js';
import { generateSlug } from '../utils/metadata.js';

let ghostClient: GhostAdminAPI | null = null;

export function initGhostClient(config: GhostConfig): void {
  ghostClient = new GhostAdminAPI({
    url: config.url,
    key: config.key,
    version: 'v5.87',
  });
}

export async function getExistingArticles(): Promise<ExistingArticle[]> {
  if (!ghostClient) throw new Error('Ghost client not initialized');

  const articles: ExistingArticle[] = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const response = await ghostClient.posts.browse({
        limit: 100,
        page,
        fields: 'id,title,slug,published_at',
        filter: 'status:[draft,published,scheduled]',
      });

      for (const post of response) {
        articles.push({
          id: post.id,
          title: post.title,
          slug: post.slug,
          publishedAt: post.published_at,
        });
      }

      hasMore = response.meta?.pagination?.next !== null;
      page++;
    }
  } catch (error: any) {
    console.error('Ghost API Error:', error.message || error);
    if (error.context) console.error('Context:', error.context);
    throw error;
  }

  return articles;
}

export interface DuplicateCheckResult {
  exactMatch: boolean;
  similarArticles: ExistingArticle[];
}

export async function checkArticleExists(title: string): Promise<DuplicateCheckResult> {
  const articles = await getExistingArticles();
  const slug = generateSlug(title);
  const lowerTitle = title.toLowerCase();

  // Exact match - same slug or exact title
  const exactMatch = articles.some(
    article =>
      article.slug === slug ||
      article.title.toLowerCase() === lowerTitle
  );

  // Similar articles - fuzzy matching for awareness
  const similarArticles = articles.filter(
    article =>
      article.title.toLowerCase().includes(lowerTitle) ||
      lowerTitle.includes(article.title.toLowerCase())
  );

  return { exactMatch, similarArticles };
}

export async function createDraftArticle(article: Article): Promise<{ id: string; url: string }> {
  if (!ghostClient) throw new Error('Ghost client not initialized');

  const postData: any = {
    title: article.title,
    slug: article.slug || generateSlug(article.title),
    html: article.html,
    status: 'draft',
  };

  if (article.excerpt) {
    postData.custom_excerpt = article.excerpt;
  }

  if (article.metaTitle) {
    postData.meta_title = article.metaTitle;
  }

  if (article.metaDescription) {
    postData.meta_description = article.metaDescription;
  }

  if (article.featureImage) {
    postData.feature_image = article.featureImage;
  }

  // Handle tags
  if (article.tags && article.tags.length > 0) {
    postData.tags = article.tags.map(tag => ({ name: tag }));
  }

  const post = await ghostClient.posts.add(postData, { source: 'html' });

  return {
    id: post.id,
    url: post.url,
  };
}

export async function searchExistingArticles(query: string): Promise<ExistingArticle[]> {
  const articles = await getExistingArticles();
  const lowerQuery = query.toLowerCase();

  return articles.filter(
    article =>
      article.title.toLowerCase().includes(lowerQuery) ||
      article.slug.includes(lowerQuery.replace(/\s+/g, '-'))
  );
}

export async function getRecentArticles(limit: number = 10): Promise<ExistingArticle[]> {
  if (!ghostClient) throw new Error('Ghost client not initialized');

  const response = await ghostClient.posts.browse({
    limit,
    order: 'published_at desc',
    fields: 'id,title,slug,published_at',
    filter: 'status:published',
  });

  return response.map(post => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    publishedAt: post.published_at,
  }));
}
