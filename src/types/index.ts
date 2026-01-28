export interface GhostConfig {
  url: string;
  key: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
  interviewsFolderId: string;
  ideasFolderId?: string;
}

export interface Article {
  title: string;
  slug: string;
  html: string;
  excerpt?: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  featureImage?: string;
  status: 'draft' | 'published';
}

export interface ArticleGenerationResult {
  article: Article;
  suggestedTags: string[];
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
}

export interface Interview {
  id: string;
  title: string;
  content: string;
  vendorName?: string;
  vendorType?: string;
  createdAt?: Date;
}

export interface ArticleIdea {
  id: string;
  title: string;
  content: string;
  createdAt?: Date;
}

export interface ExistingArticle {
  id: string;
  title: string;
  slug: string;
  publishedAt?: string;
}

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface GeneratorOptions {
  dryRun?: boolean;
  verbose?: boolean;
}
