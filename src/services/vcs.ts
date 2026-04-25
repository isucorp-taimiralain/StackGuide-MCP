/**
 * VCS service for active agents.
 * Wraps git operations plus GitHub/GitLab PR/MR and CI APIs.
 */

import { execFileSync } from 'node:child_process';
import { getHttpClient, HttpClient } from './httpClient.js';
import { VcsConfig } from '../config/agentConfig.js';

export type CiState = 'success' | 'failed' | 'running' | 'unknown';

export interface CommitInfo {
  hash: string;
  subject: string;
  author: string;
  date: string;
  type: string | null;
  scope: string | null;
  isBreaking: boolean;
  ticketKey: string | null;
}

export interface PullRequestResult {
  provider: VcsConfig['type'];
  id: string;
  url: string | null;
  title: string;
}

export interface CiStatusResult {
  provider: VcsConfig['type'];
  state: CiState;
  url: string | null;
  details?: string;
}

interface HttpClientLike {
  get<T = unknown>(url: string, options?: Parameters<HttpClient['get']>[1]): Promise<{ data: T; status: number }>;
  post<T = unknown>(url: string, body?: unknown, options?: Parameters<HttpClient['post']>[2]): Promise<{ data: T; status: number }>;
}

type GitRunner = (args: string[]) => string;

function defaultGitRunner(projectPath: string): GitRunner {
  return (args: string[]) => execFileSync('git', args, {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseCommitSubject(subject: string): {
  type: string | null;
  scope: string | null;
  isBreaking: boolean;
  ticketKey: string | null;
} {
  const conventional = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+/i);
  const ticket = subject.match(/([A-Z]+-\d+)/);
  return {
    type: conventional ? conventional[1].toLowerCase() : null,
    scope: conventional?.[2] || null,
    isBreaking: !!conventional?.[3] || /BREAKING CHANGE/i.test(subject),
    ticketKey: ticket ? ticket[1] : null,
  };
}

function mapGithubState(state: string): CiState {
  if (state === 'success') return 'success';
  if (state === 'pending') return 'running';
  if (state === 'failure' || state === 'error') return 'failed';
  return 'unknown';
}

function mapGitlabState(state: string): CiState {
  if (state === 'success') return 'success';
  if (state === 'failed' || state === 'canceled' || state === 'skipped') return 'failed';
  if (state === 'running' || state === 'pending' || state === 'created') return 'running';
  return 'unknown';
}

export class VcsService {
  private readonly client: HttpClientLike;
  private readonly runGit: GitRunner;

  constructor(
    private readonly config: VcsConfig,
    private readonly projectPath: string = process.cwd(),
    client: HttpClientLike = getHttpClient(),
    runGit?: GitRunner
  ) {
    this.client = client;
    this.runGit = runGit || defaultGitRunner(projectPath);
  }

  private getToken(): string | null {
    if (!this.config.tokenEnv) {
      return null;
    }
    return process.env[this.config.tokenEnv] || null;
  }

  private getHeaders(): Record<string, string> {
    const token = this.getToken();
    if (!token) {
      return {};
    }

    if (this.config.type === 'gitlab') {
      return { 'PRIVATE-TOKEN': token };
    }

    return { Authorization: `Bearer ${token}` };
  }

  getCurrentBranch(): string {
    try {
      return this.runGit(['branch', '--show-current']);
    } catch {
      return this.config.defaultBranch;
    }
  }

  generateBranchName(ticketKey: string, slug: string): string {
    const sanitizedTicket = (ticketKey || 'NO-TICKET')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    const sanitizedSlug = (slug || 'work')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return this.config.branchPattern
      .replace('<TICKET>', sanitizedTicket)
      .replace('<slug>', sanitizedSlug || 'work');
  }

  validateBranchName(branchName: string): boolean {
    const escapedPattern = this.config.branchPattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('<TICKET>', '[A-Z]+-[0-9]+')
      .replace('<slug>', '[a-z0-9-]+');
    const regex = new RegExp(`^${escapedPattern}$`);
    return regex.test(branchName);
  }

  createBranch(name: string, checkout = true): string {
    if (checkout) {
      this.runGit(['checkout', '-b', name]);
    } else {
      this.runGit(['branch', name]);
    }
    return name;
  }

  getChangedFiles(includeStaged = true): string[] {
    const files = new Set<string>();

    try {
      const unstaged = this.runGit(['diff', '--name-only', 'HEAD']);
      for (const file of unstaged.split('\n').filter(Boolean)) {
        files.add(file);
      }
    } catch {
      // Ignore.
    }

    if (includeStaged) {
      try {
        const staged = this.runGit(['diff', '--name-only', '--cached']);
        for (const file of staged.split('\n').filter(Boolean)) {
          files.add(file);
        }
      } catch {
        // Ignore.
      }
    }

    return Array.from(files);
  }

  getLatestTag(): string | null {
    try {
      const tag = this.runGit(['describe', '--tags', '--abbrev=0']);
      return tag || null;
    } catch {
      return null;
    }
  }

  getCommitsSince(ref: string): CommitInfo[] {
    const log = this.runGit(['log', '--pretty=format:%H%x1f%s%x1f%an%x1f%aI', `${ref}..HEAD`]);
    if (!log) {
      return [];
    }

    return log
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, subject, author, date] = line.split('\x1f');
        const parsed = parseCommitSubject(subject || '');
        return {
          hash: hash || '',
          subject: subject || '',
          author: author || '',
          date: date || '',
          ...parsed,
        };
      });
  }

  getRecentCommitMessages(limit = 20): string[] {
    const log = this.runGit(['log', `-n${limit}`, '--pretty=format:%s']);
    if (!log) {
      return [];
    }
    return log.split('\n').filter(Boolean);
  }

  isWorkingTreeClean(): boolean {
    try {
      const status = this.runGit(['status', '--porcelain']);
      return status.trim().length === 0;
    } catch {
      return false;
    }
  }

  createAnnotatedTag(tag: string, message: string): void {
    this.runGit(['tag', '-a', tag, '-m', message]);
  }

  async createPullRequest(payload: {
    title: string;
    body: string;
    base?: string;
    head?: string;
  }): Promise<PullRequestResult> {
    const base = payload.base || this.config.defaultBranch;
    const head = payload.head || this.getCurrentBranch();

    if (this.config.type === 'github') {
      if (!this.config.owner || !this.config.repo) {
        throw new Error('GitHub VCS config requires owner and repo.');
      }

      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/pulls`;
      const response = await this.client.post<{ number: number; html_url: string }>(
        url,
        {
          title: payload.title,
          body: payload.body,
          head,
          base,
        },
        { headers: this.getHeaders() }
      );

      if (response.status >= 400) {
        throw new Error(`GitHub PR creation failed with status ${response.status}.`);
      }

      return {
        provider: 'github',
        id: String(response.data.number),
        url: response.data.html_url || null,
        title: payload.title,
      };
    }

    if (this.config.type === 'gitlab') {
      const projectId = this.config.projectId || (this.config.owner && this.config.repo
        ? `${this.config.owner}/${this.config.repo}`
        : null);
      if (!projectId) {
        throw new Error('GitLab VCS config requires projectId or owner/repo.');
      }

      const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests`;
      const response = await this.client.post<{ iid: number; web_url: string }>(
        url,
        {
          title: payload.title,
          description: payload.body,
          source_branch: head,
          target_branch: base,
        },
        { headers: this.getHeaders() }
      );

      if (response.status >= 400) {
        throw new Error(`GitLab MR creation failed with status ${response.status}.`);
      }

      return {
        provider: 'gitlab',
        id: String(response.data.iid),
        url: response.data.web_url || null,
        title: payload.title,
      };
    }

    return {
      provider: 'git',
      id: 'local-only',
      url: null,
      title: payload.title,
    };
  }

  async getCIStatus(branch?: string): Promise<CiStatusResult> {
    const ref = branch || this.getCurrentBranch() || this.config.defaultBranch;

    if (this.config.type === 'github') {
      if (!this.config.owner || !this.config.repo) {
        return { provider: 'github', state: 'unknown', url: null, details: 'Missing owner/repo in config.' };
      }

      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/commits/${encodeURIComponent(ref)}/status`;
      const response = await this.client.get<{ state: string; html_url?: string }>(url, { headers: this.getHeaders() });
      if (response.status >= 400) {
        return {
          provider: 'github',
          state: 'unknown',
          url: null,
          details: `Status endpoint failed with ${response.status}.`,
        };
      }

      return {
        provider: 'github',
        state: mapGithubState(response.data.state || 'unknown'),
        url: response.data.html_url || null,
      };
    }

    if (this.config.type === 'gitlab') {
      const projectId = this.config.projectId || (this.config.owner && this.config.repo
        ? `${this.config.owner}/${this.config.repo}`
        : null);
      if (!projectId) {
        return { provider: 'gitlab', state: 'unknown', url: null, details: 'Missing projectId in config.' };
      }

      const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/pipelines?ref=${encodeURIComponent(ref)}&per_page=1`;
      const response = await this.client.get<Array<{ status: string; web_url?: string }>>(url, { headers: this.getHeaders() });
      if (response.status >= 400 || !Array.isArray(response.data)) {
        return {
          provider: 'gitlab',
          state: 'unknown',
          url: null,
          details: `Pipelines endpoint failed with ${response.status}.`,
        };
      }

      const pipeline = response.data[0];
      if (!pipeline) {
        return {
          provider: 'gitlab',
          state: 'unknown',
          url: null,
          details: 'No pipeline found for branch.',
        };
      }

      return {
        provider: 'gitlab',
        state: mapGitlabState(pipeline.status || 'unknown'),
        url: pipeline.web_url || null,
      };
    }

    return {
      provider: 'git',
      state: 'unknown',
      url: null,
      details: 'No CI provider configured.',
    };
  }
}
