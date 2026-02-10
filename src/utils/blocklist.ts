import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BlocklistConfig {
  domains: string[];
  description?: string;
}

let blocklist: BlocklistConfig | null = null;

export function loadBlocklist(): BlocklistConfig {
  if (blocklist) return blocklist;

  try {
    const configPath = join(__dirname, '../../config/blocklist.json');
    const content = readFileSync(configPath, 'utf-8');
    blocklist = JSON.parse(content) as BlocklistConfig;
    return blocklist;
  } catch (error) {
    console.warn('Warning: Could not load blocklist.json, using empty blocklist');
    blocklist = { domains: [] };
    return blocklist;
  }
}

export function isBlockedDomain(url: string): boolean {
  const config = loadBlocklist();

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return config.domains.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

export function filterBlockedUrls<T extends { url: string }>(results: T[]): T[] {
  return results.filter(result => !isBlockedDomain(result.url));
}

export function getBlockedDomains(): string[] {
  return loadBlocklist().domains;
}

/**
 * Remove any links to blocked domains from generated HTML.
 * Replaces <a> tags pointing to blocked domains with just their inner text.
 */
export function sanitizeBlockedLinks(html: string): string {
  const config = loadBlocklist();
  const domainPattern = config.domains.map(d => d.replace('.', '\\.')).join('|');
  if (!domainPattern) return html;

  // Remove <a> tags linking to blocked domains, keep inner text
  const linkRegex = new RegExp(
    `<a\\s[^>]*href=["'][^"']*(?:${domainPattern})[^"']*["'][^>]*>(.*?)<\\/a>`,
    'gi'
  );
  return html.replace(linkRegex, '$1');
}
