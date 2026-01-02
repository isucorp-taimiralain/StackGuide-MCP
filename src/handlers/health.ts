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
import { ServerState, ToolResponse, jsonResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { analyzeCode, AnalysisResult } from '../services/codeAnalyzer.js';
import { 
  getHealthWeights, 
  getGradeFromScore, 
  HealthWeightsConfig,
  calculateIssueDeduction,
  getWeightsDocumentation
} from '../config/healthWeights.js';

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
}

const HISTORY_FILE = '.stackguide/health-history.json';
const MAX_HISTORY_ENTRIES = 100;

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
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(content);
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
  
  try {
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    
    // Limit history entries
    if (history.entries.length > MAX_HISTORY_ENTRIES) {
      history.entries = history.entries.slice(-MAX_HISTORY_ENTRIES);
    }
    
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    logger.debug('Saved health history');
  } catch (error) {
    logger.debug('Failed to save health history', { error });
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
  
  history.entries.push({
    timestamp: new Date().toISOString(),
    score,
    grade,
    categories: Object.fromEntries(
      categories.map(c => [c.name, c.score])
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
  args: HealthArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { detailed = true, showWeights = false, saveHistory = true } = args;
  const projectPath = process.cwd();

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
