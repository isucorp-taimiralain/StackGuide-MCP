/**
 * Review handler - code review against active rules
 */

import { ProjectType } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import * as autoDetect from '../services/autoDetect.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface ReviewArgs {
  file?: string;
  url?: string;
  project?: boolean;
  focus?: 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards';
}

export async function handleReview(
  args: ReviewArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { file, url, project: reviewProject, focus = 'all' } = args;

  logger.debug('Review requested', { file, url, reviewProject, focus });

  // Auto-detect if not configured
  if (!state.activeProjectType) {
    const detection = autoDetect.detectProjectType(process.cwd());
    if (detection.detected && detection.projectType) {
      const pt = detection.projectType as ProjectType;
      state.activeProjectType = pt;
      state.loadedRules = rulesProvider.getRulesForProject(pt);
      state.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(pt);
    }
  }

  const activeRules = state.loadedRules.filter(r =>
    focus === 'all' || r.category === focus || r.category?.includes(focus)
  );

  // Review project
  if (reviewProject) {
    const fs = await import('fs');
    const path = await import('path');
    const projectPath = process.cwd();
    const keyFiles: string[] = [];
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];

    function scan(dir: string, depth = 0): void {
      if (depth > 3) return;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.startsWith('.') || ['node_modules', '__pycache__', 'venv', 'dist'].includes(item)) continue;
          const full = path.join(dir, item);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) scan(full, depth + 1);
          else if (exts.some(e => item.endsWith(e))) keyFiles.push(path.relative(projectPath, full));
        }
      } catch { /* ignore */ }
    }
    scan(projectPath);

    return jsonResponse({
      type: 'project-review',
      projectType: state.activeProjectType,
      focus,
      filesFound: keyFiles.length,
      keyFiles: keyFiles.slice(0, 25),
      rulesApplied: activeRules.map(r => r.name),
      instructions: `Review this project focusing on ${focus}. Apply the listed rules.`
    });
  }

  // Review file or URL
  let content = '';
  let source = '';

  if (url) {
    try {
      const response = await fetch(url);
      content = await response.text();
      source = url;
    } catch (e) {
      return textResponse(`Error fetching URL: ${e}`);
    }
  } else if (file) {
    const fs = await import('fs');
    const path = await import('path');
    const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
    if (!fs.existsSync(resolved)) {
      return textResponse(`File not found: ${resolved}`);
    }
    content = fs.readFileSync(resolved, 'utf-8');
    source = file;
  } else {
    return textResponse('Specify file, url, or project:true');
  }

  return jsonResponse({
    type: 'file-review',
    source,
    projectType: state.activeProjectType,
    focus,
    rulesApplied: activeRules.map(r => r.name),
    code: content.substring(0, 12000),
    truncated: content.length > 12000,
    instructions: 'Review this code against the active rules.'
  });
}
