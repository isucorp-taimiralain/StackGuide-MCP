/**
 * Init handler — scaffolds a `.stackguide/` directory inside the target project
 * with only the workflow files relevant to the detected stack.
 * @version 4.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { textResponse, jsonResponse, errorResponse, ToolResponse } from './types.js';
import { ServerState } from './types.js';
import { detectProjectType, DetectionResult } from '../services/autoDetect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_ROOT = path.resolve(__dirname, '../../data/workflows/tdd');

interface StackMapping {
  agents: string[];
  skills: string[];
  hooks: string[];
  commands: string[];
}

const CORE_FILES: StackMapping = {
  agents: [
    '00-task-intake.md',
    '01-tdd-planner.md',
    '02-tdd-implementer.md',
    '03-verifier.md',
    '04-releaser.md',
  ],
  skills: ['tdd-core.md', 'mr-conventions.md', 'traceability.md'],
  hooks: ['check-branch-name.sh', 'check-ticket-key.sh', 'check-commit-msg.sh'],
  commands: ['intake.md', 'plan.md', 'implement.md', 'verify.md', 'release.md'],
};

const STACK_SKILLS: Record<string, string[]> = {
  'laravel': ['stack-laravel.md', 'stack-postgres-migrations.md'],
  'react-node': ['stack-react.md'],
  'react-typescript': ['stack-react.md'],
  'nextjs': ['stack-react.md'],
  'python-django': ['stack-postgres-migrations.md'],
  'python-fastapi': [],
  'python-flask': [],
  'nestjs': [],
  'vue-node': [],
  'express': [],
  'rails': ['stack-postgres-migrations.md'],
  'golang': [],
  'rust': [],
};

function copyFile(src: string, dest: string): boolean {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

function scaffoldProject(
  projectPath: string,
  detection: DetectionResult | null
): { copied: string[]; skipped: string[]; stackType: string | null } {
  const destRoot = path.join(projectPath, '.stackguide');
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const [category, files] of Object.entries(CORE_FILES)) {
    for (const file of files) {
      const src = path.join(WORKFLOW_ROOT, category, file);
      const dest = path.join(destRoot, category, file);
      if (fs.existsSync(src)) {
        if (copyFile(src, dest)) {
          copied.push(path.join(category, file));
        } else {
          skipped.push(path.join(category, file));
        }
      }
    }
  }

  const stackType = detection?.projectType || null;
  const extraSkills = stackType ? (STACK_SKILLS[stackType] || []) : [];

  for (const file of extraSkills) {
    const src = path.join(WORKFLOW_ROOT, 'skills', file);
    const dest = path.join(destRoot, 'skills', file);
    if (fs.existsSync(src) && !copied.includes(path.join('skills', file))) {
      if (copyFile(src, dest)) {
        copied.push(path.join('skills', file));
      } else {
        skipped.push(path.join('skills', file));
      }
    }
  }

  const readmeSrc = path.join(WORKFLOW_ROOT, 'README.md');
  const readmeDest = path.join(destRoot, 'README.md');
  if (fs.existsSync(readmeSrc)) {
    if (copyFile(readmeSrc, readmeDest)) {
      copied.push('README.md');
    }
  }

  if (files(path.join(destRoot, 'hooks')).length > 0) {
    const hookFiles = fs.readdirSync(path.join(destRoot, 'hooks')).filter(f => f.endsWith('.sh'));
    for (const h of hookFiles) {
      try {
        fs.chmodSync(path.join(destRoot, 'hooks', h), 0o755);
      } catch { /* non-critical */ }
    }
  }

  return { copied, skipped, stackType };
}

function files(dir: string): string[] {
  try {
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  } catch {
    return [];
  }
}

export async function handleInit(
  args: Record<string, unknown>,
  _state: ServerState
): Promise<ToolResponse> {
  const action = (args.action as string) || 'full';
  const projectPath = (args.path as string) || process.cwd();

  if (!fs.existsSync(projectPath)) {
    return errorResponse(`Path "${projectPath}" does not exist.`);
  }

  switch (action) {
    case 'detect': {
      const detection = detectProjectType(projectPath);
      return jsonResponse({
        detected: detection.detected,
        projectType: detection.projectType,
        confidence: detection.confidence,
        languages: detection.languages,
        frameworks: detection.frameworks,
        indicators: detection.indicators,
        message: detection.detected
          ? `Detected ${detection.projectType} (${detection.confidence} confidence). Run init action:"full" to scaffold.`
          : 'Could not auto-detect project type. You can specify one with init action:"full" type:"react-node".',
      });
    }

    case 'full': {
      const forcedType = args.type as string | undefined;
      let detection: DetectionResult | null = null;

      if (forcedType) {
        detection = {
          detected: true,
          projectType: forcedType,
          confidence: 'high',
          indicators: [`Manually specified: ${forcedType}`],
          suggestions: [],
          frameworks: [],
          languages: [],
        };
      } else {
        detection = detectProjectType(projectPath);
      }

      const result = scaffoldProject(projectPath, detection);

      return jsonResponse({
        success: true,
        projectPath,
        stackType: result.stackType,
        directory: '.stackguide/',
        files: {
          copied: result.copied,
          skipped: result.skipped,
        },
        totalFiles: result.copied.length,
        nextSteps: [
          'Review the generated `.stackguide/` directory.',
          'Use `workflow action:"agent" name:"tdd-planner"` to start planning with lazy loading.',
          'Commit `.stackguide/` to your repo so the whole team benefits.',
          result.stackType
            ? `Stack-specific skills for ${result.stackType} have been included.`
            : 'No stack detected — only core files were scaffolded. Run init with type:"your-stack" to add stack-specific skills.',
        ],
      });
    }

    case 'status': {
      const sgDir = path.join(projectPath, '.stackguide');
      if (!fs.existsSync(sgDir)) {
        return jsonResponse({
          initialized: false,
          message: 'No .stackguide/ directory found. Run init action:"full" to scaffold.',
        });
      }

      const categories = ['agents', 'skills', 'hooks', 'commands'];
      const structure: Record<string, string[]> = {};
      for (const cat of categories) {
        structure[cat] = files(path.join(sgDir, cat));
      }

      return jsonResponse({
        initialized: true,
        path: sgDir,
        structure,
      });
    }

    default:
      return errorResponse(
        `Unknown action "${action}".`,
        'Valid actions: detect, full, status'
      );
  }
}
