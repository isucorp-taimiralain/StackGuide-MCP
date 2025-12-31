/**
 * Health handler - Project Health Score Analysis
 * Phase 6: Advanced Features
 */

import { ServerState, ToolResponse, jsonResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { analyzeCode, AnalysisResult } from '../services/codeAnalyzer.js';

interface HealthArgs {
  projectPath?: string;
  detailed?: boolean;
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

// Score thresholds for grades
const GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0,
};

function getGrade(score: number): string {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
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

// Analyze configuration quality
function analyzeConfiguration(state: ServerState): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 20;
  const maxScore = 20;

  const hasConfig = !!state.activeProjectType;
  const hasRules = state.loadedRules.length > 0;
  const hasKnowledge = state.loadedKnowledge.length > 0;

  if (!hasConfig) {
    issues.push('No project type configured');
    suggestions.push('Run setup to configure your project type');
    score -= 5;
  }

  if (!hasRules) {
    issues.push('No rules loaded');
    suggestions.push('Run setup to load rules for your project');
    score -= 5;
  }

  if (!hasKnowledge) {
    issues.push('No knowledge base loaded');
    suggestions.push('Run setup to load knowledge base');
    score -= 5;
  }

  if (state.activeConfiguration?.customRules?.length === 0) {
    suggestions.push('Consider adding custom rules for your project');
    score -= 2;
  }

  return {
    name: 'Configuration',
    score: Math.max(0, score),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze code quality based on review results
function analyzeCodeQuality(analysisResult: AnalysisResult | null): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 30;
  const maxScore = 30;

  if (!analysisResult) {
    return {
      name: 'Code Quality',
      score: 15,
      maxScore,
      issues: ['No code analysis performed'],
      suggestions: ['Run review tool to analyze code'],
    };
  }

  // Deduct points based on issues
  const criticalCount = analysisResult.issues.filter(i => i.severity === 'error').length;
  const warningCount = analysisResult.issues.filter(i => i.severity === 'warning').length;
  const infoCount = analysisResult.issues.filter(i => i.severity === 'info').length;

  score -= criticalCount * 5;
  score -= warningCount * 2;
  score -= infoCount * 0.5;

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
    name: 'Code Quality',
    score: Math.max(0, Math.min(maxScore, score)),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze structure
function analyzeStructure(state: ServerState): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 20;
  const maxScore = 20;

  // Check if project type is detected
  if (!state.activeProjectType) {
    issues.push('Project structure not analyzed');
    suggestions.push('Run setup to detect project structure');
    score -= 10;
  } else {
    // Project type detected - good structure
    if (state.loadedRules.length < 3) {
      suggestions.push('Load more rules for comprehensive guidance');
      score -= 5;
    }
  }

  return {
    name: 'Project Structure',
    score: Math.max(0, score),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze documentation
function analyzeDocumentation(state: ServerState): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 15;
  const maxScore = 15;

  if (state.loadedKnowledge.length === 0) {
    issues.push('No knowledge/documentation loaded');
    score -= 5;
  }

  if (!state.activeProjectType) {
    suggestions.push('Configure project type for tailored documentation');
    score -= 3;
  }

  return {
    name: 'Documentation',
    score: Math.max(0, score),
    maxScore,
    issues,
    suggestions,
  };
}

// Analyze testing readiness
function analyzeTestingReadiness(state: ServerState): HealthCategory {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 15;
  const maxScore = 15;

  // Check if project has testing setup (inferred from project type)
  const hasTestingSupport = state.activeProjectType?.includes('typescript') ||
                            state.activeProjectType?.includes('react') ||
                            state.activeProjectType?.includes('node');

  if (!hasTestingSupport) {
    suggestions.push('Consider adding a testing framework');
    score -= 5;
  }

  // Check if any loaded rules mention testing
  const hasTestingRules = state.loadedRules.some(r => 
    r.content?.toLowerCase().includes('test') || r.name?.toLowerCase().includes('test')
  );
  
  if (!hasTestingRules) {
    suggestions.push('Add custom rules for testing guidelines');
    score -= 2;
  }

  return {
    name: 'Testing Readiness',
    score: Math.max(0, score),
    maxScore,
    issues,
    suggestions,
  };
}

export async function handleHealth(
  args: HealthArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { detailed = true } = args;

  logger.info('Generating health report', { detailed });

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

  // Collect all category scores
  const categories: HealthCategory[] = [
    analyzeConfiguration(state),
    analyzeCodeQuality(codeAnalysis),
    analyzeStructure(state),
    analyzeDocumentation(state),
    analyzeTestingReadiness(state),
  ];

  // Calculate overall score
  const totalScore = categories.reduce((sum, cat) => sum + cat.score, 0);
  const maxTotalScore = categories.reduce((sum, cat) => sum + cat.maxScore, 0);
  const overallScore = Math.round((totalScore / maxTotalScore) * 100);
  const grade = getGrade(overallScore);

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
      topRecommendations: recommendations.slice(0, 3),
    });
  }

  return jsonResponse({
    header: `🏥 Project Health Report`,
    score: `${overallScore}/100`,
    grade: `${getGradeEmoji(grade)} Grade: ${grade}`,
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
