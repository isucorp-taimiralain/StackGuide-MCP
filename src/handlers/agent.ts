/**
 * Active agent handler.
 * Executes workflow actions instead of returning passive markdown instructions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { jsonResponse, errorResponse, ToolResponse, ServerState } from './types.js';
import { AgentProjectConfig, readAgentProjectConfig, getAgentConfigPath } from '../config/agentConfig.js';
import { TrackerService } from '../services/tracker.js';
import { VcsService, CommitInfo } from '../services/vcs.js';
import { TestRunnerService } from '../services/testRunner.js';
import { detectConventions } from '../services/conventionDetector.js';
import { detectProjectType } from '../services/autoDetect.js';
import { analyzeWithTreeSitter } from '../services/ast/analyzer.js';
import { analyzeCode } from '../services/codeAnalyzer.js';
import { handleHealth } from './health.js';
import { buildStrictMainDescriptionTemplate, deriveSummaryFromMainDescription } from '../services/jiraTicketTemplate.js';

const AgentInputSchema = z.object({
  action: z.enum(['status', 'intake', 'create_ticket', 'plan', 'verify', 'release']).default('status'),
  path: z.string().optional(),
  ticket: z.string().optional(),
  brief: z.string().optional(),
  version: z.string().optional(),
  createTag: z.boolean().optional().default(false),
  createPullRequest: z.boolean().optional().default(false),
  createFromDescription: z.boolean().optional().default(false),
  mainDescription: z.string().optional(),
  summary: z.string().optional(),
  projectKey: z.string().optional(),
  issueType: z.string().optional(),
  labels: z.array(z.string()).optional(),
  originComponent: z.string().optional(),
  originKeyLogic: z.string().optional(),
  originOldQuery: z.string().optional(),
  destinationModel: z.string().optional(),
  destinationController: z.string().optional(),
  destinationRoute: z.string().optional(),
  destinationView: z.string().optional(),
  dataTransformation: z.string().optional(),
  prototypeDesignPattern: z.string().optional(),
  prototypeView: z.string().optional(),
  prototypeProps: z.string().optional(),
  prototypeRelatedFiles: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
}).passthrough();

type AgentInput = z.infer<typeof AgentInputSchema>;

interface PlannedTest {
  type: 'unit' | 'integration' | 'ui_api';
  path: string;
  name: string;
  assertion: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function extractTicketKey(input?: string): string | null {
  if (!input) return null;
  const match = input.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface TicketCreationDraft {
  ready: boolean;
  missingFields: string[];
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  labels: string[];
  defaults: {
    projectKey: string | null;
    issueType: string;
    summarySource: 'first_line_main_description';
    descriptionField: 'description';
  };
}

function normalizeList(values?: string[]): string[] {
  if (!values) {
    return [];
  }
  return values
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

function buildTicketCreationDraft(input: AgentInput, config: AgentProjectConfig): TicketCreationDraft {
  const mainDescription = (input.mainDescription || '').trim();
  const projectKey = (input.projectKey || config.tracker.projectKey || '').trim();
  const issueType = (input.issueType || config.tracker.defaultIssueType || config.automation.jira.issueType || 'Task').trim() || 'Task';
  const summary = (input.summary || deriveSummaryFromMainDescription(mainDescription)).trim();

  const missingFields: string[] = [];
  if (!mainDescription) {
    missingFields.push('mainDescription');
  }
  if (!projectKey) {
    missingFields.push('projectKey');
  }
  if (!summary) {
    missingFields.push('summary');
  }

  const description = mainDescription
    ? buildStrictMainDescriptionTemplate({
      mainDescription,
      originComponent: input.originComponent,
      originKeyLogic: input.originKeyLogic,
      originOldQuery: input.originOldQuery,
      destinationModel: input.destinationModel,
      destinationController: input.destinationController,
      destinationRoute: input.destinationRoute,
      destinationView: input.destinationView,
      dataTransformation: input.dataTransformation,
      prototypeDesignPattern: input.prototypeDesignPattern,
      prototypeView: input.prototypeView,
      prototypeProps: input.prototypeProps,
      prototypeRelatedFiles: normalizeList(input.prototypeRelatedFiles),
      acceptanceCriteria: normalizeList(input.acceptanceCriteria),
    })
    : '';

  return {
    ready: missingFields.length === 0,
    missingFields,
    projectKey,
    issueType,
    summary,
    description,
    labels: normalizeList(input.labels),
    defaults: {
      projectKey: config.tracker.projectKey || null,
      issueType,
      summarySource: 'first_line_main_description',
      descriptionField: 'description',
    },
  };
}

function buildIntakeBrief(ticket: {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  gaps: string[];
}): Record<string, unknown> {
  return {
    key: ticket.key,
    title: ticket.title,
    context: ticket.description,
    acceptanceCriteria: ticket.acceptanceCriteria,
    constraints: [],
    risks: ticket.gaps,
    suggestedTestData: [],
  };
}

function buildBaselineTests(
  projectPath: string,
  testingConfig: NonNullable<ReturnType<typeof readAgentProjectConfig>>['testing'],
  ticketKey: string | null
): PlannedTest[] {
  const slug = ticketKey ? slugify(ticketKey) : 'slice';

  const backendDir = testingConfig.backend?.dir || 'backend';
  const frontendDir = testingConfig.frontend?.dir || 'frontend';

  const backendExists = fs.existsSync(path.join(projectPath, backendDir)) || backendDir === '.';
  const frontendExists = fs.existsSync(path.join(projectPath, frontendDir)) || frontendDir === '.';

  const unitPath = backendExists
    ? `${backendDir}/tests/Unit/${slug}.test`
    : `tests/unit/${slug}.test.ts`;
  const integrationPath = backendExists
    ? `${backendDir}/tests/Feature/${slug}.test`
    : `tests/integration/${slug}.test.ts`;
  const uiPath = frontendExists
    ? `${frontendDir}/src/__tests__/${slug}.test.tsx`
    : `tests/contract/${slug}.test.ts`;

  return [
    {
      type: 'unit',
      path: unitPath,
      name: `unit_${slug}`,
      assertion: 'Business rule returns expected output for valid and invalid inputs.',
    },
    {
      type: 'integration',
      path: integrationPath,
      name: `integration_${slug}`,
      assertion: 'System boundary (HTTP/job/service) produces the expected persisted side effects.',
    },
    {
      type: 'ui_api',
      path: uiPath,
      name: `ui_api_${slug}`,
      assertion: 'User-visible flow or API contract matches acceptance criteria.',
    },
  ];
}

function detectChangedTestFiles(changedFiles: string[]): string[] {
  return changedFiles.filter(file =>
    /(^|\/)(tests?|__tests__)\//i.test(file) ||
    /\.test\.[a-z]+$/i.test(file) ||
    /\.spec\.[a-z]+$/i.test(file)
  );
}

function isMergeCommitMessage(message: string): boolean {
  return /^Merge\b/i.test(message.trim());
}

function validateConventionalCommits(messages: string[]): { valid: boolean; invalidMessages: string[] } {
  const pattern = /^(feat|fix|test|refactor|chore|docs|style|perf|ci|build|revert)(\([^)]+\))?(!)?:\s.+/i;
  const invalid = messages
    .filter(message => !isMergeCommitMessage(message))
    .filter(message => !pattern.test(message));
  return {
    valid: invalid.length === 0,
    invalidMessages: invalid,
  };
}

function calculateReleaseRecommendation(commits: CommitInfo[]): 'major' | 'minor' | 'patch' {
  if (commits.some(commit => commit.isBreaking)) {
    return 'major';
  }
  if (commits.some(commit => commit.type === 'feat')) {
    return 'minor';
  }
  return 'patch';
}

function groupCommitsByType(commits: CommitInfo[]): Record<string, CommitInfo[]> {
  const groups: Record<string, CommitInfo[]> = {
    features: [],
    fixes: [],
    refactors: [],
    chores: [],
    breaking: [],
    others: [],
  };

  for (const commit of commits) {
    if (commit.isBreaking) {
      groups.breaking.push(commit);
      continue;
    }
    switch (commit.type) {
      case 'feat':
        groups.features.push(commit);
        break;
      case 'fix':
        groups.fixes.push(commit);
        break;
      case 'refactor':
        groups.refactors.push(commit);
        break;
      case 'chore':
        groups.chores.push(commit);
        break;
      default:
        groups.others.push(commit);
        break;
    }
  }

  return groups;
}

async function analyzeChangedFiles(projectPath: string, changedFiles: string[]): Promise<{
  score: number;
  totalIssues: number;
  criticalIssues: number;
}> {
  let totalScore = 0;
  let analyzed = 0;
  let totalIssues = 0;
  let criticalIssues = 0;

  for (const relativePath of changedFiles.slice(0, 40)) {
    const absolutePath = path.join(projectPath, relativePath);
    try {
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        continue;
      }
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const analysis = analyzeCode(relativePath, content, 'all');
      totalScore += analysis.score;
      analyzed++;
      totalIssues += analysis.issues.length;
      criticalIssues += analysis.summary.errors;
    } catch {
      // Skip unreadable files.
    }
  }

  return {
    score: analyzed > 0 ? Math.round(totalScore / analyzed) : 100,
    totalIssues,
    criticalIssues,
  };
}

export async function handleAgent(
  args: Record<string, unknown>,
  state: ServerState
): Promise<ToolResponse> {
  const validation = AgentInputSchema.safeParse(args);
  if (!validation.success) {
    return errorResponse('Invalid input for agent action.', validation.error.issues.map(issue => issue.message).join('; '));
  }

  const input: AgentInput = validation.data;
  const projectPath = input.path ? path.resolve(input.path) : process.cwd();
  const config = readAgentProjectConfig(projectPath);

  if (!config) {
    return errorResponse(
      'Missing .stackguide/config.json.',
      `Run init action:"full" first. Expected config at ${getAgentConfigPath(projectPath)}`
    );
  }

  const trackerService = new TrackerService(config.tracker);
  const vcsService = new VcsService(config.vcs, projectPath);
  const testRunner = new TestRunnerService();

  switch (input.action) {
    case 'status': {
      return jsonResponse({
        action: 'status',
        projectPath,
        configPath: getAgentConfigPath(projectPath),
        tracker: config.tracker.type,
        vcs: config.vcs.type,
        testingLayers: {
          backend: !!config.testing.backend,
          frontend: !!config.testing.frontend,
        },
        adaptiveTdd: config.automation.tdd,
        jiraDefaults: {
          projectKey: config.tracker.projectKey || null,
          issueType: config.tracker.defaultIssueType || config.automation.jira.issueType,
          summarySource: config.automation.jira.summarySource,
          descriptionField: config.automation.jira.descriptionField,
          strictTemplate: config.automation.jira.strictTemplate,
        },
        mcpIntegrations: config.automation.mcp,
      });
    }

    case 'intake': {
      const shouldCreateFromDescription = input.createFromDescription || (!input.ticket && !!input.mainDescription);
      if (shouldCreateFromDescription) {
        const draft = buildTicketCreationDraft(input, config);
        if (!draft.ready) {
          return jsonResponse({
            action: 'intake',
            status: 'needs_input',
            message: 'Missing fields to create Jira ticket from description.',
            missingFields: draft.missingFields,
            defaults: draft.defaults,
            hint: 'Provide mainDescription plus projectKey (or set tracker.projectKey), then retry with createFromDescription:true.',
          });
        }

        const createdTicket = await trackerService.createJiraTicket({
          projectKey: draft.projectKey,
          issueType: draft.issueType,
          summary: draft.summary,
          description: draft.description,
          labels: draft.labels,
        });
        const detection = detectProjectType(projectPath);
        const branchTicket = extractTicketKey(createdTicket.key) || createdTicket.key;
        const suggestedBranch = vcsService.generateBranchName(branchTicket, slugify(createdTicket.title || 'work'));

        return jsonResponse({
          action: 'intake',
          status: 'created',
          createdFromDescription: true,
          ticket: createdTicket,
          brief: buildIntakeBrief(createdTicket),
          projectDetection: {
            detected: detection.detected,
            projectType: detection.projectType,
            confidence: detection.confidence,
            frameworks: detection.frameworks,
          },
          nextStep: {
            action: 'plan',
            suggestedBranch,
            message: 'Use agent action:"plan" with this brief to produce an executable TDD plan.',
          },
        });
      }

      if (!input.ticket) {
        return errorResponse('Missing ticket parameter for intake action.', 'Pass ticket:"PROJ-123" or createFromDescription:true + mainDescription.');
      }

      const ticket = await trackerService.readTicket(input.ticket);
      const detection = detectProjectType(projectPath);
      const branchTicket = extractTicketKey(input.ticket) || input.ticket;
      const suggestedBranch = vcsService.generateBranchName(branchTicket, slugify(ticket.title || 'work'));

      return jsonResponse({
        action: 'intake',
        ticket,
        brief: buildIntakeBrief(ticket),
        projectDetection: {
          detected: detection.detected,
          projectType: detection.projectType,
          confidence: detection.confidence,
          frameworks: detection.frameworks,
        },
        nextStep: {
          action: 'plan',
          suggestedBranch,
          message: 'Use agent action:"plan" with this brief to produce an executable TDD plan.',
        },
      });
    }

    case 'create_ticket': {
      const draft = buildTicketCreationDraft(input, config);
      if (!draft.ready) {
        return jsonResponse({
          action: 'create_ticket',
          status: 'needs_input',
          message: 'Missing required fields for Jira ticket creation.',
          missingFields: draft.missingFields,
          defaults: draft.defaults,
          hint: 'Required: mainDescription + projectKey (or tracker.projectKey). Summary defaults to first line of MAIN DESCRIPTION.',
        });
      }

      const ticket = await trackerService.createJiraTicket({
        projectKey: draft.projectKey,
        issueType: draft.issueType,
        summary: draft.summary,
        description: draft.description,
        labels: draft.labels,
      });

      return jsonResponse({
        action: 'create_ticket',
        status: 'created',
        ticket,
        brief: buildIntakeBrief(ticket),
        nextStep: {
          action: 'plan',
          message: 'Use agent action:"plan" and pass this brief to continue TDD.',
        },
      });
    }

    case 'plan': {
      const ticketKey = extractTicketKey(input.ticket || input.brief) || 'PROJ-000';
      const brief = (input.brief || '').trim();
      if (!brief) {
        return errorResponse('Missing brief parameter for plan action.');
      }

      const conventions = detectConventions(projectPath);
      const detection = detectProjectType(projectPath);
      const changedFiles = vcsService.getChangedFiles();
      const filesToAnalyze = changedFiles.slice(0, 10);
      const astFindings = [];

      for (const file of filesToAnalyze) {
        const absolutePath = path.join(projectPath, file);
        if (!fs.existsSync(absolutePath)) {
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          const result = await analyzeWithTreeSitter(content, file);
          if (result) {
            astFindings.push({
              file: file,
              issues: result.issues.length,
              metrics: result.metrics,
            });
          }
        } catch {
          // Continue with other files.
        }
      }

      const plannedTests = buildBaselineTests(projectPath, config.testing, ticketKey);
      const branchName = vcsService.generateBranchName(ticketKey, slugify(brief.slice(0, 64)));

      return jsonResponse({
        action: 'plan',
        ticket: ticketKey,
        verticalSlice: brief.split('\n')[0],
        branch: branchName,
        acceptanceCriteria: [],
        tests: plannedTests,
        projectContext: {
          projectType: detection.projectType,
          confidence: detection.confidence,
          adaptiveTdd: config.automation.tdd,
          conventions: {
            testFramework: conventions.testFramework,
            testLocation: conventions.testLocation,
            strictMode: conventions.strictMode,
            confidence: conventions.confidence,
          },
        },
        astFindings,
        relevantSkills: [
          'tdd-core',
          ...(detection.projectType === 'laravel' ? ['stack-laravel', 'stack-postgres-migrations'] : []),
          ...(detection.projectType?.includes('react') || detection.projectType === 'nextjs' ? ['stack-react'] : []),
          'mr-conventions',
          'traceability',
        ],
      });
    }

    case 'verify': {
      const layers = await testRunner.runConfiguredLayers(config.testing, projectPath);
      const changedFiles = vcsService.getChangedFiles(true);
      const changedTestFiles = detectChangedTestFiles(changedFiles);
      const codeQuality = await analyzeChangedFiles(projectPath, changedFiles);

      const healthRaw = await handleHealth({ detailed: false, path: projectPath, saveHistory: true }, state);
      const health = parseJsonResponse(healthRaw.content[0].text);

      const currentBranch = vcsService.getCurrentBranch();
      const branchValid = config.workflow.requireTicketInBranch
        ? vcsService.validateBranchName(currentBranch)
        : true;

      const mergeBase = vcsService.resolveMergeBase();
      const branchCommitMessages = vcsService
        .getCommitsSince(mergeBase)
        .map(commit => commit.subject);
      const commitCheck = config.workflow.commitConvention === 'conventional'
        ? validateConventionalCommits(branchCommitMessages)
        : { valid: true, invalidMessages: [] };

      const blockers: string[] = [];

      for (const layer of layers) {
        if (layer.tests && !layer.tests.success) {
          blockers.push(`[${layer.layer}] Test command failed: ${layer.tests.command}`);
        }
        if (layer.lint && !layer.lint.success) {
          blockers.push(`[${layer.layer}] Lint command failed: ${layer.lint.command}`);
        }
        if (layer.build && !layer.build.success) {
          blockers.push(`[${layer.layer}] Build command failed: ${layer.build.command}`);
        }
      }

      if (!branchValid) {
        blockers.push(`Branch "${currentBranch}" does not match pattern "${config.vcs.branchPattern}".`);
      }
      if (!commitCheck.valid) {
        blockers.push(`Found ${commitCheck.invalidMessages.length} non-conventional commit messages.`);
      }

      const tddBudgetMet = changedTestFiles.length >= config.workflow.testBudget;
      if (!tddBudgetMet) {
        blockers.push(
          `TDD budget not met. Required ${config.workflow.testBudget} changed tests, found ${changedTestFiles.length}.`
        );
      }

      const passed = blockers.length === 0;
      const reportMarkdown = [
        '## Verifier Report',
        '',
        `- Result: ${passed ? 'PASS' : 'FAIL'}`,
        `- Branch: ${branchValid ? 'valid' : 'invalid'} (${currentBranch})`,
        `- TDD budget: ${changedTestFiles.length}/${config.workflow.testBudget}`,
        `- Code quality score: ${codeQuality.score}`,
        `- Health score: ${String(health.score || health.overallScore || 'n/a')}`,
        blockers.length > 0 ? '- Blockers:' : '- Blockers: none',
        ...blockers.map(blocker => `  - ${blocker}`),
      ].join('\n');

      return jsonResponse({
        action: 'verify',
        passed,
        layers,
        tddBudget: {
          required: config.workflow.testBudget,
          found: changedTestFiles.length,
          met: tddBudgetMet,
          changedTestFiles,
        },
        codeQuality,
        traceability: {
          branch: branchValid,
          commitConvention: commitCheck.valid,
          invalidCommits: commitCheck.invalidMessages,
        },
        health,
        blockers,
        reportMarkdown,
      });
    }

    case 'release': {
      const targetVersion = input.version || 'v0.0.0';
      const ciStatus = await vcsService.getCIStatus(config.vcs.defaultBranch);
      const latestTag = vcsService.getLatestTag();
      const commits = latestTag
        ? vcsService.getCommitsSince(latestTag)
        : [];

      const recommendation = calculateReleaseRecommendation(commits);
      const grouped = groupCommitsByType(commits);

      let tagCreated = false;
      if (input.createTag && ciStatus.state === 'success') {
        vcsService.createAnnotatedTag(targetVersion, `Release ${targetVersion}`);
        tagCreated = true;
      }

      let pullRequest: Awaited<ReturnType<VcsService['createPullRequest']>> | null = null;
      if (input.createPullRequest && ciStatus.state === 'success') {
        pullRequest = await vcsService.createPullRequest({
          title: `${targetVersion}: release`,
          body: `Automated release for ${targetVersion}`,
          base: config.vcs.defaultBranch,
        });
      }

      return jsonResponse({
        action: 'release',
        targetVersion,
        ciStatus,
        latestTag,
        recommendation,
        commits: {
          total: commits.length,
          grouped,
        },
        blocked: ciStatus.state !== 'success',
        blockers: ciStatus.state === 'success'
          ? []
          : [`CI status is ${ciStatus.state}; release actions are blocked.`],
        tagCreated,
        pullRequest,
      });
    }

    default:
      return errorResponse(`Unknown agent action "${input.action}".`);
  }
}
