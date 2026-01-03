import dns from 'dns';
import { URL } from 'url';

export interface SafeFetchOptions {
  /** Hosts explicitly allowed. If empty, no host is allowed. */
  allowedHosts: string[];
  /** Request timeout in milliseconds. Default: 8000. */
  timeoutMs?: number;
  /** Maximum response size in bytes. Default: 2 MB. */
  maxBytes?: number;
  /** Additional fetch init options. */
  fetchOptions?: RequestInit;
}

const PRIVATE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1'
]);

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i
];

function isPrivateIp(host: string): boolean {
  if (PRIVATE_HOSTS.has(host)) return true;
  return PRIVATE_IP_PATTERNS.some((rx) => rx.test(host));
}

function hostAllowed(host: string, allowedHosts: string[]): boolean {
  if (allowedHosts.length === 0) return false;
  const lower = host.toLowerCase();
  return allowedHosts.some((h) => {
    const target = h.toLowerCase();
    return lower === target || lower.endsWith(`.${target}`);
  });
}

async function resolveAll(host: string): Promise<string[]> {
  try {
    const records = await dns.promises.lookup(host, { all: true });
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

export async function safeFetch(urlString: string, options: SafeFetchOptions): Promise<Response> {
  const { allowedHosts, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, fetchOptions = {} } = options;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    throw new Error(`Host not in allowlist: ${parsed.hostname}`);
  }

  const addresses = await resolveAll(parsed.hostname);
  if (addresses.length === 0) {
    throw new Error('Could not resolve host');
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error('Target resolves to private or loopback address');
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(urlString, {
    redirect: 'manual',
    ...fetchOptions,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  // Reject redirects to avoid SSRF via Location
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') || 'unknown';
    throw new Error(`Redirects are blocked (got ${location})`);
  }

  // Enforce size limit by reading stream manually
  const reader = response.body?.getReader();
  if (!reader) {
    return response;
  }

  let bytesRead = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        reader.cancel();
        throw new Error(`Response exceeds limit (${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  }

  const body = Buffer.concat(chunks);
  const res = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  return res;
}
