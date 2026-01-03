/**
 * Analyze handler - Project Intelligence Analysis
 * Provides comprehensive project analysis and recommendations
 * @version 3.3.0
 */

import * as path from 'path';
import { ServerState, ToolResponse, jsonResponse, errorResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import { validate } from '../utils/validation.js';
import {
  generateIntelligenceReport,
  formatIntelligenceReport,
  analyzeStructure,
  analyzeConfigurations,
  analyzeDependencies,
  generateSmartConfig,
  applyAutoFixes,
  getFrameworkTemplate
} from '../services/intelligence/index.js';
import type { ConfigType, IntelligenceReport } from '../services/intelligence/types.js';

/**
 * Input schema for analyze tool
 */
const AnalyzeInputSchema = z.object({
  action: z.enum(['full', 'structure', 'config', 'dependencies', 'generate', 'apply']).optional().default('full'),
  path: z.string().optional(),
  configType: z.string().optional(),
  autoFix: z.boolean().optional().default(false),
  format: z.enum(['json', 'markdown']).optional().default('markdown')
}).strict();

type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

/**
 * Handle analyze tool requests
 */
export async function handleAnalyze(
  args: unknown,
  state: ServerState
): Promise<ToolResponse> {
  const startTime = Date.now();
  
  // Validate input
  const validationResult = validate(AnalyzeInputSchema, args || {});
  if (!validationResult.success) {
    return errorResponse(validationResult.error || 'Invalid input');
  }
  
  const input = validationResult.data as AnalyzeInput;
  const projectPath = input.path || process.cwd();
  const absolutePath = path.resolve(projectPath);
  const projectType = state.activeProjectType || 'react-typescript';
  
  try {
    switch (input.action) {
      case 'full':
        return await handleFullAnalysis(absolutePath, input.format, state, startTime);
      
      case 'structure':
        return await handleStructureAnalysis(absolutePath, projectType, input.format, startTime);
      
      case 'config':
        return await handleConfigAnalysis(absolutePath, projectType, input.format, startTime);
      
      case 'dependencies':
        return await handleDependencyAnalysis(absolutePath, projectType, input.format, startTime);
      
      case 'generate':
        return await handleGenerateConfig(absolutePath, projectType, input.configType, startTime);
      
      case 'apply':
        return await handleApplyFixes(absolutePath, state, startTime);
      
      default:
        return errorResponse(`Unknown action: ${input.action}`);
    }
  } catch (error) {
    logger.error('Analyze error', { error: String(error) });
    return errorResponse(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Full project analysis
 */
async function handleFullAnalysis(
  projectPath: string,
  format: 'json' | 'markdown',
  state: ServerState,
  startTime: number
): Promise<ToolResponse> {
  const report = await generateIntelligenceReport(projectPath);
  
  logger.tool('analyze', { action: 'full', path: projectPath, score: report.overallScore }, startTime);
  
  if (format === 'markdown') {
    return jsonResponse({
      success: true,
      report: formatIntelligenceReport(report),
      summary: {
        score: report.overallScore,
        grade: report.grade,
        projectType: report.projectType,
        confidence: report.confidence,
        estimatedEffort: report.estimatedEffort,
        actionCount: report.priorityActions.length
      }
    });
  }
  
  return jsonResponse({
    success: true,
    report
  });
}

/**
 * Structure-only analysis
 */
async function handleStructureAnalysis(
  projectPath: string,
  projectType: string,
  format: 'json' | 'markdown',
  startTime: number
): Promise<ToolResponse> {
  const analysis = analyzeStructure(projectPath, projectType);
  
  logger.tool('analyze', { action: 'structure', path: projectPath, score: analysis.structureScore }, startTime);
  
  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push('# 📁 Structure Analysis');
    lines.push('');
    lines.push(`**Score:** ${analysis.structureScore}/100`);
    lines.push('');
    
    if (analysis.missingDirs.length > 0) {
      lines.push('## Missing Directories');
      for (const dir of analysis.missingDirs) {
        const priority = dir.priority === 'high' ? '🔴' : dir.priority === 'medium' ? '🟡' : '🟢';
        lines.push(`- ${priority} \`${dir.path}\` - ${dir.purpose}`);
      }
      lines.push('');
    }
    
    if (analysis.missingFiles.length > 0) {
      lines.push('## Missing Files');
      for (const file of analysis.missingFiles.filter(f => f.priority === 'high')) {
        lines.push(`- 🔴 \`${file.path}\` - ${file.purpose}`);
      }
      lines.push('');
    }
    
    if (analysis.improvements.length > 0) {
      lines.push('## Suggested Improvements');
      for (const imp of analysis.improvements) {
        lines.push(`- ${imp.description}`);
      }
    }
    
    return jsonResponse({
      success: true,
      report: lines.join('\n'),
      score: analysis.structureScore
    });
  }
  
  return jsonResponse({
    success: true,
    analysis
  });
}

/**
 * Configuration-only analysis
 */
async function handleConfigAnalysis(
  projectPath: string,
  projectType: string,
  format: 'json' | 'markdown',
  startTime: number
): Promise<ToolResponse> {
  const analysis = analyzeConfigurations(projectPath, projectType);
  
  logger.tool('analyze', { action: 'config', path: projectPath, score: analysis.configScore }, startTime);
  
  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push('# ⚙️ Configuration Analysis');
    lines.push('');
    lines.push(`**Score:** ${analysis.configScore}/100`);
    lines.push('');
    
    if (analysis.existingConfigs.length > 0) {
      lines.push('## Existing Configurations');
      for (const config of analysis.existingConfigs) {
        const status = config.isValid ? '✅' : '❌';
        lines.push(`- ${status} \`${path.basename(config.path)}\` (${config.type})`);
      }
      lines.push('');
    }
    
    if (analysis.recommendedConfigs.length > 0) {
      lines.push('## Recommended Configurations');
      for (const rec of analysis.recommendedConfigs) {
        const priority = rec.priority === 'critical' ? '🚨' : rec.priority === 'high' ? '⚡' : '💡';
        lines.push(`- ${priority} \`${rec.filename}\` - ${rec.description}`);
        lines.push(`  - Reason: ${rec.reason}`);
      }
      lines.push('');
    }
    
    if (analysis.issues.length > 0) {
      lines.push('## Configuration Issues');
      for (const issue of analysis.issues) {
        const severity = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`- ${severity} ${issue.message}`);
        lines.push(`  - Suggestion: ${issue.suggestion}`);
        if (issue.autoFixable) lines.push(`  - ✨ Auto-fixable`);
      }
    }
    
    return jsonResponse({
      success: true,
      report: lines.join('\n'),
      score: analysis.configScore
    });
  }
  
  return jsonResponse({
    success: true,
    analysis
  });
}

/**
 * Dependencies-only analysis
 */
async function handleDependencyAnalysis(
  projectPath: string,
  projectType: string,
  format: 'json' | 'markdown',
  startTime: number
): Promise<ToolResponse> {
  const analysis = analyzeDependencies(projectPath, projectType);
  
  logger.tool('analyze', { action: 'dependencies', path: projectPath, score: analysis.dependencyScore }, startTime);
  
  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push('# 📦 Dependency Analysis');
    lines.push('');
    lines.push(`**Score:** ${analysis.dependencyScore}/100`);
    lines.push(`**Package Manager:** ${analysis.packageManager}`);
    lines.push(`**Total Dependencies:** ${analysis.totalDependencies}`);
    lines.push('');
    
    if (analysis.recommendedAdditions.length > 0) {
      lines.push('## Recommended Additions');
      for (const rec of analysis.recommendedAdditions) {
        const priority = rec.priority === 'high' ? '⚡' : '💡';
        lines.push(`- ${priority} \`${rec.name}\` - ${rec.reason} (${rec.category})`);
      }
      lines.push('');
    }
    
    if (analysis.unnecessaryDependencies.length > 0) {
      lines.push('## Consider Removing');
      for (const dep of analysis.unnecessaryDependencies) {
        lines.push(`- ⚠️ ${dep}`);
      }
      lines.push('');
    }
    
    if (analysis.vulnerabilities.length > 0) {
      lines.push('## Security Vulnerabilities');
      for (const vuln of analysis.vulnerabilities) {
        const severity = vuln.severity === 'critical' ? '🚨' : vuln.severity === 'high' ? '🔴' : '🟡';
        lines.push(`- ${severity} \`${vuln.package}\`: ${vuln.title}`);
        if (vuln.fixedIn) lines.push(`  - Fixed in: ${vuln.fixedIn}`);
      }
    }
    
    return jsonResponse({
      success: true,
      report: lines.join('\n'),
      score: analysis.dependencyScore
    });
  }
  
  return jsonResponse({
    success: true,
    analysis
  });
}

/**
 * Generate a configuration file
 */
async function handleGenerateConfig(
  projectPath: string,
  projectType: string,
  configType: string | undefined,
  startTime: number
): Promise<ToolResponse> {
  if (!configType) {
    // List available config types
    const template = getFrameworkTemplate(projectType);
    const availableConfigs = template?.configTemplates.map(c => c.type) || [];
    
    return jsonResponse({
      success: true,
      message: 'Specify configType to generate a configuration',
      availableConfigs: ['eslint', 'prettier', 'tsconfig', 'editorconfig', 'gitignore', ...availableConfigs],
      example: 'analyze action:"generate" configType:"eslint"'
    });
  }
  
  const config = generateSmartConfig(configType as ConfigType, projectType);
  
  if (!config) {
    return errorResponse(`No template available for config type: ${configType}`);
  }
  
  logger.tool('analyze', { action: 'generate', configType }, startTime);
  
  return jsonResponse({
    success: true,
    config: {
      filename: config.filename,
      description: config.description,
      content: config.content,
      customizations: config.customizations
    },
    instruction: `Save this content to ${config.filename} in your project root`
  });
}

/**
 * Apply auto-fixes
 */
async function handleApplyFixes(
  projectPath: string,
  state: ServerState,
  startTime: number
): Promise<ToolResponse> {
  const report = await generateIntelligenceReport(projectPath);
  const result = await applyAutoFixes(report);
  
  logger.tool('analyze', { action: 'apply', applied: result.applied.length, failed: result.failed.length }, startTime);
  
  return jsonResponse({
    success: true,
    applied: result.applied,
    failed: result.failed,
    message: result.applied.length > 0 
      ? `Applied ${result.applied.length} fix(es). ${result.failed.length} failed.`
      : 'No auto-fixes were applied. Manual intervention may be required.'
  });
}
