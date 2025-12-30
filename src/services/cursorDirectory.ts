/**
 * Cursor Directory Integration Service
 * 
 * This service fetches and parses rules from cursor.directory,
 * a popular community-driven repository of cursor rules for AI coding assistants.
 */

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

// Cache for fetched rules
const rulesCache: Map<string, CursorDirectoryRule> = new Map();
const categoryCache: Map<string, CursorDirectoryRule[]> = new Map();

// Base URL for cursor.directory
const BASE_URL = 'https://cursor.directory';

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
    
    // Extract description from meta or first paragraph
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      || html.match(/<p[^>]*>([^<]+)<\/p>/i);
    const description = descMatch ? descMatch[1].trim() : `${title} cursor rules`;
    
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
 */
export async function fetchCursorDirectoryRule(slug: string, category: string = 'general'): Promise<CursorDirectoryRule | null> {
  // Check cache first
  const cacheKey = `${category}-${slug}`;
  if (rulesCache.has(cacheKey)) {
    return rulesCache.get(cacheKey)!;
  }
  
  try {
    const url = `${BASE_URL}/${slug}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StackGuide-MCP/1.0 (Cursor Rules Integration)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch rule ${slug}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    const rule = extractRuleFromHtml(html, slug, category);
    
    if (rule) {
      rulesCache.set(cacheKey, rule);
    }
    
    return rule;
  } catch (error) {
    console.error(`Error fetching cursor directory rule: ${error}`);
    return null;
  }
}

/**
 * Browse rules by category
 */
export async function browseCursorDirectoryCategory(category: string): Promise<CursorDirectoryRule[]> {
  // Check cache
  if (categoryCache.has(category)) {
    return categoryCache.get(category)!;
  }
  
  try {
    const url = `${BASE_URL}/rules/${category}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'StackGuide-MCP/1.0 (Cursor Rules Integration)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch category ${category}: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const slugs = parseCategoryPage(html);
    
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
    console.error(`Error browsing cursor directory category: ${error}`);
    return [];
  }
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
 * Clear the cursor directory cache
 */
export function clearCursorDirectoryCache(): void {
  rulesCache.clear();
  categoryCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { rules: number; categories: number } {
  return {
    rules: rulesCache.size,
    categories: categoryCache.size
  };
}
