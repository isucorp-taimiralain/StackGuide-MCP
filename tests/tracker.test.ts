import { describe, it, expect, vi } from 'vitest';
import { TrackerService } from '../src/services/tracker.js';

describe('TrackerService', () => {
  it('reads and normalizes GitHub tickets', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          number: 123,
          title: 'Implement intake',
          body: 'Acceptance Criteria\n- Given valid ticket\n- Then return normalized brief',
          labels: [{ name: 'backend' }],
          state: 'open',
          html_url: 'https://github.com/acme/repo/issues/123',
        },
      }),
    };

    const service = new TrackerService(
      { type: 'github', owner: 'acme', repo: 'repo', tokenEnv: 'GITHUB_TOKEN' },
      client
    );
    const ticket = await service.readTicket('123');

    expect(ticket.key).toBe('123');
    expect(ticket.title).toBe('Implement intake');
    expect(ticket.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(ticket.labels).toContain('backend');
  });

  it('lists GitLab tickets', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: [
          {
            iid: 9,
            title: 'Add verifier',
            description: 'Given a branch\nWhen verify runs\nThen it should pass',
            labels: ['quality'],
            state: 'opened',
            web_url: 'https://gitlab.com/group/repo/-/issues/9',
          },
        ],
      }),
    };

    const service = new TrackerService(
      { type: 'gitlab', projectId: 'group/repo', tokenEnv: 'GITLAB_TOKEN' },
      client
    );
    const result = await service.listTickets('verifier');

    expect(result.provider).toBe('gitlab');
    expect(result.total).toBe(1);
    expect(result.tickets[0].title).toBe('Add verifier');
  });

  it('reads Jira ticket and parses ADF description', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          key: 'PROJ-77',
          fields: {
            summary: 'Release automation',
            description: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Given release notes are generated' }],
                },
              ],
            },
            labels: ['release'],
            priority: { name: 'High' },
            issuetype: { name: 'Story' },
            status: { name: 'In Progress' },
          },
        },
      }),
    };

    const service = new TrackerService(
      { type: 'jira', baseUrl: 'https://jira.example.com', tokenEnv: 'JIRA_TOKEN' },
      client
    );
    const ticket = await service.readTicket('PROJ-77');

    expect(ticket.key).toBe('PROJ-77');
    expect(ticket.description).toContain('Given release notes are generated');
    expect(ticket.priority).toBe('High');
  });

  it('throws when tracker is not configured', async () => {
    const service = new TrackerService({ type: 'none' });
    await expect(service.readTicket('1')).rejects.toThrow(/Tracker is not configured/i);
  });
});
