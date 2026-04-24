/**
 * Workflow handler — lazy-loads TDD agentic workflow content.
 * Only the requested agent/skill/command/hook is returned per call,
 * keeping token usage minimal.
 * @version 4.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { textResponse, jsonResponse, errorResponse, ToolResponse } from './types.js';
import { ServerState } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_ROOT = path.resolve(__dirname, '../../data/workflows/tdd');

type WorkflowCategory = 'agents' | 'skills' | 'hooks' | 'commands';

const VALID_CATEGORIES: WorkflowCategory[] = ['agents', 'skills', 'hooks', 'commands'];

interface WorkflowItem {
  name: string;
  file: string;
  category: WorkflowCategory;
}

function listCategory(category: WorkflowCategory): WorkflowItem[] {
  const dir = path.join(WORKFLOW_ROOT, category);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') || f.endsWith('.sh'))
    .map(f => ({
      name: f.replace(/\.(md|sh)$/, ''),
      file: f,
      category,
    }));
}

function loadFile(category: WorkflowCategory, name: string): string | null {
  const dir = path.join(WORKFLOW_ROOT, category);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);
  const match = files.find(f => {
    const baseName = f.replace(/\.(md|sh)$/, '');
    return baseName === name || baseName.endsWith(`-${name}`) || baseName.startsWith(`${name}-`);
  });

  if (!match) return null;
  return fs.readFileSync(path.join(dir, match), 'utf-8');
}

export async function handleWorkflow(
  args: Record<string, unknown>,
  _state: ServerState
): Promise<ToolResponse> {
  const action = (args.action as string) || 'list';
  const name = args.name as string | undefined;
  const category = args.category as WorkflowCategory | undefined;

  switch (action) {
    case 'list': {
      if (category && VALID_CATEGORIES.includes(category)) {
        const items = listCategory(category);
        return jsonResponse({
          category,
          count: items.length,
          items: items.map(i => i.name),
        });
      }

      const all: Record<string, string[]> = {};
      for (const cat of VALID_CATEGORIES) {
        all[cat] = listCategory(cat).map(i => i.name);
      }
      return jsonResponse({
        workflow: 'tdd',
        description: 'TDD agentic workflow with 5 roles: Intake → Planner → Implementer → Verifier → Releaser',
        categories: all,
        usage: 'Use workflow action:"agent" name:"tdd-planner" to load a specific role on demand.',
      });
    }

    case 'agent': {
      if (!name) return errorResponse('Missing "name" parameter.', 'Available: task-intake, tdd-planner, tdd-implementer, verifier, releaser');
      const content = loadFile('agents', name);
      if (!content) return errorResponse(`Agent "${name}" not found.`, 'Use workflow action:"list" category:"agents" to see available agents.');
      return textResponse(content);
    }

    case 'skill': {
      if (!name) return errorResponse('Missing "name" parameter.', 'Available: tdd-core, stack-laravel, stack-react, stack-postgres-migrations, mr-conventions, traceability');
      const content = loadFile('skills', name);
      if (!content) return errorResponse(`Skill "${name}" not found.`, 'Use workflow action:"list" category:"skills" to see available skills.');
      return textResponse(content);
    }

    case 'command': {
      if (!name) return errorResponse('Missing "name" parameter.', 'Available: intake, plan, implement, verify, release');
      const content = loadFile('commands', name);
      if (!content) return errorResponse(`Command "${name}" not found.`, 'Use workflow action:"list" category:"commands" to see available commands.');
      return textResponse(content);
    }

    case 'hook': {
      if (!name) return errorResponse('Missing "name" parameter.', 'Available: check-branch-name, check-ticket-key, check-commit-msg');
      const content = loadFile('hooks', name);
      if (!content) return errorResponse(`Hook "${name}" not found.`, 'Use workflow action:"list" category:"hooks" to see available hooks.');
      return textResponse(content);
    }

    default:
      return errorResponse(
        `Unknown action "${action}".`,
        'Valid actions: list, agent, skill, command, hook'
      );
  }
}
