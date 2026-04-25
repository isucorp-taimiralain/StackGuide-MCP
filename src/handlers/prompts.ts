/**
 * Prompt Handlers - MCP Prompts
 * @version 3.4.0
 */

import { ProjectType, SUPPORTED_PROJECTS } from '../config/types.js';
import * as autoDetect from '../services/autoDetect.js';
import { ServerState } from './types.js';
import { safeFetch } from '../utils/safeFetch.js';

// ============================================================================
// Types
// ============================================================================

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface PromptResult {
  messages: PromptMessage[];
}

export interface PromptInfo {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

const ALLOWED_PROMPT_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org'
];

// ============================================================================
// Prompt Definitions
// ============================================================================

export function listAllPrompts(): PromptInfo[] {
  return [
    {
      name: 'welcome',
      description: 'Get started with StackGuide - interactive setup wizard',
      arguments: []
    },
    {
      name: 'configure_project',
      description: 'Smart project configuration with auto-detection and suggestions',
      arguments: [
        { name: 'projectPath', description: 'Path to your project (use "." for current directory)', required: false }
      ]
    },
    {
      name: 'code_review',
      description: 'Review code from file, URL, or pasted code against active rules',
      arguments: [
        { name: 'filePath', description: 'Local file path to review (optional)', required: false },
        { name: 'url', description: 'URL to fetch and review (optional)', required: false },
        { name: 'code', description: 'Code snippet to review (optional)', required: false }
      ]
    },
    {
      name: 'apply_patterns',
      description: 'Apply architecture patterns from knowledge base',
      arguments: [
        { name: 'task', description: 'Task or feature to implement', required: true }
      ]
    },
    {
      name: 'tdd_intake',
      description: 'Activate the Task Intake agent — reads a ticket and produces a brief for the Planner',
      arguments: [
        { name: 'ticketKey', description: 'Ticket identifier (e.g. PROJ-123)', required: true }
      ]
    },
    {
      name: 'tdd_plan',
      description: 'Activate the TDD Planner agent — produces a test-first plan with 3 tests for a vertical slice',
      arguments: [
        { name: 'brief', description: 'Brief from Intake or direct task description', required: true }
      ]
    },
    {
      name: 'tdd_implement',
      description: 'Activate the TDD Implementer agent — executes Red → Green → Refactor for the planned tests',
      arguments: [
        { name: 'plan', description: 'Approved plan from the TDD Planner', required: true }
      ]
    },
    {
      name: 'tdd_verify',
      description: 'Activate the Verifier agent — runs the quality gate checklist before the MR',
      arguments: []
    },
    {
      name: 'tdd_release',
      description: 'Activate the Releaser agent — safely tags, generates release notes and publishes',
      arguments: [
        { name: 'version', description: 'Target version (e.g. v1.2.0)', required: true }
      ]
    }
  ];
}

// ============================================================================
// Prompt Handlers
// ============================================================================

export function handleWelcomePrompt(): PromptResult {
  const projectTypes = Object.values(SUPPORTED_PROJECTS)
    .map(p => `- **${p.type}**: ${p.name} (${p.languages.join(', ')})`)
    .join('\n');

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `# Welcome to StackGuide! 👋

I'm your AI coding context manager. I help you load the right rules, standards, and knowledge for your project.

## Quick Start
Just tell me: "Set up my project" and I'll analyze your codebase and configure everything automatically.

## Supported Project Types
${projectTypes}

## What I Can Do
- 📋 Load coding standards and best practices for your stack
- 🔍 Browse and import rules from cursor.directory
- 📚 Provide architecture patterns and solutions
- 💾 Save configurations for your projects

Just describe your project and I'll configure everything for you!`
      }
    }]
  };
}

export function handleConfigureProjectPrompt(args: Record<string, unknown>): PromptResult {
  const projectPath = (args.projectPath as string) || '.';
  const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;

  let detection: autoDetect.DetectionResult | null = null;
  try {
    detection = autoDetect.detectProjectType(resolvedPath);
  } catch { /* Path might not exist */ }

  if (detection?.detected && detection.projectType) {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `# Project Detected! 🎯

**Type**: ${detection.projectType}
**Confidence**: ${detection.confidence}
**Languages**: ${detection.languages.join(', ')}
**Frameworks**: ${detection.frameworks.join(', ')}

Would you like me to set this up for you?`
        }
      }]
    };
  }

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `# Let's Configure Your Project 🔧

I couldn't auto-detect the project type. Tell me about your project or choose from:
${Object.values(SUPPORTED_PROJECTS).map(p => `- **${p.type}**: ${p.name}`).join('\n')}`
      }
    }]
  };
}

export async function handleCodeReviewPrompt(
  args: Record<string, unknown>,
  state: ServerState
): Promise<PromptResult> {
  const { filePath, url, code } = args as { filePath?: string; url?: string; code?: string };
  const projectName = state.activeProjectType
    ? SUPPORTED_PROJECTS[state.activeProjectType].name
    : 'the current project';

  let codeToReview = code || '';
  let source = 'provided code';

  if (filePath && !codeToReview) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      if (fs.existsSync(resolved)) {
        codeToReview = fs.readFileSync(resolved, 'utf-8');
        source = filePath;
      }
    } catch { /* ignore */ }
  }

  if (url && !codeToReview) {
    try {
      const response = await safeFetch(url, {
        allowedHosts: ALLOWED_PROMPT_HOSTS,
        timeoutMs: 8000,
        maxBytes: 1024 * 512, // 512 KB cap from prompts
      });
      codeToReview = await response.text();
      source = url;
    } catch { /* ignore to keep prompt usable */ }
  }

  const rules = state.loadedRules
    .filter(r => !state.activeConfiguration || state.activeConfiguration.selectedRules.includes(r.id))
    .map(r => `- ${r.name}: ${r.description}`)
    .join('\n');

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Review the following code for ${projectName}.

Source: ${source}

Active Rules:
${rules || 'No specific rules selected. Using general best practices.'}

Code to Review:
\`\`\`
${codeToReview.substring(0, 15000)}
\`\`\`
${codeToReview.length > 15000 ? '\n(Code truncated for length)' : ''}

Please analyze for:
1. Compliance with coding standards
2. Security issues
3. Performance concerns
4. Best practices
5. Suggested improvements`
      }
    }]
  };
}

export function handleApplyPatternsPrompt(
  args: Record<string, unknown>,
  state: ServerState
): PromptResult {
  const task = (args.task as string) || '';
  const projectName = state.activeProjectType
    ? SUPPORTED_PROJECTS[state.activeProjectType].name
    : 'the current project';

  const knowledge = state.loadedKnowledge
    .filter(k => state.activeConfiguration?.selectedKnowledge.includes(k.id))
    .map(k => `### ${k.name}\n${k.description}`)
    .join('\n\n');

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Implement the following task for ${projectName} using established patterns.

Task: ${task}

Available Patterns and Knowledge:
${knowledge || 'No specific knowledge selected. Using general patterns.'}

Please:
1. Analyze the task requirements
2. Suggest appropriate patterns
3. Provide implementation guidance
4. Include code examples where helpful`
      }
    }]
  };
}

// ============================================================================
// TDD Workflow Prompts (active agent tool)
// ============================================================================

function handleTddIntakePrompt(args: Record<string, unknown>): PromptResult {
  const ticketKey = (args.ticketKey as string) || '<TICKET-KEY>';

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Use the active StackGuide workflow.

Step 1: Call the MCP tool:
- agent action:"intake" ticket:"${ticketKey}"

Step 2: Use the returned structured brief to identify missing details (if any gaps are reported).
Step 3: Continue with prompt tdd_plan and pass the normalized brief.

Do not load passive role markdown; use the active tool output as the source of truth.`
      }
    }]
  };
}

function handleTddPlanPrompt(args: Record<string, unknown>): PromptResult {
  const brief = (args.brief as string) || '<paste brief here>';

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Create a test-first implementation plan using active tooling.

Step 1: Call:
- agent action:"plan" brief:"${brief.replace(/"/g, '\\"')}"

Step 2: Use the returned JSON plan:
- Keep exactly 3 tests in the plan.
- Respect branch proposal and conventions.
- Keep the scope to one vertical slice.

Step 3: If the plan is approved, implement Red -> Green -> Refactor and then run tdd_verify.

Do not paste large methodology documents; rely on tool output.`
      }
    }]
  };
}

function handleTddImplementPrompt(args: Record<string, unknown>): PromptResult {
  const plan = (args.plan as string) || '<paste approved plan here>';

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Implement the approved plan.

Approved plan:
${plan}

Execution requirements:
1) Run Red -> Green -> Refactor for each of the 3 tests.
2) Keep commits traceable to the ticket and follow conventional commits.
3) After implementation, call:
- agent action:"verify"

Use the verifier output as the release gate.`
      }
    }]
  };
}

function handleTddVerifyPrompt(): PromptResult {
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Run the active quality gate.

Call:
- agent action:"verify"

Interpret the Verifier report:
- If blockers exist, fix and run verify again.
- If pass=true, proceed to release or MR creation.

The tool output is authoritative for tests/lint/build, branch convention, TDD budget and quality score.`
      }
    }]
  };
}

function handleTddReleasePrompt(args: Record<string, unknown>): PromptResult {
  const version = (args.version as string) || 'vX.Y.Z';

  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Run release preflight and notes generation with active tooling.

Call:
- agent action:"release" version:"${version}"

Optional:
- agent action:"release" version:"${version}" createTag:true createPullRequest:true

Only execute tag/PR creation when CI is green and verifier checks are passing.`
      }
    }]
  };
}

// ============================================================================
// Router-based Prompt Handler
// ============================================================================

export async function handlePrompt(
  name: string,
  args: Record<string, unknown>,
  state: ServerState
): Promise<PromptResult> {
  switch (name) {
    case 'welcome':
      return handleWelcomePrompt();
    case 'configure_project':
      return handleConfigureProjectPrompt(args);
    case 'code_review':
      return await handleCodeReviewPrompt(args, state);
    case 'apply_patterns':
      return handleApplyPatternsPrompt(args, state);
    case 'tdd_intake':
      return handleTddIntakePrompt(args);
    case 'tdd_plan':
      return handleTddPlanPrompt(args);
    case 'tdd_implement':
      return handleTddImplementPrompt(args);
    case 'tdd_verify':
      return handleTddVerifyPrompt();
    case 'tdd_release':
      return handleTddReleasePrompt(args);
    default:
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: `Unknown prompt: ${name}` }
        }]
      };
  }
}
