import { URL } from 'url';
import { logger } from '../utils/logger.js';

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

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG = {
  maxRequests: 30,       // Max requests per window
  windowMs: 60000,       // 1 minute window
  blockDurationMs: 300000 // 5 minute block after exceeding
};

/**
 * Check if request is rate limited
 * Uses sliding window algorithm
 */
function checkRateLimit(identifier: string = 'global'): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry) {
    rateLimitStore.set(identifier, { count: 1, windowStart: now });
    return { allowed: true };
  }
  
  // Check if window has expired
  if (now - entry.windowStart > RATE_LIMIT_CONFIG.windowMs) {
    rateLimitStore.set(identifier, { count: 1, windowStart: now });
    return { allowed: true };
  }
  
  // Check if limit exceeded
  if (entry.count >= RATE_LIMIT_CONFIG.maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_CONFIG.blockDurationMs - now) / 1000);
    logger.warn('Rate limit exceeded', { 
      identifier, 
      count: entry.count, 
      retryAfter,
      action: 'rate_limit_block'
    });
    return { allowed: false, retryAfter };
  }
  
  // Increment counter
  entry.count++;
  return { allowed: true };
}

/**
 * Get rate limit status for monitoring
 */
export function getRateLimitStatus(): { 
  currentRequests: number; 
  maxRequests: number; 
  windowMs: number;
  resetIn: number;
} {
  const entry = rateLimitStore.get('global');
  const now = Date.now();
  
  return {
    currentRequests: entry?.count || 0,
    maxRequests: RATE_LIMIT_CONFIG.maxRequests,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
    resetIn: entry ? Math.max(0, entry.windowStart + RATE_LIMIT_CONFIG.windowMs - now) : 0
  };
}

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

// SSRF Protection: Block internal/private network URLs
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS/Cloud metadata
  'metadata.google.internal', // GCP metadata
  'metadata.azure.com', // Azure metadata
];

const PRIVATE_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\./,  // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^127\./,                   // 127.0.0.0/8 loopback
  /^169\.254\./,              // Link-local
  /^fc00:/i,                  // IPv6 private
  /^fe80:/i,                  // IPv6 link-local
];

function isAllowedUrl(urlString: string): { allowed: boolean; reason?: string } {
  try {
    const urlObj = new URL(urlString);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Block non-http(s) protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { allowed: false, reason: `Protocol '${urlObj.protocol}' is not allowed` };
    }
    
    // Block known internal hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { allowed: false, reason: `Access to '${hostname}' is blocked for security` };
    }
    
    // Block private IP ranges
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return { allowed: false, reason: `Access to private IP '${hostname}' is blocked` };
      }
    }
    
    // Block URLs with credentials
    if (urlObj.username || urlObj.password) {
      return { allowed: false, reason: 'URLs with embedded credentials are not allowed' };
    }
    
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Invalid URL format' };
  }
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
  const startTime = Date.now();
  
  // Rate limiting check
  const rateCheck = checkRateLimit('global');
  if (!rateCheck.allowed) {
    logger.audit('RATE_LIMIT_EXCEEDED', { 
      url, 
      retryAfter: rateCheck.retryAfter,
      action: 'fetch_rate_limited'
    });
    throw new Error(`Rate limit exceeded. Retry after ${rateCheck.retryAfter} seconds.`);
  }
  
  // Check cache
  if (webDocCache.has(url)) {
    logger.debug('Cache hit', { url, action: 'cache_hit' });
    return webDocCache.get(url)!;
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    logger.warn('Invalid URL format', { url, action: 'invalid_url' });
    throw new Error(`Invalid URL: ${url}`);
  }
  
  // SSRF Protection: Validate URL is allowed
  const urlCheck = isAllowedUrl(url);
  if (!urlCheck.allowed) {
    logger.audit('SSRF_BLOCK', { 
      url, 
      reason: urlCheck.reason,
      action: 'ssrf_block'
    });
    throw new Error(`URL blocked: ${urlCheck.reason}`);
  }
  
  // Audit log: starting fetch
  logger.info('Fetching web documentation', { 
    url, 
    projectType: options.projectType,
    action: 'fetch_start'
  });
  
  // Fetch content
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'StackGuide-MCP/1.0 (Documentation Fetcher)',
      'Accept': 'text/html,application/xhtml+xml,text/plain,text/markdown'
    }
  });
  
  if (!response.ok) {
    logger.warn('Fetch failed', { 
      url, 
      status: response.status,
      statusText: response.statusText,
      action: 'fetch_failed'
    });
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
  
  // Audit log: fetch complete
  const duration = Date.now() - startTime;
  logger.info('Web documentation fetched successfully', { 
    url, 
    docId: doc.id,
    title: doc.title,
    contentLength: content.length,
    durationMs: duration,
    action: 'fetch_complete'
  });
  
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
