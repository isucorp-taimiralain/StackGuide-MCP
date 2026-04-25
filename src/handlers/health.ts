/**
 * Health handler - Project Health Score Analysis
 * Phase 6: Advanced Features
 * 
 * Improvements:
 * - Configurable weights via stackguide.config.json
 * - Historical tracking of health scores
 * - Project-specific benchmarking
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { analyzeCode, AnalysisResult } from '../services/codeAnalyzer.js';
import { 
  getHealthWeights, 
  getGradeFromScore, 
  HealthWeightsConfig,
  calculateIssueDeduction,
  getWeightsDocumentation
} from '../config/healthWeights.js';
import { HealthInputSchema, validate } from '../validation/schemas.js';

interface HealthArgs {
  projectPath?: string;
  detailed?: boolean;
  showWeights?: boolean;
  saveHistory?: boolean;
}

interface HealthCategory {
  name: string;
  score: number;
  maxScore: number;
  issues: string[];
  suggestions: string[];
}

interface HealthReport {
  overallScore: number;
  grade: string;
  categories: HealthCategory[];
  summary: string;
  criticalIssues: string[];
  recommendations: string[];
}

interface HealthHistoryEntry {
  timestamp: string;
  score: number;
  grade: string;
  categories: Record<string, number>;
}

interface HealthHistory {
  projectPath: string;
  entries: HealthHistoryEntry[];
  checksum?: string;
}

const HISTORY_FILE = '.stackguide/health-history.json';
const MAX_HISTORY_ENTRIES = 100;
const MAX_HEALTH_HISTORY_FILE_SIZE_BYTES = 512 * 1024; // 512 KB
const HEALTH_DIR_MODE = 0o700;
const HEALTH_FILE_MODE = 0o600;
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const INTEGRITY_ENV_KEY = 'STACKGUIDE_INTEGRITY_KEY';

function isPathInside(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

function isSymbolicLink(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${pairs.join(',')}}`;
}

function sanitizeHistoryEntry(raw: unknown): HealthHistoryEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const entry = raw as {
    timestamp?: unknown;
    score?: unknown;
    grade?: unknown;
    categories?: unknown;
  };

  if (
    typeof entry.timestamp !== 'string' ||
    Number.isNaN(Date.parse(entry.timestamp)) ||
    typeof entry.score !== 'number' ||
    !Number.isFinite(entry.score) ||
    typeof entry.grade !== 'string' ||
    !['A', 'B', 'C', 'D', 'F'].includes(entry.grade)
  ) {
    return null;
  }

  const categories: Record<string, number> = {};
  if (entry.categories && typeof entry.categories === 'object') {
    for (const [name, score] of Object.entries(entry.categories as Record<string, unknown>)) {
      if (
        !name ||
        name.length > 120 ||
        RESERVED_KEYS.has(name) ||
        typeof score !== 'number' ||
        !Number.isFinite(score)
      ) {
        continue;
      }
      categories[name] = Math.max(0, Math.min(100, Math.round(score)));
    }
  }

  return {
    timestamp: entry.timestamp,
    score: Math.max(0, Math.min(100, Math.round(entry.score))),
    grade: entry.grade as 'A' | 'B' | 'C' | 'D' | 'F',
    categories,
  };
}

function sanitizeHealthHistory(raw: unknown, projectPath: string): HealthHistory {
  if (!raw || typeof raw !== 'object') {
    return { projectPath, entries: [] };
  }

  const input = raw as {
    projectPath?: unknown;
    entries?: unknown;
    checksum?: unknown;
  };

  const entries: HealthHistoryEntry[] = [];
  if (Array.isArray(input.entries)) {
    for (const rawEntry of input.entries) {
      const entry = sanitizeHistoryEntry(rawEntry);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  return {
    projectPath: typeof input.projectPath === 'string' ? input.projectPath : projectPath,
    entries: entries.slice(-MAX_HISTORY_ENTRIES),
    checksum: typeof input.checksum === 'string' ? input.checksum : undefined,
  };
}

function computeHistoryChecksum(projectPath: string, entries: HealthHistoryEntry[]): string {
  const payload = stableStringify({ projectPath, entries });
  const secret = process.env[INTEGRITY_ENV_KEY];
  if (secret) {
    return `hmac:${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  }
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyHistoryChecksum(checksum: string, projectPath: string, entries: HealthHistoryEntry[]): boolean {
  const payload = stableStringify({ projectPath, entries });

  if (checksum.startsWith('hmac:')) {
    const secret = process.env[INTEGRITY_ENV_KEY];
    if (!secret) {
      logger.warn('HMAC health checksum found but STACKGUIDE_INTEGRITY_KEY is missing');
      return false;
    }
    const expected = `hmac:${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    return timingSafeEqualString(checksum, expected);
  }

  if (checksum.startsWith('sha256:')) {
    const expected = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
    return timingSafeEqualString(checksum, expected);
  }

  // Backward compatibility with old plain SHA256 hex.
  const legacyExpected = crypto.createHash('sha256').update(payload).digest('hex');
  return timingSafeEqualString(checksum, legacyExpected);
}

function getGradeEmoji(grade: string): string {
  const emojis: Record<string, string> = {
    A: '🌟',
    B: '✅',
    C: '⚠️',
    D: '🔶',
    F: '❌',
  };
  return emojis[grade] || '❓';
}

/**
 * Load health history from disk
 */
function loadHealthHistory(projectPath: string): HealthHistory {
  const historyPath = path.join(projectPath, HISTORY_FILE);
  
  try {
    if (!isPathInside(projectPath, historyPath)) {
      logger.warn('Health history path escapes project boundary', { projectPath, historyPath });
      return { projectPath, entries: [] };
    }

    if (isSymbolicLink(historyPath)) {
      logger.warn('Refusing to read health history via symbolic link', { historyPath });
      return { projectPath, entries: [] };
    }

    if (fs.existsSync(historyPath)) {
      const stats = fs.statSync(historyPath);
      if (!stats.isFile()) {
        logger.warn('Health history path is not a file', { historyPath });
        return { projectPath, entries: [] };
      }
      if (stats.size > MAX_HEALTH_HISTORY_FILE_SIZE_BYTES) {
        logger.warn('Health history file too large, ignoring', {
          historyPath,
          size: stats.size,
          maxSize: MAX_HEALTH_HISTORY_FILE_SIZE_BYTES,
        });
        return { projectPath, entries: [] };
      }

      const content = fs.readFileSync(historyPath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      const history = sanitizeHealthHistory(parsed, projectPath);

      if (history.checksum) {
        if (!verifyHistoryChecksum(history.checksum, history.projectPath, history.entries)) {
          logger.warn('Health history checksum mismatch, resetting history', { historyPath });
          return { projectPath, entries: [] };
        }
      }

      return history;
    }
  } catch (error) {
    logger.debug('Failed to load health history', { error });
  }
  
  return { projectPath, entries: [] };
}

/**
 * Save health history to disk
 */
function saveHealthHistory(projectPath: string, history: HealthHistory): void {
  const historyPath = path.join(projectPath, HISTORY_FILE);
  const historyDir = path.dirname(historyPath);
  const tempPath = `${historyPath}.${process.pid}.tmp`;
  
  try {
    if (!isPathInside(projectPath, historyPath)) {
      throw new Error('Health history path escapes project boundary');
    }
    if (isSymbolicLink(historyPath) || isSymbolicLink(historyDir)) {
      throw new Error('Refusing to write health history through symbolic link');
    }

    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true, mode: HEALTH_DIR_MODE });
    }
    
    const sanitized = sanitizeHealthHistory(history, projectPath);
    const entries = sanitized.entries.slice(-MAX_HISTORY_ENTRIES);
    const signed: HealthHistory = {
      projectPath: sanitized.projectPath,
      entries,
      checksum: computeHistoryChecksum(sanitized.projectPath, entries),
    };
    
    fs.writeFileSync(tempPath, JSON.stringify(signed, null, 2), { mode: HEALTH_FILE_MODE });
    fs.renameSync(tempPath, historyPath);
    fs.chmodSync(historyPath, HEALTH_FILE_MODE);
    logger.debug('Saved health history');
  } catch (error) {
    logger.debug('Failed to save health history', { error });
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Add entry to health history
 */
function addHistoryEntry(
  projectPath: string,
  score: number,
  grade: string,
  categories: HealthCategory[]
): void {
  const history = loadHealthHistory(projectPath);
  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const safeGrade = ['A', 'B', 'C', 'D', 'F'].includes(grade) ? grade : 'F';
  
  history.entries.push({
    timestamp: new Date().toISOString(),
    score: boundedScore,
    grade: safeGrade,
    categories: Object.fromEntries(
      categories
        .filter(c => !!c.name && !RESERVED_KEYS.has(c.name))
        .map(c => [c.name, Math.max(0, Math.min(100, Math.round(c.score)))])
    )
  });
  
  saveHealthHistory(projectPath, history);
}

/**
 * Get health trend from history
 */
function getHealthTrend(projectPath: string): { trend: 'improving' | 'declining' | 'stable'; change: number } | null {
  const history = loadHealthHistory(projectPath);
  
  if (history.entries.length < 2) {
    return null;
  }
  
  const recent = history.entries.slice(-5);
  const oldest = recent[0].score;
  const newest = recent[recent.length - 1].score;
  const change = newest - oldest;
  
  if (change > 5) return { trend: 'improving', change };
  if (change < -5) return { trend: 'declining', change };
  return { trend: 'stable', change };
}

// Analyze configuration quality
function analyzeConfiguration(state: ServerState, weights: HealthWeightsConfig): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const maxScore = weights.categories.configuration.maxScore;
  let score = maxScore;

  const hasConfig = !!state.activeProjectType;
  const hasRules = state.loadedRules.length > 0;
  const hasKnowledge = state.loadedKnowledge.length > 0;

  if (!hasConfig) {
    issues.push('No project type configured');
    suggestions.push('Run setup to configure your project type');
    score -= maxScore * 0.25;
  }

  if (!hasRules) {
    issues.push('No rules loaded');
    suggestions.push('Run setup to load rules for your project');
    score -= maxScore * 0.25;
  }

  if (!hasKnowledge) {
    issues.push('No knowledge base loaded');
    suggestions.push('Run setup to load knowledge base');
    score -= maxScore * 0.25;
  }

  if (state.activeConfiguration?.customRules?.length === 0) {
    suggestions.push('Consider adding custom rules for your project');
    score -= maxScore * 0.1;
  }

  return {
    name: weights.categories.configuration.name,
    score: Math.max(0, Math.round(score)),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze code quality based on review results
function analyzeCodeQuality(analysisResult: AnalysisResult | null, weights: HealthWeightsConfig): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const maxScore = weights.categories.codeQuality.maxScore;
  let score = maxScore;

  if (!analysisResult) {
    return {
      name: weights.categories.codeQuality.name,
      score: Math.round(maxScore * 0.5),
      maxScore,
      issues: ['No code analysis performed'],
      suggestions: ['Run review tool to analyze code'],
    };
  }

  // Deduct points based on issues using configurable weights
  const criticalCount = analysisResult.issues.filter(i => i.severity === 'error').length;
  const warningCount = analysisResult.issues.filter(i => i.severity === 'warning').length;
  const infoCount = analysisResult.issues.filter(i => i.severity === 'info').length;

  score -= calculateIssueDeduction('error', criticalCount, weights);
  score -= calculateIssueDeduction('warning', warningCount, weights);
  score -= calculateIssueDeduction('info', infoCount, weights);

  if (criticalCount > 0) {
    issues.push(`${criticalCount} critical issue(s) found`);
  }
  if (warningCount > 0) {
    issues.push(`${warningCount} warning(s) found`);
  }

  // Add specific suggestions based on patterns
  const categories = new Set(analysisResult.issues.map(i => i.category));
  
  if (categories.has('security')) {
    suggestions.push('Address security vulnerabilities immediately');
  }
  if (categories.has('performance')) {
    suggestions.push('Review performance optimizations');
  }
  if (categories.has('maintainability')) {
    suggestions.push('Refactor for better maintainability');
  }
  if (categories.has('best-practice')) {
    suggestions.push('Follow framework best practices');
  }

  return {
    name: weights.categories.codeQuality.name,
    score: Math.max(0, Math.min(maxScore, Math.round(score))),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze structure
function analyzeStructure(state: ServerState, weights: HealthWeightsConfig): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const maxScore = weights.categories.structure.maxScore;
  let score = maxScore;

  // Check if project type is detected
  if (!state.activeProjectType) {
    issues.push('Project structure not analyzed');
    suggestions.push('Run setup to detect project structure');
    score -= maxScore * 0.5;
  } else {
    // Project type detected - good structure
    if (state.loadedRules.length < 3) {
      suggestions.push('Load more rules for comprehensive guidance');
      score -= maxScore * 0.25;
    }
  }

  return {
    name: weights.categories.structure.name,
    score: Math.max(0, Math.round(score)),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze documentation
function analyzeDocumentation(state: ServerState, weights: HealthWeightsConfig): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const maxScore = weights.categories.documentation.maxScore;
  let score = maxScore;

  if (state.loadedKnowledge.length === 0) {
    issues.push('No knowledge/documentation loaded');
    score -= maxScore * 0.33;
  }

  if (!state.activeProjectType) {
    suggestions.push('Configure project type for tailored documentation');
    score -= maxScore * 0.2;
  }

  return {
    name: weights.categories.documentation.name,
    score: Math.max(0, Math.round(score)),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze testing readiness
function analyzeTestingReadiness(state: ServerState, weights: HealthWeightsConfig): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const maxScore = weights.categories.testing.maxScore;
  let score = maxScore;

  // Check if project has testing setup (inferred from project type)
  const hasTestingSupport = state.activeProjectType?.includes('typescript') ||
                            state.activeProjectType?.includes('react') ||
                            state.activeProjectType?.includes('node');

  if (!hasTestingSupport) {
    suggestions.push('Consider adding a testing framework');
    score -= maxScore * 0.33;
  }

  // Check if any loaded rules mention testing
  const hasTestingRules = state.loadedRules.some(r => 
    r.content?.toLowerCase().includes('test') || r.name?.toLowerCase().includes('test')
  );
  
  if (!hasTestingRules) {
    suggestions.push('Add custom rules for testing guidelines');
    score -= maxScore * 0.13;
  }

  return {
    name: weights.categories.testing.name,
    score: Math.max(0, Math.round(score)),
    maxScore,
    issues,
    suggestions,
  };
}

export async function handleHealth(
  args: unknown,
  state: ServerState
): Promise<ToolResponse> {
  // Validate input
  const validation = validate(HealthInputSchema, args || {});
  if (!validation.success) {
    return textResponse(`Validation error: ${validation.error}`);
  }
  
  const { detailed = true, path: projectPathArg } = validation.data;
  const showWeights = (args as any)?.showWeights ?? false;
  const saveHistory = (args as any)?.saveHistory ?? true;
  const projectPath = projectPathArg || process.cwd();

  logger.info('Generating health report', { detailed, showWeights });

  // Load configurable weights
  const weights = getHealthWeights(projectPath);
  
  // Show weights documentation if requested
  if (showWeights) {
    return jsonResponse({
      documentation: getWeightsDocumentation(weights),
      currentWeights: weights
    });
  }

  // Perform a sample code analysis if rules are loaded
  let codeAnalysis: AnalysisResult | null = null;
  if (state.loadedRules.length > 0 && state.activeProjectType) {
    // Use first rule content as sample for basic analysis
    const sampleContent = state.loadedRules[0]?.content || '';
    try {
      codeAnalysis = analyzeCode('sample.ts', sampleContent, 'all');
    } catch (e) {
      logger.warn('Code analysis failed', { error: e });
    }
  }

  // Collect all category scores using configurable weights
  const categories: HealthCategory[] = [
    analyzeConfiguration(state, weights),
    analyzeCodeQuality(codeAnalysis, weights),
    analyzeStructure(state, weights),
    analyzeDocumentation(state, weights),
    analyzeTestingReadiness(state, weights),
  ];

  // Calculate overall score
  const totalScore = categories.reduce((sum, cat) => sum + cat.score, 0);
  const maxTotalScore = categories.reduce((sum, cat) => sum + cat.maxScore, 0);
  const overallScore = Math.round((totalScore / maxTotalScore) * 100);
  const grade = getGradeFromScore(overallScore, weights);

  // Save to history if enabled
  if (saveHistory) {
    addHistoryEntry(projectPath, overallScore, grade, categories);
  }

  // Get health trend
  const trend = getHealthTrend(projectPath);

  // Collect critical issues
  const criticalIssues = categories
    .flatMap(cat => cat.issues)
    .filter(issue => 
      issue.includes('critical') || 
      issue.includes('security') || 
      issue.includes('not configured')
    );

  // Top recommendations
  const recommendations = categories
    .flatMap(cat => cat.suggestions)
    .slice(0, 5);

  // Generate summary
  const summary = generateSummary(grade, overallScore, categories);

  const report: HealthReport = {
    overallScore,
    grade,
    categories,
    summary,
    criticalIssues,
    recommendations,
  };

  if (!detailed) {
    return jsonResponse({
      score: overallScore,
      grade: `${getGradeEmoji(grade)} ${grade}`,
      summary,
      trend: trend ? `${trend.trend} (${trend.change > 0 ? '+' : ''}${trend.change})` : undefined,
      topRecommendations: recommendations.slice(0, 3),
    });
  }

  return jsonResponse({
    header: `🏥 Project Health Report`,
    score: `${overallScore}/100`,
    grade: `${getGradeEmoji(grade)} Grade: ${grade}`,
    trend: trend ? {
      direction: trend.trend,
      change: `${trend.change > 0 ? '+' : ''}${trend.change} points`,
      emoji: trend.trend === 'improving' ? '📈' : trend.trend === 'declining' ? '📉' : '➡️'
    } : undefined,
    summary,
    categories: categories.map(cat => ({
      name: cat.name,
      score: `${cat.score}/${cat.maxScore}`,
      percentage: Math.round((cat.score / cat.maxScore) * 100),
      status: cat.score >= cat.maxScore * 0.8 ? '✅' : cat.score >= cat.maxScore * 0.5 ? '⚠️' : '❌',
      issues: cat.issues.length > 0 ? cat.issues : undefined,
      suggestions: cat.suggestions.length > 0 ? cat.suggestions : undefined,
    })),
    criticalIssues: criticalIssues.length > 0 ? criticalIssues : undefined,
    recommendations,
    weightsUsed: weights.version,
    nextSteps: generateNextSteps(report),
  });
}

function generateSummary(grade: string, score: number, categories: HealthCategory[]): string {
  const weakAreas = categories
    .filter(cat => cat.score < cat.maxScore * 0.6)
    .map(cat => cat.name.toLowerCase());

  if (grade === 'A') {
    return 'Excellent! Your project is in great health with minimal issues.';
  } else if (grade === 'B') {
    return 'Good project health with some areas for improvement.';
  } else if (grade === 'C') {
    return `Moderate health. Focus on improving: ${weakAreas.join(', ')}.`;
  } else if (grade === 'D') {
    return `Project needs attention. Weak areas: ${weakAreas.join(', ')}.`;
  }
  return `Critical issues detected. Address: ${weakAreas.join(', ')} immediately.`;
}

function generateNextSteps(report: HealthReport): string[] {
  const steps: string[] = [];

  if (report.grade === 'F' || report.grade === 'D') {
    steps.push('1. Address critical issues first');
    steps.push('2. Run setup to configure project properly');
  }

  if (report.criticalIssues.length > 0) {
    steps.push('Run review on critical files');
  }

  const lowCategories = report.categories.filter(c => c.score < c.maxScore * 0.5);
  lowCategories.forEach(cat => {
    if (cat.name === 'Configuration') {
      steps.push('Configure project with: stackguide setup');
    } else if (cat.name === 'Code Quality') {
      steps.push('Analyze code with: stackguide review');
    } else if (cat.name === 'Documentation') {
      steps.push('Check docs with: stackguide docs');
    }
  });

  if (steps.length === 0) {
    steps.push('Continue maintaining good practices');
    steps.push('Regularly run health checks');
  }

  return steps.slice(0, 5);
}
