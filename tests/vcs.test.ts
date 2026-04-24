import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VcsService } from '../src/services/vcs.js';

describe('VcsService', () => {
  let runGit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runGit = vi.fn((args: string[]) => {
      const key = args.join(' ');
      if (key === 'branch --show-current') return 'feature/PROJ-123-intake';
      if (key === 'diff --name-only HEAD') return 'src/a.ts\nsrc/b.ts';
      if (key === 'diff --name-only --cached') return 'src/b.ts\nsrc/c.test.ts';
      if (key.startsWith('log --pretty=format:%H%x1f%s%x1f%an%x1f%aI ')) {
        return [
          'abc123\x1ffeat(api): add intake endpoint\x1fJane\x1f2026-01-01T00:00:00.000Z',
          'def456\x1ffix(ui): handle empty state\x1fJohn\x1f2026-01-02T00:00:00.000Z',
        ].join('\n');
      }
      if (key.startsWith('log -n')) {
        return 'feat(core): add release';
      }
      if (key === 'describe --tags --abbrev=0') return 'v1.0.0';
      if (key === 'status --porcelain') return '';
      return '';
    });
  });

  it('validates branch naming and generates branch names', () => {
    const service = new VcsService(
      {
        type: 'github',
        owner: 'acme',
        repo: 'repo',
        defaultBranch: 'main',
        branchPattern: 'feature/<TICKET>-<slug>',
      },
      '/tmp/project',
      { get: vi.fn(), post: vi.fn() } as never,
      runGit
    );

    expect(service.validateBranchName('feature/PROJ-123-login')).toBe(true);
    expect(service.validateBranchName('hotfix/PROJ-123')).toBe(false);
    expect(service.generateBranchName('PROJ-999', 'Add Login Form')).toBe('feature/PROJ-999-add-login-form');
  });

  it('returns unique changed files from staged and unstaged diffs', () => {
    const service = new VcsService(
      {
        type: 'git',
        defaultBranch: 'main',
        branchPattern: 'feature/<TICKET>-<slug>',
      },
      '/tmp/project',
      { get: vi.fn(), post: vi.fn() } as never,
      runGit
    );

    expect(service.getChangedFiles(true)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.test.ts']);
  });

  it('parses commits since reference', () => {
    const service = new VcsService(
      {
        type: 'git',
        defaultBranch: 'main',
        branchPattern: 'feature/<TICKET>-<slug>',
      },
      '/tmp/project',
      { get: vi.fn(), post: vi.fn() } as never,
      runGit
    );

    const commits = service.getCommitsSince('v1.0.0');
    expect(commits).toHaveLength(2);
    expect(commits[0].type).toBe('feat');
    expect(commits[1].type).toBe('fix');
  });

  it('creates GitHub pull requests via API', async () => {
    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        status: 201,
        data: { number: 42, html_url: 'https://github.com/acme/repo/pull/42' },
      }),
    };

    const service = new VcsService(
      {
        type: 'github',
        owner: 'acme',
        repo: 'repo',
        defaultBranch: 'main',
        branchPattern: 'feature/<TICKET>-<slug>',
      },
      '/tmp/project',
      client as never,
      runGit
    );

    const pr = await service.createPullRequest({
      title: 'Release v1.1.0',
      body: 'Release notes',
    });

    expect(pr.id).toBe('42');
    expect(pr.url).toContain('/pull/42');
  });

  it('maps GitHub CI status', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: { state: 'success', html_url: 'https://github.com/acme/repo/actions' },
      }),
      post: vi.fn(),
    };

    const service = new VcsService(
      {
        type: 'github',
        owner: 'acme',
        repo: 'repo',
        defaultBranch: 'main',
        branchPattern: 'feature/<TICKET>-<slug>',
      },
      '/tmp/project',
      client as never,
      runGit
    );

    const ci = await service.getCIStatus('main');
    expect(ci.state).toBe('success');
  });
});
