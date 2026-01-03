/**
 * Project Intelligence Service
 * Main orchestrator for project analysis and recommendations
 * @version 3.3.0
 */

import * as path from 'path';
import type {
  IntelligenceReport,
  PriorityAction,
  WorkflowStep,
  StructureAnalysis,
  ConfigAnalysis,
  DependencyAnalysis
} from './types.js';
import { analyzeStructure } from './structureAnalyzer.js';
import { analyzeConfigurations, generateSmartConfig, applyConfigFix } from './configGenerator.js';
import { analyzeDependencies, generateInstallCommand } from './dependencyAdvisor.js';
import * as autoDetect from '../autoDetect.js';

/**
 * Generate comprehensive project intelligence report
 */
export async function generateIntelligenceReport(projectPath: string): Promise<IntelligenceReport> {
  const timestamp = new Date().toISOString();
  const absolutePath = path.resolve(projectPath);
  
  // First, detect project type
  const detection = autoDetect.detectProjectType(absolutePath);
  const projectType = detection.projectType || 'react-typescript';
  const confidence = detection.confidence;
  
  // Run all analyses
  const structure = analyzeStructure(absolutePath, projectType);
  const configuration = analyzeConfigurations(absolutePath, projectType);
  const dependencies = analyzeDependencies(absolutePath, projectType);
  
  // Calculate overall score
  const overallScore = calculateOverallScore(structure, configuration, dependencies);
  const grade = scoreToGrade(overallScore);
  
  // Generate priority actions
  const priorityActions = generatePriorityActions(structure, configuration, dependencies);
  
  // Generate workflow steps
  const suggestedWorkflow = generateWorkflow(priorityActions, dependencies.packageManager);
  
  // Estimate effort
  const estimatedEffort = estimateEffort(priorityActions);
  
  return {
    timestamp,
    projectPath: absolutePath,
    projectType,
    confidence,
    overallScore,
    grade,
    structure,
    configuration,
    dependencies,
    priorityActions,
    suggestedWorkflow,
    estimatedEffort
  };
}

/**
 * Calculate overall project health score
 */
function calculateOverallScore(
  structure: StructureAnalysis,
  configuration: ConfigAnalysis,
  dependencies: DependencyAnalysis
): number {
  // Weighted average
  const weights = {
    structure: 0.25,
    configuration: 0.35,
    dependencies: 0.40
  };
  
  return Math.round(
    structure.structureScore * weights.structure +
    configuration.configScore * weights.configuration +
    dependencies.dependencyScore * weights.dependencies
  );
}

/**
 * Convert score to letter grade
 */
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Generate priority actions from analyses
 */
function generatePriorityActions(
  structure: StructureAnalysis,
  configuration: ConfigAnalysis,
  dependencies: DependencyAnalysis
): PriorityAction[] {
  const actions: PriorityAction[] = [];
  let actionId = 1;
  
  // Structure actions
  for (const dir of structure.missingDirs.filter(d => d.priority === 'high')) {
    actions.push({
      id: `struct-${actionId++}`,
      category: 'structure',
      priority: 'high',
      title: `Create ${dir.path} directory`,
      description: dir.purpose,
      command: `mkdir -p ${dir.path}`,
      autoApplicable: true
    });
  }
  
  for (const improvement of structure.improvements.filter(i => i.priority === 'high')) {
    actions.push({
      id: `struct-${actionId++}`,
      category: 'structure',
      priority: 'high',
      title: improvement.description,
      description: `${improvement.type} operation suggested`,
      autoApplicable: false
    });
  }
  
  // Configuration actions
  for (const rec of configuration.recommendedConfigs.filter(r => r.priority === 'critical' || r.priority === 'high')) {
    actions.push({
      id: `config-${actionId++}`,
      category: 'config',
      priority: rec.priority === 'critical' ? 'critical' : 'high',
      title: `Add ${rec.filename}`,
      description: rec.reason,
      autoApplicable: true
    });
  }
  
  for (const issue of configuration.issues.filter(i => i.severity === 'error' || i.severity === 'warning')) {
    actions.push({
      id: `config-${actionId++}`,
      category: 'config',
      priority: issue.severity === 'error' ? 'high' : 'medium',
      title: issue.message,
      description: issue.suggestion,
      autoApplicable: issue.autoFixable
    });
  }
  
  // Dependency actions
  const highPriorityDeps = dependencies.recommendedAdditions.filter(d => d.priority === 'high');
  if (highPriorityDeps.length > 0) {
    actions.push({
      id: `deps-${actionId++}`,
      category: 'dependencies',
      priority: 'high',
      title: `Install missing dependencies`,
      description: `Missing: ${highPriorityDeps.map(d => d.name).join(', ')}`,
      command: generateInstallCommand(highPriorityDeps, dependencies.packageManager, true),
      autoApplicable: true
    });
  }
  
  // Security actions for vulnerabilities
  for (const vuln of dependencies.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high')) {
    actions.push({
      id: `sec-${actionId++}`,
      category: 'security',
      priority: vuln.severity === 'critical' ? 'critical' : 'high',
      title: `Fix ${vuln.package} vulnerability`,
      description: vuln.title,
      command: vuln.fixedIn ? `npm update ${vuln.package}` : undefined,
      autoApplicable: !!vuln.fixedIn
    });
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return actions;
}

/**
 * Generate suggested workflow steps
 */
function generateWorkflow(
  actions: PriorityAction[],
  packageManager: DependencyAnalysis['packageManager']
): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let order = 1;
  
  // Group actions by category
  const criticalActions = actions.filter(a => a.priority === 'critical');
  const configActions = actions.filter(a => a.category === 'config' && a.priority !== 'critical');
  const depActions = actions.filter(a => a.category === 'dependencies');
  const structureActions = actions.filter(a => a.category === 'structure');
  
  // Step 1: Critical issues first
  if (criticalActions.length > 0) {
    steps.push({
      order: order++,
      title: 'Fix Critical Issues',
      description: `Address ${criticalActions.length} critical issue(s) before proceeding`,
      estimatedTime: '15-30 min',
      optional: false
    });
  }
  
  // Step 2: Install dependencies
  if (depActions.length > 0) {
    const installCmd = packageManager === 'pnpm' ? 'pnpm add -D' :
                      packageManager === 'yarn' ? 'yarn add -D' : 'npm install -D';
    steps.push({
      order: order++,
      title: 'Install Development Dependencies',
      description: 'Add missing linting, testing, and DX tools',
      command: depActions.find(a => a.command)?.command,
      estimatedTime: '2-5 min',
      optional: false
    });
  }
  
  // Step 3: Add configuration files
  if (configActions.length > 0) {
    steps.push({
      order: order++,
      title: 'Configure Development Tools',
      description: `Add ${configActions.length} configuration file(s)`,
      estimatedTime: '10-20 min',
      optional: false
    });
  }
  
  // Step 4: Organize structure
  if (structureActions.length > 0) {
    steps.push({
      order: order++,
      title: 'Improve Project Structure',
      description: `Create ${structureActions.length} missing directories`,
      estimatedTime: '5-10 min',
      optional: true
    });
  }
  
  // Step 5: Run initial checks
  steps.push({
    order: order++,
    title: 'Verify Setup',
    description: 'Run linting and tests to verify configuration',
    command: packageManager === 'pnpm' ? 'pnpm lint && pnpm test' :
             packageManager === 'yarn' ? 'yarn lint && yarn test' : 'npm run lint && npm test',
    estimatedTime: '2-5 min',
    optional: false
  });
  
  // Step 6: Commit changes
  steps.push({
    order: order++,
    title: 'Commit Configuration',
    description: 'Commit the new configuration to version control',
    command: 'git add -A && git commit -m "chore: add project configuration"',
    estimatedTime: '1 min',
    optional: false
  });
  
  return steps;
}

/**
 * Estimate effort to fix all issues
 */
function estimateEffort(actions: PriorityAction[]): 'minimal' | 'moderate' | 'significant' {
  const criticalCount = actions.filter(a => a.priority === 'critical').length;
  const highCount = actions.filter(a => a.priority === 'high').length;
  const totalCount = actions.length;
  
  if (criticalCount > 2 || totalCount > 10) return 'significant';
  if (highCount > 3 || totalCount > 5) return 'moderate';
  return 'minimal';
}

/**
 * Apply auto-fixable actions
 */
export async function applyAutoFixes(
  report: IntelligenceReport,
  onlyCategory?: 'structure' | 'config' | 'dependencies' | 'security'
): Promise<{ applied: string[]; failed: string[] }> {
  const applied: string[] = [];
  const failed: string[] = [];
  
  const actionsToApply = report.priorityActions.filter(a => {
    if (!a.autoApplicable) return false;
    if (onlyCategory && a.category !== onlyCategory) return false;
    return true;
  });
  
  for (const action of actionsToApply) {
    // For now, just report what would be applied
    // Actual implementation would execute commands/write files
    applied.push(action.title);
  }
  
  return { applied, failed };
}

/**
 * Format intelligence report for display
 */
export function formatIntelligenceReport(report: IntelligenceReport): string {
  const lines: string[] = [];
  
  // Header
  lines.push('# 🧠 Project Intelligence Report');
  lines.push('');
  lines.push(`**Project:** ${report.projectPath}`);
  lines.push(`**Type:** ${report.projectType} (${report.confidence} confidence)`);
  lines.push(`**Generated:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  
  // Overall Score
  const gradeEmoji = {
    'A': '🌟',
    'B': '✨',
    'C': '👍',
    'D': '⚠️',
    'F': '🚨'
  };
  lines.push(`## Overall Score: ${report.overallScore}/100 ${gradeEmoji[report.grade]} Grade ${report.grade}`);
  lines.push('');
  
  // Category breakdown
  lines.push('### Category Scores');
  lines.push(`- **Structure:** ${report.structure.structureScore}/100`);
  lines.push(`- **Configuration:** ${report.configuration.configScore}/100`);
  lines.push(`- **Dependencies:** ${report.dependencies.dependencyScore}/100`);
  lines.push('');
  
  // Priority Actions
  if (report.priorityActions.length > 0) {
    lines.push('## 🎯 Priority Actions');
    lines.push('');
    
    const criticalActions = report.priorityActions.filter(a => a.priority === 'critical');
    const highActions = report.priorityActions.filter(a => a.priority === 'high');
    
    if (criticalActions.length > 0) {
      lines.push('### 🚨 Critical');
      for (const action of criticalActions) {
        lines.push(`- **${action.title}**: ${action.description}`);
        if (action.command) lines.push(`  - \`${action.command}\``);
      }
      lines.push('');
    }
    
    if (highActions.length > 0) {
      lines.push('### ⚡ High Priority');
      for (const action of highActions.slice(0, 5)) {
        lines.push(`- **${action.title}**: ${action.description}`);
        if (action.command) lines.push(`  - \`${action.command}\``);
      }
      if (highActions.length > 5) {
        lines.push(`  - ...and ${highActions.length - 5} more`);
      }
      lines.push('');
    }
  }
  
  // Suggested Workflow
  if (report.suggestedWorkflow.length > 0) {
    lines.push('## 📋 Suggested Workflow');
    lines.push('');
    for (const step of report.suggestedWorkflow) {
      const optional = step.optional ? ' _(optional)_' : '';
      lines.push(`${step.order}. **${step.title}**${optional}`);
      lines.push(`   ${step.description}`);
      if (step.command) lines.push(`   \`${step.command}\``);
      lines.push(`   ⏱️ ${step.estimatedTime}`);
      lines.push('');
    }
  }
  
  // Estimated Effort
  const effortEmoji = {
    'minimal': '✅',
    'moderate': '🔧',
    'significant': '🏗️'
  };
  lines.push(`## 📊 Estimated Effort: ${effortEmoji[report.estimatedEffort]} ${report.estimatedEffort.charAt(0).toUpperCase() + report.estimatedEffort.slice(1)}`);
  
  return lines.join('\n');
}

export {
  analyzeStructure,
  analyzeConfigurations,
  analyzeDependencies,
  generateSmartConfig,
  applyConfigFix,
  generateInstallCommand
};
