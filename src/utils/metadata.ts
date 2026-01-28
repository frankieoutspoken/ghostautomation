export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

export function generateMetaTitle(title: string): string {
  const suffix = " | Pretty's Perspectives";
  const maxTitleLength = 60 - suffix.length;
  const truncatedTitle = truncateText(title, maxTitleLength);
  return truncatedTitle + suffix;
}

export function generateMetaDescription(excerpt: string): string {
  return truncateText(excerpt, 155);
}

export function extractExcerpt(html: string, maxLength: number = 300): string {
  // Remove HTML tags
  const text = html.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncateText(text, maxLength);
}

export function normalizeTags(tags: string[]): string[] {
  return tags.map(tag =>
    tag.toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
  ).filter(tag => tag.length > 0);
}

export function suggestTags(content: string, vendorType?: string): string[] {
  const tags: Set<string> = new Set();

  // Add vendor type if provided
  if (vendorType) {
    tags.add(vendorType.toLowerCase());
  }

  // Common wedding-related keywords to check
  const keywordMap: Record<string, string> = {
    'photographer': 'photography',
    'photography': 'photography',
    'videographer': 'videography',
    'videography': 'videography',
    'planner': 'wedding-planning',
    'planning': 'wedding-planning',
    'florist': 'florals',
    'flowers': 'florals',
    'floral': 'florals',
    'venue': 'venues',
    'catering': 'catering',
    'caterer': 'catering',
    'dj': 'entertainment',
    'band': 'entertainment',
    'musician': 'entertainment',
    'makeup': 'beauty',
    'hair': 'beauty',
    'dress': 'fashion',
    'bridal': 'bridal',
    'groom': 'groom-style',
    'invitation': 'stationery',
    'stationery': 'stationery',
    'cake': 'wedding-cakes',
    'dessert': 'desserts',
    'decor': 'decor',
    'design': 'design',
    'marketing': 'vendor-tips',
    'business': 'vendor-tips',
    'tips': 'vendor-tips',
    'advice': 'advice'
  };

  const lowerContent = content.toLowerCase();

  for (const [keyword, tag] of Object.entries(keywordMap)) {
    if (lowerContent.includes(keyword)) {
      tags.add(tag);
    }
  }

  // Always add the base tag
  tags.add('wedding-vendors');

  return Array.from(tags).slice(0, 8); // Limit to 8 tags
}
