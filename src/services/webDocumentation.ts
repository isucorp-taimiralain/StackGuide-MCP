import { URL } from 'url';

// Web documentation structure
export interface WebDocument {
  id: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  fetchedAt: string;
  projectType?: string;
  category?: string;
  tags: string[];
}

// Web documents cache
const webDocCache: Map<string, WebDocument> = new Map();

// Extract main content from HTML
function extractMainContent(html: string): { title: string; content: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
  
  // Remove scripts, styles, navigation, footer, etc.
  let content = html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove navigation and footer
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    // Remove comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove unnecessary attributes
    .replace(/<([a-z]+)[^>]*>/gi, '<$1>');
  
  // Buscar contenido principal (article, main, o el body)
  const mainMatch = content.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (mainMatch) {
    content = mainMatch[1];
  } else {
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
    }
  }
  
  // Convert to clean text while maintaining structure
  content = content
    // Convert headers to markdown
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
    // Convert lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[ou]l[^>]*>/gi, '\n')
    // Convert paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    // Convert code
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Convert links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Convert bold and italic
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, '*$1*')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean multiple spaces
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return { title, content };
}

// Generate content summary
function generateSummary(content: string, maxLength: number = 500): string {
  const lines = content.split('\n').filter(l => l.trim());
  let summary = '';
  
  for (const line of lines) {
    if (summary.length + line.length > maxLength) break;
    if (!line.startsWith('#') && !line.startsWith('```')) {
      summary += line + ' ';
    }
  }
  
  return summary.trim().substring(0, maxLength) + (summary.length > maxLength ? '...' : '');
}

// Fetch and process web documentation
export async function fetchWebDocumentation(
  url: string,
  options: {
    projectType?: string;
    category?: string;
    tags?: string[];
  } = {}
): Promise<WebDocument> {
  // Check cache
  if (webDocCache.has(url)) {
    return webDocCache.get(url)!;
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  // Fetch content
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'StackGuide-MCP/1.0 (Documentation Fetcher)',
      'Accept': 'text/html,application/xhtml+xml,text/plain,text/markdown'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type') || '';
  let content: string;
  let title: string;
  
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const extracted = extractMainContent(html);
    content = extracted.content;
    title = extracted.title;
  } else if (contentType.includes('text/markdown') || url.endsWith('.md')) {
    content = await response.text();
    const titleMatch = content.match(/^#\s+(.+)$/m);
    title = titleMatch ? titleMatch[1] : new URL(url).pathname.split('/').pop() || 'Untitled';
  } else {
    content = await response.text();
    title = new URL(url).pathname.split('/').pop() || 'Untitled';
  }
  
  const doc: WebDocument = {
    id: `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    url,
    title,
    content,
    summary: generateSummary(content),
    fetchedAt: new Date().toISOString(),
    projectType: options.projectType,
    category: options.category,
    tags: options.tags || []
  };
  
  // Save to cache
  webDocCache.set(url, doc);
  
  return doc;
}

// Fetch multiple URLs
export async function fetchMultipleDocuments(
  urls: string[],
  options: {
    projectType?: string;
    category?: string;
  } = {}
): Promise<{ successful: WebDocument[]; failed: { url: string; error: string }[] }> {
  const results = await Promise.allSettled(
    urls.map(url => fetchWebDocumentation(url, options))
  );
  
  const successful: WebDocument[] = [];
  const failed: { url: string; error: string }[] = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push({
        url: urls[index],
        error: result.reason?.message || 'Unknown error'
      });
    }
  });
  
  return { successful, failed };
}

// Search in cached documents
export function searchWebDocuments(query: string): WebDocument[] {
  const results: WebDocument[] = [];
  const queryLower = query.toLowerCase();
  
  for (const doc of webDocCache.values()) {
    if (
      doc.title.toLowerCase().includes(queryLower) ||
      doc.content.toLowerCase().includes(queryLower) ||
      doc.tags.some(t => t.toLowerCase().includes(queryLower))
    ) {
      results.push(doc);
    }
  }
  
  return results;
}

// Get document by ID
export function getWebDocumentById(id: string): WebDocument | null {
  for (const doc of webDocCache.values()) {
    if (doc.id === id) return doc;
  }
  return null;
}

// Get document by URL
export function getWebDocumentByUrl(url: string): WebDocument | null {
  return webDocCache.get(url) || null;
}

// List all cached documents
export function listCachedDocuments(): Omit<WebDocument, 'content'>[] {
  return Array.from(webDocCache.values()).map(doc => ({
    id: doc.id,
    url: doc.url,
    title: doc.title,
    summary: doc.summary,
    fetchedAt: doc.fetchedAt,
    projectType: doc.projectType,
    category: doc.category,
    tags: doc.tags
  }));
}

// Clear cache
export function clearWebDocCache(): void {
  webDocCache.clear();
}

// Remove document from cache
export function removeFromCache(urlOrId: string): boolean {
  if (webDocCache.has(urlOrId)) {
    webDocCache.delete(urlOrId);
    return true;
  }
  
  for (const [url, doc] of webDocCache.entries()) {
    if (doc.id === urlOrId) {
      webDocCache.delete(url);
      return true;
    }
  }
  
  return false;
}

// Popular documentation URLs by framework
export const POPULAR_DOCS: Record<string, { name: string; url: string }[]> = {
  'python-django': [
    { name: 'Django Documentation', url: 'https://docs.djangoproject.com/en/stable/' },
    { name: 'Django REST Framework', url: 'https://www.django-rest-framework.org/' },
    { name: 'Django Best Practices', url: 'https://docs.djangoproject.com/en/stable/misc/design-philosophies/' }
  ],
  'react-node': [
    { name: 'React Documentation', url: 'https://react.dev/learn' },
    { name: 'React Hooks', url: 'https://react.dev/reference/react' },
    { name: 'Node.js Documentation', url: 'https://nodejs.org/docs/latest/api/' },
    { name: 'Express.js Guide', url: 'https://expressjs.com/en/guide/routing.html' }
  ],
  'nextjs': [
    { name: 'Next.js Documentation', url: 'https://nextjs.org/docs' },
    { name: 'Next.js App Router', url: 'https://nextjs.org/docs/app' },
    { name: 'Next.js API Routes', url: 'https://nextjs.org/docs/pages/building-your-application/routing/api-routes' }
  ],
  'typescript': [
    { name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/' },
    { name: 'TypeScript Deep Dive', url: 'https://basarat.gitbook.io/typescript/' }
  ]
};

// Get suggested documentation URLs
export function getSuggestedDocs(projectType: string): { name: string; url: string }[] {
  return POPULAR_DOCS[projectType] || [];
}
