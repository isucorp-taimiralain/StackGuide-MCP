/**
 * Review handler - code review against active rules
 * Phase 3: Real code analysis with pattern matching
 * 
 * Improvements:
 * - Security limits to prevent DoS (max files, max size, timeout)
 * - Parallel file analysis with batching
 * - Respects .gitignore patterns
 * - Configurable scan depth (default 10)
 * - Incremental mode using git diff
 * - Analysis caching by file hash
 * - Symlink detection and skipping
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
import { AnalysisCacheManager } from '../services/analysisCache.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { sanitizePath } from '../validation/schemas.js';
import { safeFetch } from '../utils/safeFetch.js';

// Security: Default limits to prevent DoS
const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100 KB per file
const SCAN_TIMEOUT_MS = 60000; // 60 seconds max scan time

interface ReviewArgs {
  file?: string;
  url?: string;
  project?: boolean;
  focus?: 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards';
  incremental?: boolean;  // Only analyze changed files (git diff)
  maxDepth?: number;      // Max directory depth (default 10)
  maxFiles?: number;      // Max files to analyze (default 500)
  useCache?: boolean;     // Use analysis cache (default true)
}

type ReviewFocus = 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards';

const ALLOWED_REVIEW_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org'
];

// Default ignore patterns (in addition to .gitignore)
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '__pycache__',
  'venv',
  '.venv',
  'dist',
  'build',
  'vendor',
  '.git',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'tmp',
  'temp',
  '.turbo',
  'out',
  '.output',
];

/**
 * Parse .gitignore file and return patterns
 */
function parseGitignore(projectPath: string): string[] {
  const fs = require('fs');
  const path = require('path');
  const gitignorePath = path.join(projectPath, '.gitignore');
  
  try {
    if (!fs.existsSync(gitignorePath)) {
      return [];
    }
    
    const stat = fs.lstatSync(gitignorePath);
    // Security: skip symlinks
    if (stat.isSymbolicLink()) {
      logger.warn('Skipping symlinked .gitignore', { path: gitignorePath });
      return [];
    }
    
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Check if a path should be ignored
 */
function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  const parts = relativePath.split('/');
  
  for (const pattern of ignorePatterns) {
    // Simple pattern matching
    if (pattern.startsWith('/')) {
      // Root-relative pattern
      if (relativePath.startsWith(pattern.slice(1))) return true;
    } else if (pattern.endsWith('/')) {
      // Directory pattern
      const dir = pattern.slice(0, -1);
      if (parts.includes(dir)) return true;
    } else if (pattern.includes('*')) {
      // Glob pattern (simple)
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (parts.some(p => regex.test(p))) return true;
    } else {
      // Simple name match
      if (parts.includes(pattern)) return true;
    }
  }
  
  return false;
}

/**
 * Get list of changed files from git
 */
async function getChangedFiles(projectPath: string): Promise<string[]> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    // Get both staged and unstaged changes
    const { stdout } = await execAsync(
      'git diff --name-only HEAD && git diff --name-only --cached',
      { cwd: projectPath }
    );
    
    return [...new Set(stdout.trim().split('\n').filter(Boolean))] as string[];
  } catch {
    logger.debug('Git not available or not a git repository');
    return [];
  }
}

/**
 * Analyze files in parallel batches
 */
async function analyzeFilesParallel(
  files: Array<{ path: string; content: string }>,
  focus: ReviewFocus,
  cacheManager: AnalysisCacheManager | null,
  batchSize = 10
): Promise<{ files: AnalysisResult[]; cacheHits: number; cacheMisses: number }> {
  const results: AnalysisResult[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        // Check cache first
        if (cacheManager) {
          const cached = cacheManager.get(file.path, file.content);
          if (cached) {
            cacheHits++;
            return cached;
          }
          cacheMisses++;
        }
        
        // Analyze file
        const result = analyzeCode(file.path, file.content, focus);
        
        // Store in cache
        if (cacheManager) {
          cacheManager.set(file.path, file.content, result);
        }
        
        return result;
      })
    );
    
    results.push(...batchResults);
  }
  
  return { files: results, cacheHits, cacheMisses };
}

export async function handleReview(
  args: ReviewArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { 
    file, 
    url, 
    project: reviewProject, 
    focus = 'all',
    incremental = false,
    maxDepth = 10,
    maxFiles,
    useCache = true
  } = args;
  const focusValue = focus as ReviewFocus;

  logger.debug('Review requested', { file, url, reviewProject, focus, incremental, maxDepth });

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
    
    // Initialize cache if enabled
    const cacheManager = useCache ? new AnalysisCacheManager(projectPath) : null;
    
    // Parse .gitignore patterns
    const gitignorePatterns = parseGitignore(projectPath);
    const allIgnorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...gitignorePatterns];
    
    // Get changed files if incremental mode
    let changedFiles: string[] | null = null;
    if (incremental) {
      changedFiles = await getChangedFiles(projectPath);
      if (changedFiles.length === 0) {
        return jsonResponse({
          type: 'project-review',
          projectType: state.activeProjectType,
          focus: focusValue,
          message: 'No changed files found. Run without incremental:true to analyze all files.',
          filesAnalyzed: 0
        });
      }
      logger.debug('Incremental mode: analyzing changed files', { count: changedFiles.length });
    }
    
    const filesToAnalyze: Array<{ path: string; content: string }> = [];
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb', '.php'];
    let skippedByIgnore = 0;
    let skippedBySize = 0;
    let skippedBySymlink = 0;
    let totalBytesRead = 0;
    let scanAborted = false;
    let abortReason = '';
    
    // Security: apply default limits
    const effectiveMaxFiles = maxFiles ?? DEFAULT_MAX_FILES;
    const scanStartTime = Date.now();

    function scan(dir: string, depth = 0): void {
      // Security: check timeout
      if (Date.now() - scanStartTime > SCAN_TIMEOUT_MS) {
        if (!scanAborted) {
          scanAborted = true;
          abortReason = `Scan timeout exceeded (${SCAN_TIMEOUT_MS / 1000}s)`;
          logger.warn('Review scan aborted: timeout', { timeout: SCAN_TIMEOUT_MS });
        }
        return;
      }
      
      if (depth > maxDepth) return;
      if (filesToAnalyze.length >= effectiveMaxFiles) {
        if (!scanAborted) {
          scanAborted = true;
          abortReason = `Max files limit reached (${effectiveMaxFiles})`;
        }
        return;
      }
      
      // Security: check total size limit
      if (totalBytesRead >= DEFAULT_MAX_TOTAL_SIZE) {
        if (!scanAborted) {
          scanAborted = true;
          abortReason = `Max total size exceeded (${DEFAULT_MAX_TOTAL_SIZE / 1024 / 1024}MB)`;
          logger.warn('Review scan aborted: size limit', { totalBytes: totalBytesRead });
        }
        return;
      }
      
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (scanAborted) return;
          if (filesToAnalyze.length >= effectiveMaxFiles) return;
          if (item.startsWith('.')) continue;
          
          const full = path.join(dir, item);
          const relativePath = path.relative(projectPath, full);
          
          // Check ignore patterns
          if (shouldIgnore(relativePath, allIgnorePatterns)) {
            skippedByIgnore++;
            continue;
          }
          
          // Security: use lstat to detect symlinks
          const stat = fs.lstatSync(full);
          
          // Security: skip symlinks to prevent loops and escapes
          if (stat.isSymbolicLink()) {
            skippedBySymlink++;
            continue;
          }
          
          if (stat.isDirectory()) {
            scan(full, depth + 1);
          } else if (exts.some(e => item.endsWith(e))) {
            // Check file size (skip files > 100KB)
            if (stat.size > DEFAULT_MAX_FILE_SIZE) {
              skippedBySize++;
              continue;
            }
            
            // In incremental mode, only analyze changed files
            if (changedFiles && !changedFiles.includes(relativePath)) {
              continue;
            }
            
            try {
              const content = fs.readFileSync(full, 'utf-8');
              totalBytesRead += Buffer.byteLength(content, 'utf-8');
              filesToAnalyze.push({ path: relativePath, content });
            } catch { /* ignore unreadable files */ }
          }
        }
      } catch { /* ignore */ }
    }
    scan(projectPath);

    // Analyze files in parallel with caching
    const startTime = Date.now();
    const { files: analysisResults, cacheHits, cacheMisses } = await analyzeFilesParallel(
      filesToAnalyze,
      focusValue,
      cacheManager
    );
    
    // Save cache
    if (cacheManager) {
      cacheManager.save();
    }
    
    const analysisTime = Date.now() - startTime;

    // Aggregate results
    const overall = {
      totalFiles: analysisResults.length,
      averageScore: analysisResults.length > 0
        ? Math.round(analysisResults.reduce((sum, r) => sum + r.score, 0) / analysisResults.length)
        : 100,
      summary: {
        errors: analysisResults.reduce((sum, r) => sum + r.summary.errors, 0),
        warnings: analysisResults.reduce((sum, r) => sum + r.summary.warnings, 0),
        info: analysisResults.reduce((sum, r) => sum + r.summary.info, 0),
        suggestions: analysisResults.reduce((sum, r) => sum + r.summary.suggestions, 0),
      }
    };

    // Format report
    const report: string[] = [];
    report.push(`# Project Review Report`);
    report.push(`**Project Type:** ${state.activeProjectType || 'auto-detected'}`);
    report.push(`**Focus:** ${focusValue}`);
    report.push(`**Files Analyzed:** ${overall.totalFiles}`);
    if (incremental) {
      report.push(`**Mode:** Incremental (changed files only)`);
    }
    report.push(`**Analysis Time:** ${analysisTime}ms`);
    if (useCache) {
      report.push(`**Cache:** ${cacheHits} hits, ${cacheMisses} misses`);
    }
    if (skippedByIgnore > 0 || skippedBySize > 0 || skippedBySymlink > 0) {
      report.push(`**Skipped:** ${skippedByIgnore} by ignore patterns, ${skippedBySize} by size limit, ${skippedBySymlink} symlinks`);
    }
    if (scanAborted) {
      report.push(`**⚠️ Scan Aborted:** ${abortReason}`);
    }
    report.push('');
    report.push(`## Overall Score: ${overall.averageScore}/100`);
    report.push('');
    report.push('### Summary');
    report.push(`- 🔴 Errors: ${overall.summary.errors}`);
    report.push(`- 🟡 Warnings: ${overall.summary.warnings}`);
    report.push(`- 🔵 Info: ${overall.summary.info}`);
    report.push(`- 💡 Suggestions: ${overall.summary.suggestions}`);
    report.push('');

    // Top issues by file (only files with issues)
    const filesWithIssues = analysisResults
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
      analysis: overall,
      filesWithIssues: filesWithIssues.length,
      analysisTime: `${analysisTime}ms`,
      cache: useCache ? { hits: cacheHits, misses: cacheMisses } : undefined,
      incremental,
      scanAborted: scanAborted ? abortReason : undefined,
      skipped: {
        byIgnore: skippedByIgnore,
        bySize: skippedBySize,
        bySymlink: skippedBySymlink
      },
      limits: {
        maxFiles: effectiveMaxFiles,
        maxTotalSize: `${DEFAULT_MAX_TOTAL_SIZE / 1024 / 1024}MB`,
        timeout: `${SCAN_TIMEOUT_MS / 1000}s`
      },
      report: report.join('\n')
    });
  }

  // Review file or URL
  let content = '';
  let source = '';

  if (url) {
    try {
      const response = await safeFetch(url, {
        allowedHosts: ALLOWED_REVIEW_HOSTS,
        timeoutMs: 8000,
        maxBytes: 1024 * 1024, // 1 MB cap for reviews
      });
      content = await response.text();
      source = url;
    } catch (e) {
      return textResponse(`Error fetching URL: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (file) {
    const fs = await import('fs');
    const path = await import('path');
    
    // Security: Sanitize path and prevent path traversal
    const sanitized = sanitizePath(file);
    const cwd = process.cwd();
    const resolved = path.isAbsolute(sanitized)
      ? path.resolve(sanitized)
      : path.resolve(cwd, sanitized);

    // Resolve symlinks and enforce real path containment
    const realCwd = fs.realpathSync(cwd);

    // First containment check without resolving symlinks to avoid ENOENT on missing files
    if (!resolved.startsWith(realCwd + path.sep) && resolved !== realCwd) {
      logger.audit('PATH_TRAVERSAL_BLOCK', {
        originalPath: file,
        sanitizedPath: sanitized,
        resolvedPath: resolved,
        cwd: realCwd,
        action: 'path_traversal_block_pre_realpath'
      });
      return textResponse(`Error: Path traversal detected. Access denied to: ${file}`);
    }

    if (!fs.existsSync(resolved)) {
      return textResponse(`File not found: ${resolved}`);
    }

    const realResolved = fs.realpathSync(resolved);

    if (!realResolved.startsWith(realCwd + path.sep) && realResolved !== realCwd) {
      logger.audit('PATH_TRAVERSAL_BLOCK', { 
        originalPath: file,
        sanitizedPath: sanitized,
        resolvedPath: realResolved,
        cwd: realCwd,
        action: 'path_traversal_block'
      });
      return textResponse(`Error: Path traversal detected. Access denied to: ${file}`);
    }
    
    content = fs.readFileSync(realResolved, 'utf-8');
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
