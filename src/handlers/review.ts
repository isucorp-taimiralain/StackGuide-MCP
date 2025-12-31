/**
 * Review handler - code review against active rules
 * Phase 3: Real code analysis with pattern matching
 */

import { ProjectType } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import * as autoDetect from '../services/autoDetect.js';
import { 
  analyzeCode, 
  analyzeMultipleFiles, 
  formatAnalysisReport,
  AnalysisResult 
} from '../services/codeAnalyzer.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface ReviewArgs {
  file?: string;
  url?: string;
  project?: boolean;
  focus?: 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards';
}

type ReviewFocus = 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards';

export async function handleReview(
  args: ReviewArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { file, url, project: reviewProject, focus = 'all' } = args;
  const focusValue = focus as ReviewFocus;

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
    focusValue === 'all' || r.category === focusValue || r.category?.includes(focusValue)
  );

  // Review project
  if (reviewProject) {
    const fs = await import('fs');
    const path = await import('path');
    const projectPath = process.cwd();
    const filesToAnalyze: Array<{ path: string; content: string }> = [];
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb', '.php'];

    function scan(dir: string, depth = 0): void {
      if (depth > 3) return;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.startsWith('.') || ['node_modules', '__pycache__', 'venv', 'dist', 'build', 'vendor'].includes(item)) continue;
          const full = path.join(dir, item);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            scan(full, depth + 1);
          } else if (exts.some(e => item.endsWith(e)) && stat.size < 100000) {
            try {
              const content = fs.readFileSync(full, 'utf-8');
              filesToAnalyze.push({ 
                path: path.relative(projectPath, full), 
                content 
              });
            } catch { /* ignore unreadable files */ }
          }
        }
      } catch { /* ignore */ }
    }
    scan(projectPath);

    // Limit to first 50 files for performance
    const limitedFiles = filesToAnalyze.slice(0, 50);
    const analysis = analyzeMultipleFiles(limitedFiles, focusValue);

    // Format report
    const report: string[] = [];
    report.push(`# Project Review Report`);
    report.push(`**Project Type:** ${state.activeProjectType || 'auto-detected'}`);
    report.push(`**Focus:** ${focusValue}`);
    report.push(`**Files Analyzed:** ${analysis.overall.totalFiles}${filesToAnalyze.length > 50 ? ` (limited from ${filesToAnalyze.length})` : ''}`);
    report.push('');
    report.push(`## Overall Score: ${analysis.overall.averageScore}/100`);
    report.push('');
    report.push('### Summary');
    report.push(`- 🔴 Errors: ${analysis.overall.summary.errors}`);
    report.push(`- 🟡 Warnings: ${analysis.overall.summary.warnings}`);
    report.push(`- 🔵 Info: ${analysis.overall.summary.info}`);
    report.push(`- 💡 Suggestions: ${analysis.overall.summary.suggestions}`);
    report.push('');

    // Top issues by file (only files with issues)
    const filesWithIssues = analysis.files
      .filter(f => f.issues.length > 0)
      .sort((a, b) => b.issues.length - a.issues.length)
      .slice(0, 10);

    if (filesWithIssues.length > 0) {
      report.push('### Files with Most Issues');
      for (const fileResult of filesWithIssues) {
        report.push(`\n#### ${fileResult.file} (Score: ${fileResult.score}/100)`);
        for (const issue of fileResult.issues.slice(0, 5)) {
          const icon = issue.severity === 'error' ? '🔴' :
                       issue.severity === 'warning' ? '🟡' :
                       issue.severity === 'info' ? '🔵' : '💡';
          report.push(`- ${icon} **[${issue.rule}]** ${issue.message}${issue.line ? ` (line ${issue.line})` : ''}`);
        }
        if (fileResult.issues.length > 5) {
          report.push(`- ... and ${fileResult.issues.length - 5} more issues`);
        }
      }
    } else {
      report.push('### ✅ No issues found!');
    }

    report.push('');
    report.push('### Rules Applied');
    report.push(activeRules.map(r => `- ${r.name}`).join('\n') || '- Default pattern rules');

    return jsonResponse({
      type: 'project-review',
      projectType: state.activeProjectType,
      focus: focusValue,
      analysis: analysis.overall,
      filesWithIssues: filesWithIssues.length,
      report: report.join('\n')
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

  // Analyze the file
  const analysis = analyzeCode(source, content, focusValue);
  const report = formatAnalysisReport(analysis);

  return jsonResponse({
    type: 'file-review',
    source,
    projectType: state.activeProjectType,
    focus: focusValue,
    analysis: {
      score: analysis.score,
      summary: analysis.summary,
      issuesCount: analysis.issues.length
    },
    issues: analysis.issues,
    report,
    rulesApplied: activeRules.map(r => r.name)
  });
}
