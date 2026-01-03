/**
 * Cursor Directory Integration Service
 * 
 * This service fetches and parses rules from cursor.directory,
 * a popular community-driven repository of cursor rules for AI coding assistants.
 * 
 * Features:
 * - Persistent disk cache for offline access
 * - Automatic fallback to cached rules when offline
 * - TTL-based cache invalidation
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { safeFetch } from '../utils/safeFetch.js';
import { sanitizeForPrompt } from '../validation/schemas.js';

// Structure for a cursor.directory rule
export interface CursorDirectoryRule {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  url: string;
  fetchedAt: string;
}

// Persistent cache structure
interface PersistentCache {
  version: string;
  lastSync: string;
  rules: Record<string, CursorDirectoryRule>;
  categories: Record<string, string[]>; // category -> slugs
}

const CACHE_VERSION = '1.1.0';
const CACHE_DIR = '.stackguide';
const CACHE_FILE = 'cursor-rules-cache.json';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Security: allowed hosts and limits
const ALLOWED_HOSTS = ['cursor.directory'];
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB
const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const MAX_CONTENT_LENGTH = 50000; // 50KB max rule content

// Validate slug format to prevent path traversal
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,100}$/.test(slug);
}

// Categories available on cursor.directory
export const CURSOR_DIRECTORY_CATEGORIES = [
  'typescript',
  'python',
  'next.js',
  'react',
  'php',
  'javascript',
  'tailwindcss',
  'laravel',
  'c',
  'web-development',
  'game-development',
  'expo',
  'react-native',
  'flutter',
  'tailwind',
  'testing',
  'vite',
  'supabase',
  'vue',
  'svelte',
  'rust',
  'go',
  'swift',
  'kotlin',
  'java',
  'ruby',
  'django',
  'fastapi',
  'node.js',
  'express',
  'nestjs',
  'prisma',
  'mongodb',
  'postgresql',
  'graphql',
  'aws',
  'docker',
  'kubernetes'
] as const;

export type CursorDirectoryCategory = typeof CURSOR_DIRECTORY_CATEGORIES[number];

// Cache for fetched rules (in-memory)
const rulesCache: Map<string, CursorDirectoryRule> = new Map();
const categoryCache: Map<string, CursorDirectoryRule[]> = new Map();

// Persistent cache state
let persistentCache: PersistentCache | null = null;
let isOnline = true;

// Base URL for cursor.directory
const BASE_URL = 'https://cursor.directory';

/**
 * Get the path to the persistent cache file
 */
function getCacheFilePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, CACHE_DIR, CACHE_FILE);
}

/**
 * Load persistent cache from disk
 */
function loadPersistentCache(): PersistentCache {
  if (persistentCache) {
    return persistentCache;
  }
  
  const cachePath = getCacheFilePath();
  
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(data) as PersistentCache;
      
      if (cache.version === CACHE_VERSION) {
        persistentCache = cache;
        logger.debug('Loaded cursor directory cache', { 
          rules: Object.keys(cache.rules).length,
          categories: Object.keys(cache.categories).length 
        });
        return cache;
      }
    }
  } catch (error) {
    logger.debug('Failed to load cursor directory cache', { error });
  }
  
  persistentCache = createEmptyCache();
  return persistentCache;
}

/**
 * Save persistent cache to disk
 */
function savePersistentCache(): void {
  if (!persistentCache) return;
  
  const cachePath = getCacheFilePath();
  const cacheDir = path.dirname(cachePath);
  
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    persistentCache.lastSync = new Date().toISOString();
    fs.writeFileSync(cachePath, JSON.stringify(persistentCache, null, 2));
    logger.debug('Saved cursor directory cache');
  } catch (error) {
    logger.debug('Failed to save cursor directory cache', { error });
  }
}

/**
 * Create empty persistent cache
 */
function createEmptyCache(): PersistentCache {
  return {
    version: CACHE_VERSION,
    lastSync: new Date().toISOString(),
    rules: {},
    categories: {}
  };
}

/**
 * Check if we have internet connectivity
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${BASE_URL}/robots.txt`, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    isOnline = response.ok;
    return isOnline;
  } catch {
    isOnline = false;
    return false;
  }
}

/**
 * Get rule from persistent cache
 */
function getCachedRule(slug: string, category: string): CursorDirectoryRule | null {
  const cache = loadPersistentCache();
  const cacheKey = `${category}-${slug}`;
  
  const cached = cache.rules[cacheKey];
  if (cached) {
    // Check if cache is still valid (within TTL)
    const fetchedAt = new Date(cached.fetchedAt).getTime();
    if (Date.now() - fetchedAt < CACHE_TTL) {
      return cached;
    }
  }
  
  return null;
}

/**
 * Store rule in persistent cache
 */
function cacheRule(rule: CursorDirectoryRule): void {
  const cache = loadPersistentCache();
  const cacheKey = `${rule.category}-${rule.slug}`;
  cache.rules[cacheKey] = rule;
  savePersistentCache();
}

/**
 * Store category slugs in persistent cache
 */
function cacheCategory(category: string, slugs: string[]): void {
  const cache = loadPersistentCache();
  cache.categories[category] = slugs;
  savePersistentCache();
}

/**
 * Get cached slugs for a category
 */
function getCachedCategorySlugs(category: string): string[] | null {
  const cache = loadPersistentCache();
  return cache.categories[category] || null;
}

/**
 * Extract rule content from cursor.directory HTML page
 */
function extractRuleFromHtml(html: string, slug: string, category: string): CursorDirectoryRule | null {
  try {
    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) 
      || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' - cursor.directory', '').trim() : slug;
    
    // Find the main rule content - usually in a pre or code block
    let content = '';
    
    // Look for rule content in various formats
    const preMatch = html.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);
    if (preMatch) {
      content = preMatch[1];
    } else {
      // Try to find content in a div with specific classes
      const contentMatch = html.match(/class="[^"]*prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (contentMatch) {
        content = contentMatch[1];
      }
    }
    
    // Clean HTML from content
    content = cleanHtmlContent(content);
    
    // Security: sanitize content to prevent prompt injection
    content = sanitizeForPrompt(content, MAX_CONTENT_LENGTH);
    
    // Reject empty or suspiciously short content
    if (!content || content.length < 10) {
      logger.warn('Rejected rule with empty/invalid content', { slug, category });
      return null;
    }
    
    // Extract description from meta or first paragraph
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      || html.match(/<p[^>]*>([^<]+)<\/p>/i);
    const description = descMatch ? sanitizeForPrompt(descMatch[1].trim(), 500) : `${title} cursor rules`;
    
    // Extract tags from content
    const tags = extractTagsFromContent(content, category);
    
    return {
      id: `cursor-directory-${category}-${slug}`,
      slug,
      title,
      description,
      content,
      category,
      tags,
      url: `${BASE_URL}/${slug}`,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error extracting rule from HTML: ${error}`);
    return null;
  }
}

/**
 * Clean HTML content and convert to plain text/markdown
 */
function cleanHtmlContent(html: string): string {
  return html
    // Decode HTML entities first
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    // Convert headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    // Convert lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[ou]l[^>]*>/gi, '\n')
    // Convert paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    // Convert code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Convert emphasis
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, '*$1*')
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Clean whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extract relevant tags from rule content
 */
function extractTagsFromContent(content: string, category: string): string[] {
  const tags = new Set<string>([category]);
  
  // Common technology patterns to detect
  const patterns: Record<string, RegExp> = {
    'typescript': /typescript|\.ts\b/i,
    'javascript': /javascript|\.js\b/i,
    'react': /\breact\b|jsx|tsx/i,
    'next.js': /next\.?js|nextjs/i,
    'vue': /\bvue\b|vuejs/i,
    'svelte': /\bsvelte\b/i,
    'angular': /\bangular\b/i,
    'node.js': /node\.?js|nodejs/i,
    'python': /\bpython\b|\.py\b/i,
    'django': /\bdjango\b/i,
    'fastapi': /\bfastapi\b/i,
    'flask': /\bflask\b/i,
    'tailwindcss': /tailwind/i,
    'prisma': /\bprisma\b/i,
    'graphql': /\bgraphql\b/i,
    'rest-api': /rest\s*api|restful/i,
    'testing': /\btest\b|jest|vitest|playwright|cypress/i,
    'docker': /\bdocker\b/i,
    'kubernetes': /\bkubernetes\b|k8s/i,
    'aws': /\baws\b|amazon web services/i,
    'supabase': /\bsupabase\b/i,
    'firebase': /\bfirebase\b/i,
    'mongodb': /\bmongodb\b|mongo\b/i,
    'postgresql': /\bpostgresql\b|postgres\b/i,
    'mysql': /\bmysql\b/i,
    'redis': /\bredis\b/i,
    'security': /security|authentication|authorization/i,
    'performance': /performance|optimization|caching/i,
    'accessibility': /accessibility|a11y|aria/i,
    'seo': /\bseo\b|search engine/i
  };
  
  for (const [tag, pattern] of Object.entries(patterns)) {
    if (pattern.test(content)) {
      tags.add(tag);
    }
  }
  
  return Array.from(tags);
}

/**
 * Parse category page to extract rule links
 */
function parseCategoryPage(html: string): string[] {
  const slugs: string[] = [];
  
  // Find all rule links on the category page
  const linkPattern = /href="\/([a-z0-9-]+)"/gi;
  let match;
  
  while ((match = linkPattern.exec(html)) !== null) {
    const slug = match[1];
    // Filter out non-rule links
    if (slug && 
        !slug.startsWith('rules/') && 
        !['login', 'rules', 'board', 'jobs', 'mcp', 'generate', 'members'].includes(slug) &&
        !slug.includes('/')) {
      slugs.push(slug);
    }
  }
  
  return [...new Set(slugs)]; // Remove duplicates
}

/**
 * Fetch a single rule from cursor.directory
 * Falls back to cached version if offline
 */
export async function fetchCursorDirectoryRule(slug: string, category: string = 'general'): Promise<CursorDirectoryRule | null> {
  // Security: validate slug format
  if (!isValidSlug(slug)) {
    logger.audit('INVALID_SLUG_REJECTED', { slug, category, action: 'slug_validation_failed' });
    return null;
  }
  
  // Check in-memory cache first
  const cacheKey = `${category}-${slug}`;
  if (rulesCache.has(cacheKey)) {
    return rulesCache.get(cacheKey)!;
  }
  
  // Check persistent cache
  const cachedRule = getCachedRule(slug, category);
  
  // Check connectivity
  const online = await checkConnectivity();
  
  if (!online) {
    if (cachedRule) {
      logger.debug('Offline: using cached rule', { slug });
      rulesCache.set(cacheKey, cachedRule);
      return cachedRule;
    }
    logger.debug('Offline: no cached rule available', { slug });
    return null;
  }
  
  try {
    const url = `${BASE_URL}/${slug}`;
    
    // Security: use safeFetch with limits
    const response = await safeFetch(url, {
      allowedHosts: ALLOWED_HOSTS,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      fetchOptions: {
        headers: {
          'User-Agent': 'StackGuide-MCP/3.8.0 (Cursor Rules Integration)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }
    });
    
    if (!response.ok) {
      logger.debug(`Failed to fetch rule ${slug}: ${response.status}`);
      // Return cached version if available
      if (cachedRule) {
        rulesCache.set(cacheKey, cachedRule);
        return cachedRule;
      }
      return null;
    }
    
    const html = await response.text();
    const rule = extractRuleFromHtml(html, slug, category);
    
    if (rule) {
      rulesCache.set(cacheKey, rule);
      cacheRule(rule); // Persist to disk
    }
    
    return rule;
  } catch (error) {
    logger.debug(`Error fetching cursor directory rule: ${error}`);
    // Return cached version on error
    if (cachedRule) {
      rulesCache.set(cacheKey, cachedRule);
      return cachedRule;
    }
    return null;
  }
}

/**
 * Browse rules by category
 * Falls back to cached rules if offline
 */
export async function browseCursorDirectoryCategory(category: string): Promise<CursorDirectoryRule[]> {
  // Check in-memory cache
  if (categoryCache.has(category)) {
    return categoryCache.get(category)!;
  }
  
  // Check connectivity
  const online = await checkConnectivity();
  
  if (!online) {
    // Try to load from persistent cache
    const cachedSlugs = getCachedCategorySlugs(category);
    if (cachedSlugs) {
      const rules: CursorDirectoryRule[] = [];
      for (const slug of cachedSlugs) {
        const rule = getCachedRule(slug, category);
        if (rule) {
          rules.push(rule);
        }
      }
      if (rules.length > 0) {
        logger.debug('Offline: using cached category rules', { category, count: rules.length });
        categoryCache.set(category, rules);
        return rules;
      }
    }
    logger.debug('Offline: no cached rules for category', { category });
    return [];
  }
  
  try {
    const url = `${BASE_URL}/rules/${category}`;
    
    // Security: use safeFetch with limits
    const response = await safeFetch(url, {
      allowedHosts: ALLOWED_HOSTS,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      fetchOptions: {
        headers: {
          'User-Agent': 'StackGuide-MCP/3.8.0 (Cursor Rules Integration)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }
    });
    
    if (!response.ok) {
      logger.debug(`Failed to fetch category ${category}: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const slugs = parseCategoryPage(html);
    
    // Cache the slugs
    cacheCategory(category, slugs);
    
    // Fetch first 10 rules to avoid too many requests
    const rules: CursorDirectoryRule[] = [];
    for (const slug of slugs.slice(0, 10)) {
      const rule = await fetchCursorDirectoryRule(slug, category);
      if (rule) {
        rules.push(rule);
      }
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    categoryCache.set(category, rules);
    return rules;
  } catch (error) {
    logger.debug(`Error browsing cursor directory category: ${error}`);
    return [];
  }
}

/**
 * Sync cache - fetch and cache popular rules for offline use
 */
export async function syncCursorDirectoryCache(): Promise<{ synced: number; errors: number }> {
  const online = await checkConnectivity();
  if (!online) {
    return { synced: 0, errors: 0 };
  }
  
  let synced = 0;
  let errors = 0;
  
  // Sync popular rules
  const popularSlugs = [
    { slug: 'nextjs-react-typescript-cursor-rules', category: 'typescript' },
    { slug: 'react-native-cursor-rules', category: 'react-native' },
    { slug: 'python-django-cursor-rules', category: 'python' },
    { slug: 'fastapi-python-cursor-rules', category: 'python' },
    { slug: 'vuejs-typescript-best-practices', category: 'vue' },
    { slug: 'tailwind-css-cursor-rules', category: 'tailwindcss' },
    { slug: 'prisma-orm-cursor-rules', category: 'prisma' },
    { slug: 'nestjs-clean-typescript-cursor-rules', category: 'typescript' }
  ];
  
  for (const { slug, category } of popularSlugs) {
    try {
      const rule = await fetchCursorDirectoryRule(slug, category);
      if (rule) {
        synced++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  logger.debug('Cursor directory cache synced', { synced, errors });
  return { synced, errors };
}

/**
 * Check if we're currently online
 */
export function isCurrentlyOnline(): boolean {
  return isOnline;
}

/**
 * Get persistent cache statistics
 */
export function getPersistentCacheStats(): { 
  rules: number; 
  categories: number; 
  lastSync: string | null;
  isOnline: boolean;
} {
  const cache = loadPersistentCache();
  return {
    rules: Object.keys(cache.rules).length,
    categories: Object.keys(cache.categories).length,
    lastSync: cache.lastSync,
    isOnline
  };
}

/**
 * Search for rules across cursor.directory
 */
export async function searchCursorDirectory(query: string): Promise<CursorDirectoryRule[]> {
  const results: CursorDirectoryRule[] = [];
  const queryLower = query.toLowerCase();
  
  // First check in cache
  for (const rule of rulesCache.values()) {
    if (rule.title.toLowerCase().includes(queryLower) ||
        rule.description.toLowerCase().includes(queryLower) ||
        rule.tags.some(t => t.toLowerCase().includes(queryLower))) {
      results.push(rule);
    }
  }
  
  // If we found results in cache, return them
  if (results.length > 0) {
    return results;
  }
  
  // Otherwise, try to search by matching category
  const matchingCategories = CURSOR_DIRECTORY_CATEGORIES.filter(cat => 
    cat.toLowerCase().includes(queryLower) || queryLower.includes(cat)
  );
  
  for (const category of matchingCategories.slice(0, 3)) {
    const categoryRules = await browseCursorDirectoryCategory(category);
    results.push(...categoryRules);
  }
  
  return results;
}

/**
 * Get list of available categories
 */
export function getCursorDirectoryCategories(): string[] {
  return [...CURSOR_DIRECTORY_CATEGORIES];
}

/**
 * Get popular/featured rules
 */
export async function getPopularCursorDirectoryRules(): Promise<CursorDirectoryRule[]> {
  const popularSlugs = [
    { slug: 'nextjs-react-typescript-cursor-rules', category: 'typescript' },
    { slug: 'react-native-cursor-rules', category: 'react-native' },
    { slug: 'python-django-cursor-rules', category: 'python' },
    { slug: 'fastapi-python-cursor-rules', category: 'python' },
    { slug: 'vuejs-typescript-best-practices', category: 'vue' },
    { slug: 'tailwind-css-cursor-rules', category: 'tailwindcss' },
    { slug: 'prisma-orm-cursor-rules', category: 'prisma' },
    { slug: 'nestjs-clean-typescript-cursor-rules', category: 'typescript' }
  ];
  
  const rules: CursorDirectoryRule[] = [];
  
  for (const { slug, category } of popularSlugs) {
    const rule = await fetchCursorDirectoryRule(slug, category);
    if (rule) {
      rules.push(rule);
    }
  }
  
  return rules;
}

/**
 * Import a rule from cursor.directory into user's local rules
 */
export function formatRuleForImport(rule: CursorDirectoryRule): string {
  return `# ${rule.title}

> Imported from cursor.directory
> URL: ${rule.url}
> Category: ${rule.category}
> Tags: ${rule.tags.join(', ')}

---

${rule.content}

---
*Fetched: ${rule.fetchedAt}*
`;
}

/**
 * Clear the cursor directory cache (both in-memory and persistent)
 */
export function clearCursorDirectoryCache(): void {
  rulesCache.clear();
  categoryCache.clear();
  persistentCache = createEmptyCache();
  savePersistentCache();
}

/**
 * Get cache stats (in-memory)
 */
export function getCacheStats(): { rules: number; categories: number } {
  return {
    rules: rulesCache.size,
    categories: categoryCache.size
  };
}
