import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAgent } from '../src/handlers/agent.js';

const mocks = vi.hoisted(() => {
  const readAgentProjectConfig = vi.fn();
  const getAgentConfigPath = vi.fn(() => '/tmp/project/.stackguide/config.json');

  const trackerApi = {
    readTicket: vi.fn(),
    listTickets: vi.fn(),
  };
  const TrackerService = vi.fn(function TrackerServiceMock() {
    return trackerApi;
  });

  const vcsApi = {
    getChangedFiles: vi.fn(),
    getCurrentBranch: vi.fn(),
    validateBranchName: vi.fn(),
    getRecentCommitMessages: vi.fn(),
    generateBranchName: vi.fn(),
    getCIStatus: vi.fn(),
    getLatestTag: vi.fn(),
    getCommitsSince: vi.fn(),
    createAnnotatedTag: vi.fn(),
    createPullRequest: vi.fn(),
  };
  const VcsService = vi.fn(function VcsServiceMock() {
    return vcsApi;
  });

  const runnerApi = {
    runConfiguredLayers: vi.fn(),
  };
  const TestRunnerService = vi.fn(function TestRunnerServiceMock() {
    return runnerApi;
  });

  const detectConventions = vi.fn();
  const detectProjectType = vi.fn();
  const analyzeWithTreeSitter = vi.fn();
  const analyzeCode = vi.fn();
  const handleHealth = vi.fn();

  return {
    readAgentProjectConfig,
    getAgentConfigPath,
    TrackerService,
    trackerApi,
    VcsService,
    vcsApi,
    TestRunnerService,
    runnerApi,
    detectConventions,
    detectProjectType,
    analyzeWithTreeSitter,
    analyzeCode,
    handleHealth,
  };
});

vi.mock('../src/config/agentConfig.js', () => ({
  readAgentProjectConfig: mocks.readAgentProjectConfig,
  getAgentConfigPath: mocks.getAgentConfigPath,
}));

vi.mock('../src/services/tracker.js', () => ({
  TrackerService: mocks.TrackerService,
}));

vi.mock('../src/services/vcs.js', () => ({
  VcsService: mocks.VcsService,
}));

vi.mock('../src/services/testRunner.js', () => ({
  TestRunnerService: mocks.TestRunnerService,
}));

vi.mock('../src/services/conventionDetector.js', () => ({
  detectConventions: mocks.detectConventions,
}));

vi.mock('../src/services/autoDetect.js', () => ({
  detectProjectType: mocks.detectProjectType,
}));

vi.mock('../src/services/ast/analyzer.js', () => ({
  analyzeWithTreeSitter: mocks.analyzeWithTreeSitter,
}));

vi.mock('../src/services/codeAnalyzer.js', () => ({
  analyzeCode: mocks.analyzeCode,
}));

vi.mock('../src/handlers/health.js', () => ({
  handleHealth: mocks.handleHealth,
}));

const state = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: [],
};

const config = {
  version: 1,
  tracker: { type: 'github', owner: 'acme', repo: 'repo', tokenEnv: 'GITHUB_TOKEN' },
  vcs: {
    type: 'github',
    owner: 'acme',
    repo: 'repo',
    tokenEnv: 'GITHUB_TOKEN',
    defaultBranch: 'main',
    branchPattern: 'feature/<TICKET>-<slug>',
  },
  testing: {
    frontend: {
      dir: 'frontend',
      enabled: true,
      commands: { test: 'pnpm test', lint: 'pnpm lint' },
    },
  },
  workflow: {
    testBudget: 1,
    commitConvention: 'conventional',
    requireTicketInBranch: true,
  },
  metadata: {
    generatedAt: new Date().toISOString(),
    projectType: 'react-typescript',
    detectionConfidence: 'high',
    source: 'auto',
  },
};

function parseResponse(response: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

describe('agent handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAgentProjectConfig.mockReturnValue(config);
    mocks.detectProjectType.mockReturnValue({
      detected: true,
      projectType: 'react-typescript',
      confidence: 'high',
      frameworks: ['react'],
      languages: ['typescript'],
      indicators: [],
      suggestions: [],
    });
    mocks.detectConventions.mockReturnValue({
      testFramework: 'vitest',
      testLocation: '__tests__',
      strictMode: true,
      confidence: 'high',
    });
    mocks.analyzeWithTreeSitter.mockResolvedValue({
      issues: [],
      metrics: { loc: 10, functions: 1, classes: 0, maxNestingDepth: 1, complexity: 1, imports: 1 },
    });
    mocks.analyzeCode.mockReturnValue({
      file: 'src/x.ts',
      language: 'typescript',
      issues: [],
      score: 90,
      summary: { errors: 0, warnings: 0, info: 0, suggestions: 0 },
      rulesApplied: { builtin: 0, user: 0, project: 0 },
    });
    mocks.handleHealth.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ score: 88 }) }],
    });
    mocks.trackerApi.readTicket.mockResolvedValue({
      key: 'PROJ-1',
      title: 'Implement intake',
      description: 'Given valid ticket',
      acceptanceCriteria: ['Given valid ticket'],
      labels: ['backend'],
      priority: 'High',
      type: 'Story',
      status: 'In Progress',
      url: 'https://example/ticket/PROJ-1',
      gaps: [],
    });
    mocks.vcsApi.generateBranchName.mockReturnValue('feature/PROJ-1-intake');
    mocks.vcsApi.getChangedFiles.mockReturnValue(['frontend/src/app.test.ts']);
    mocks.vcsApi.getCurrentBranch.mockReturnValue('feature/PROJ-1-intake');
    mocks.vcsApi.validateBranchName.mockReturnValue(true);
    mocks.vcsApi.getRecentCommitMessages.mockReturnValue(['feat(core): add intake']);
    mocks.runnerApi.runConfiguredLayers.mockResolvedValue([
      {
        layer: 'frontend',
        dir: 'frontend',
        tests: { success: true, command: 'pnpm test', summary: { passed: 3, failed: 0 } },
        lint: { success: true, command: 'pnpm lint', summary: { clean: true } },
      },
    ]);
    mocks.vcsApi.getCIStatus.mockResolvedValue({ provider: 'github', state: 'success', url: null });
    mocks.vcsApi.getLatestTag.mockReturnValue('v1.0.0');
    mocks.vcsApi.getCommitsSince.mockReturnValue([
      {
        hash: 'abc',
        subject: 'feat(core): add release',
        author: 'Jane',
        date: '2026-01-01',
        type: 'feat',
        scope: 'core',
        isBreaking: false,
        ticketKey: 'PROJ-1',
      },
    ]);
    mocks.vcsApi.createPullRequest.mockResolvedValue({
      provider: 'github',
      id: '11',
      url: 'https://github.com/acme/repo/pull/11',
      title: 'v1.1.0 release',
    });
  });

  it('returns error when active config is missing', async () => {
    mocks.readAgentProjectConfig.mockReturnValueOnce(null);
    const response = await handleAgent({ action: 'status' }, state);
    const data = parseResponse(response);
    expect(data.error).toContain('Missing .stackguide/config.json');
  });

  it('executes intake and returns brief', async () => {
    const response = await handleAgent({ action: 'intake', ticket: 'PROJ-1' }, state);
    const data = parseResponse(response);

    expect(data.action).toBe('intake');
    expect(data).toHaveProperty('ticket');
    expect(data).toHaveProperty('brief');
    expect(mocks.trackerApi.readTicket).toHaveBeenCalledWith('PROJ-1');
  });

  it('executes verify and returns pass report', async () => {
    const response = await handleAgent({ action: 'verify' }, state);
    const data = parseResponse(response);

    expect(data.action).toBe('verify');
    expect(data.passed).toBe(true);
    expect(data.blockers).toEqual([]);
  });

  it('executes release and can create tag and PR', async () => {
    const response = await handleAgent(
      { action: 'release', version: 'v1.1.0', createTag: true, createPullRequest: true },
      state
    );
    const data = parseResponse(response);

    expect(data.action).toBe('release');
    expect(data.recommendation).toBe('minor');
    expect(data.tagCreated).toBe(true);
    expect(mocks.vcsApi.createAnnotatedTag).toHaveBeenCalled();
    expect(mocks.vcsApi.createPullRequest).toHaveBeenCalled();
  });
});
