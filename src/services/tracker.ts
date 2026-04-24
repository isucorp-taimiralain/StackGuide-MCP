/**
 * Tracker service for active agents.
 * Unifies ticket access for GitHub, GitLab and Jira.
 */

import { getHttpClient, HttpClient } from './httpClient.js';
import { TrackerConfig } from '../config/agentConfig.js';

export interface TicketBrief {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  labels: string[];
  priority: string | null;
  type: string | null;
  status: string | null;
  url: string | null;
  gaps: string[];
  raw?: unknown;
}

export interface TicketListResult {
  provider: TrackerConfig['type'];
  tickets: TicketBrief[];
  total: number;
}

interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  state: string;
  html_url: string;
}

interface GitlabIssue {
  iid: number;
  title: string;
  description: string | null;
  labels: string[];
  state: string;
  web_url: string;
}

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    labels?: string[];
    priority?: { name?: string };
    issuetype?: { name?: string };
    status?: { name?: string };
  };
}

interface HttpClientLike {
  get<T = unknown>(url: string, options?: Parameters<HttpClient['get']>[1]): Promise<{ data: T; status: number }>;
}

function extractIssueNumber(ticketKey: string): string | null {
  const trimmed = ticketKey.trim();
  const direct = trimmed.match(/^#?(\d+)$/);
  if (direct) {
    return direct[1];
  }

  const trailing = trimmed.match(/(\d+)$/);
  return trailing ? trailing[1] : null;
}

function extractAcceptanceCriteria(description: string): string[] {
  const lines = description
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const gwt = lines
    .map(line => line.replace(/^[-*]\s*/, ''))
    .filter(line => /^(given|when|then)\b/i.test(line));
  if (gwt.length > 0) {
    return gwt;
  }

  const acceptanceIdx = lines.findIndex(line =>
    /acceptance criteria|acceptance criterion|criterios de aceptacion|criterios de aceptación/i.test(line)
  );

  if (acceptanceIdx >= 0) {
    const criteria: string[] = [];
    for (let i = acceptanceIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^#+\s/.test(line)) {
        break;
      }
      if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        criteria.push(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
      }
    }
    if (criteria.length > 0) {
      return criteria;
    }
  }

  return [];
}

function detectGaps(ticket: TicketBrief): string[] {
  const gaps: string[] = [];
  if (!ticket.description.trim()) {
    gaps.push('Ticket description is empty.');
  }
  if (ticket.acceptanceCriteria.length === 0) {
    gaps.push('No observable acceptance criteria found.');
  }
  if (!ticket.priority) {
    gaps.push('Priority is not defined.');
  }
  if (!ticket.type) {
    gaps.push('Issue type is not defined.');
  }
  return gaps;
}

function parseJiraDescription(description: unknown): string {
  if (typeof description === 'string') {
    return description;
  }

  if (!description || typeof description !== 'object') {
    return '';
  }

  // Support Atlassian Document Format (ADF).
  const root = description as { content?: unknown[] };
  const lines: string[] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const objectNode = node as { text?: string; content?: unknown[]; type?: string };
    if (typeof objectNode.text === 'string') {
      lines.push(objectNode.text);
    }
    if (Array.isArray(objectNode.content)) {
      for (const child of objectNode.content) {
        walk(child);
      }
    }
    if (objectNode.type === 'paragraph') {
      lines.push('\n');
    }
  };

  walk(root);
  return lines.join(' ').replace(/\s+\n/g, '\n').trim();
}

export class TrackerService {
  private readonly client: HttpClientLike;

  constructor(
    private readonly config: TrackerConfig,
    client: HttpClientLike = getHttpClient()
  ) {
    this.client = client;
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

  async readTicket(ticketKey: string): Promise<TicketBrief> {
    switch (this.config.type) {
      case 'github':
        return this.readGithubTicket(ticketKey);
      case 'gitlab':
        return this.readGitlabTicket(ticketKey);
      case 'jira':
        return this.readJiraTicket(ticketKey);
      default:
        throw new Error('Tracker is not configured. Run init action:"full" and set tracker in .stackguide/config.json.');
    }
  }

  async listTickets(query = '', limit = 20): Promise<TicketListResult> {
    switch (this.config.type) {
      case 'github':
        return this.listGithubTickets(query, limit);
      case 'gitlab':
        return this.listGitlabTickets(query, limit);
      case 'jira':
        return this.listJiraTickets(query, limit);
      default:
        return { provider: 'none', tickets: [], total: 0 };
    }
  }

  private normalizeGithubIssue(issue: GithubIssue): TicketBrief {
    const description = issue.body || '';
    const brief: TicketBrief = {
      key: String(issue.number),
      title: issue.title,
      description,
      acceptanceCriteria: extractAcceptanceCriteria(description),
      labels: issue.labels.map(label => label.name),
      priority: null,
      type: 'issue',
      status: issue.state,
      url: issue.html_url,
      gaps: [],
      raw: issue,
    };
    brief.gaps = detectGaps(brief);
    return brief;
  }

  private normalizeGitlabIssue(issue: GitlabIssue): TicketBrief {
    const description = issue.description || '';
    const brief: TicketBrief = {
      key: String(issue.iid),
      title: issue.title,
      description,
      acceptanceCriteria: extractAcceptanceCriteria(description),
      labels: issue.labels || [],
      priority: null,
      type: 'issue',
      status: issue.state,
      url: issue.web_url,
      gaps: [],
      raw: issue,
    };
    brief.gaps = detectGaps(brief);
    return brief;
  }

  private normalizeJiraIssue(issue: JiraIssue): TicketBrief {
    const description = parseJiraDescription(issue.fields.description);
    const brief: TicketBrief = {
      key: issue.key,
      title: issue.fields.summary || '',
      description,
      acceptanceCriteria: extractAcceptanceCriteria(description),
      labels: issue.fields.labels || [],
      priority: issue.fields.priority?.name || null,
      type: issue.fields.issuetype?.name || null,
      status: issue.fields.status?.name || null,
      url: this.config.baseUrl ? `${this.config.baseUrl.replace(/\/$/, '')}/browse/${issue.key}` : null,
      gaps: [],
      raw: issue,
    };
    brief.gaps = detectGaps(brief);
    return brief;
  }

  private async readGithubTicket(ticketKey: string): Promise<TicketBrief> {
    if (!this.config.owner || !this.config.repo) {
      throw new Error('GitHub tracker requires owner and repo in .stackguide/config.json.');
    }

    const issueNumber = extractIssueNumber(ticketKey);
    if (!issueNumber) {
      throw new Error(`Invalid GitHub issue key "${ticketKey}". Expected a numeric issue id.`);
    }

    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;
    const response = await this.client.get<GithubIssue>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`GitHub issue request failed with status ${response.status}.`);
    }
    return this.normalizeGithubIssue(response.data);
  }

  private async listGithubTickets(query: string, limit: number): Promise<TicketListResult> {
    if (!this.config.owner || !this.config.repo) {
      throw new Error('GitHub tracker requires owner and repo in .stackguide/config.json.');
    }

    const q = [`repo:${this.config.owner}/${this.config.repo}`, 'is:issue', query].filter(Boolean).join(' ');
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 100)}`;
    const response = await this.client.get<{ total_count: number; items: GithubIssue[] }>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`GitHub issues search failed with status ${response.status}.`);
    }

    const tickets = (response.data.items || []).map(issue => this.normalizeGithubIssue(issue));
    return {
      provider: 'github',
      tickets,
      total: response.data.total_count || tickets.length,
    };
  }

  private async readGitlabTicket(ticketKey: string): Promise<TicketBrief> {
    const projectId = this.config.projectId || (this.config.owner && this.config.repo ? `${this.config.owner}/${this.config.repo}` : null);
    if (!projectId) {
      throw new Error('GitLab tracker requires projectId or owner/repo in .stackguide/config.json.');
    }

    const issueIid = extractIssueNumber(ticketKey);
    if (!issueIid) {
      throw new Error(`Invalid GitLab issue key "${ticketKey}". Expected a numeric issue id.`);
    }

    const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
    const response = await this.client.get<GitlabIssue>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`GitLab issue request failed with status ${response.status}.`);
    }
    return this.normalizeGitlabIssue(response.data);
  }

  private async listGitlabTickets(query: string, limit: number): Promise<TicketListResult> {
    const projectId = this.config.projectId || (this.config.owner && this.config.repo ? `${this.config.owner}/${this.config.repo}` : null);
    if (!projectId) {
      throw new Error('GitLab tracker requires projectId or owner/repo in .stackguide/config.json.');
    }

    const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/issues?search=${encodeURIComponent(query)}&per_page=${Math.min(limit, 100)}`;
    const response = await this.client.get<GitlabIssue[]>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`GitLab issues list failed with status ${response.status}.`);
    }

    const tickets = (response.data || []).map(issue => this.normalizeGitlabIssue(issue));
    return {
      provider: 'gitlab',
      tickets,
      total: tickets.length,
    };
  }

  private async readJiraTicket(ticketKey: string): Promise<TicketBrief> {
    if (!this.config.baseUrl) {
      throw new Error('Jira tracker requires baseUrl in .stackguide/config.json.');
    }

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}`;
    const response = await this.client.get<JiraIssue>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`Jira issue request failed with status ${response.status}.`);
    }
    return this.normalizeJiraIssue(response.data);
  }

  private async listJiraTickets(query: string, limit: number): Promise<TicketListResult> {
    if (!this.config.baseUrl) {
      throw new Error('Jira tracker requires baseUrl in .stackguide/config.json.');
    }

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const jql = query
      ? query
      : this.config.projectKey
        ? `project=${this.config.projectKey} ORDER BY updated DESC`
        : 'ORDER BY updated DESC';

    const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(limit, 100)}`;
    const response = await this.client.get<{ issues: JiraIssue[] }>(url, { headers: this.getHeaders() });
    if (response.status >= 400) {
      throw new Error(`Jira issues search failed with status ${response.status}.`);
    }

    const tickets = (response.data.issues || []).map(issue => this.normalizeJiraIssue(issue));
    return {
      provider: 'jira',
      tickets,
      total: tickets.length,
    };
  }
}
