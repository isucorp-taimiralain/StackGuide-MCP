/**
 * Tree-Sitter Analyzer
 * High-level API for AST-based code analysis
 * @version 3.5.0
 */

import { logger } from '../../utils/logger.js';
import {
  parseCode,
  parseCodeCached,
  detectLanguage,
  extractMetrics,
  findNodesByType,
  walkAST,
  clearASTParserCache,
  getSupportedLanguages
} from './treeSitterParser.js';
import { ALL_TREE_SITTER_RULES, getRulesForLanguage } from './rules.js';
import type {
  ParsedAST,
  TreeSitterRule,
  TreeSitterIssue,
  TreeSitterContext,
  TreeSitterAnalysisResult,
  TreeSitterMetrics,
  SupportedASTLanguage,
  ASTQueryMatch,
  ASTNode
} from './types.js';

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Analyze code using tree-sitter AST
 */
export async function analyzeWithTreeSitter(
  code: string,
  filePath: string,
  options: {
    language?: SupportedASTLanguage;
    categories?: Array<TreeSitterRule['category']>;
    useCache?: boolean;
  } = {}
): Promise<TreeSitterAnalysisResult | null> {
  const startTime = Date.now();
  const { categories, useCache = true } = options;
  const language = options.language || detectLanguage(filePath);
  
  if (!language) {
    logger.debug(`Unsupported file type for tree-sitter: ${filePath}`);
    return null;
  }
  
  // Parse the code
  const ast = useCache 
    ? await parseCodeCached(code, filePath, language)
    : await parseCode(code, filePath, language);
  
  if (!ast) {
    return null;
  }
  
  // Get applicable rules
  let rules = getRulesForLanguage(language);
  
  if (categories && categories.length > 0) {
    const categorySet = new Set(categories);
    rules = rules.filter(r => categorySet.has(r.category));
  }
  
  // Run rules
  const issues: TreeSitterIssue[] = [];
  
  for (const rule of rules) {
    try {
      const ruleIssues = await runRule(rule, ast, code, filePath);
      issues.push(...ruleIssues);
    } catch (error) {
      logger.warn(`Rule ${rule.id} failed`, { error: String(error) });
    }
  }
  
  // Extract metrics
  const metrics = extractMetrics(ast);
  
  const result: TreeSitterAnalysisResult = {
    filePath,
    language,
    issues,
    metrics,
    parseTime: ast.parseTime,
    analysisTime: Date.now() - startTime
  };
  
  logger.info('Tree-sitter analysis complete', {
    file: filePath,
    language,
    issuesFound: issues.length,
    rulesApplied: rules.length,
    time: result.analysisTime
  });
  
  return result;
}

/**
 * Run a single rule against the AST
 */
async function runRule(
  rule: TreeSitterRule,
  ast: ParsedAST,
  code: string,
  filePath: string
): Promise<TreeSitterIssue[]> {
  const context: TreeSitterContext = {
    filePath,
    code,
    ast
  };
  
  // For now, we use a simplified pattern matching approach
  // since tree-sitter queries require the actual tree-sitter tree
  // We'll match patterns by walking the AST
  
  const matches = findMatchingNodes(ast, rule);
  
  if (matches.length === 0) {
    return [];
  }
  
  return rule.check(matches, context);
}

/**
 * Find nodes matching a rule's pattern
 * This is a simplified matcher that works with our converted AST nodes
 */
function findMatchingNodes(ast: ParsedAST, rule: TreeSitterRule): ASTQueryMatch[] {
  const matches: ASTQueryMatch[] = [];
  
  // Extract node types from the query pattern
  // Pattern format: (node_type ...) @capture
  const nodeTypeMatch = rule.query.match(/\((\w+)/);
  const captureMatch = rule.query.match(/@(\w+)/g);
  
  if (!nodeTypeMatch) {
    return matches;
  }
  
  const targetType = nodeTypeMatch[1];
  const captureNames = captureMatch?.map(c => c.slice(1)) || ['match'];
  
  // Walk AST and find matching nodes
  walkAST(ast.rootNode, {
    enter: (node) => {
      if (node.type === targetType) {
        // Create a match with the node as a capture
        matches.push({
          pattern: 0,
          captures: captureNames.map(name => ({
            name,
            node
          }))
        });
      }
    }
  });
  
  return matches;
}

// ============================================================================
// Batch Analysis
// ============================================================================

/**
 * Analyze multiple files
 */
export async function analyzeMultipleWithTreeSitter(
  files: Array<{ path: string; code: string }>,
  options: {
    categories?: Array<TreeSitterRule['category']>;
    maxConcurrent?: number;
  } = {}
): Promise<TreeSitterAnalysisResult[]> {
  const { maxConcurrent = 5 } = options;
  const results: TreeSitterAnalysisResult[] = [];
  
  // Process in batches
  for (let i = 0; i < files.length; i += maxConcurrent) {
    const batch = files.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(file => 
      analyzeWithTreeSitter(file.code, file.path, options)
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }
  }
  
  return results;
}

// ============================================================================
// Metrics Aggregation
// ============================================================================

/**
 * Aggregate metrics from multiple analysis results
 */
export function aggregateMetrics(results: TreeSitterAnalysisResult[]): {
  totalFiles: number;
  totalIssues: number;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
  avgMetrics: TreeSitterMetrics;
} {
  const issuesBySeverity: Record<string, number> = {
    error: 0,
    warning: 0,
    info: 0,
    suggestion: 0
  };
  
  const issuesByCategory: Record<string, number> = {};
  
  const sumMetrics: TreeSitterMetrics = {
    loc: 0,
    functions: 0,
    classes: 0,
    maxNestingDepth: 0,
    complexity: 0,
    imports: 0
  };
  
  for (const result of results) {
    // Count issues
    for (const issue of result.issues) {
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
      
      // Extract category from rule ID prefix
      const rulePrefix = issue.ruleId.split('-')[1]?.substring(0, 2);
      const category = rulePrefix === 'SE' ? 'security' :
                       rulePrefix === 'BP' ? 'best-practices' :
                       rulePrefix === 'PE' ? 'performance' :
                       rulePrefix === 'MA' ? 'maintainability' :
                       'other';
      
      issuesByCategory[category] = (issuesByCategory[category] || 0) + 1;
    }
    
    // Sum metrics
    sumMetrics.loc += result.metrics.loc;
    sumMetrics.functions += result.metrics.functions;
    sumMetrics.classes += result.metrics.classes;
    sumMetrics.maxNestingDepth = Math.max(sumMetrics.maxNestingDepth, result.metrics.maxNestingDepth);
    sumMetrics.complexity += result.metrics.complexity;
    sumMetrics.imports += result.metrics.imports;
  }
  
  const totalFiles = results.length;
  
  return {
    totalFiles,
    totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
    issuesBySeverity,
    issuesByCategory,
    avgMetrics: {
      loc: Math.round(sumMetrics.loc / totalFiles) || 0,
      functions: Math.round(sumMetrics.functions / totalFiles) || 0,
      classes: Math.round(sumMetrics.classes / totalFiles) || 0,
      maxNestingDepth: sumMetrics.maxNestingDepth,
      complexity: Math.round(sumMetrics.complexity / totalFiles) || 0,
      imports: Math.round(sumMetrics.imports / totalFiles) || 0
    }
  };
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate a markdown report from analysis results
 */
export function generateReport(result: TreeSitterAnalysisResult): string {
  const { filePath, language, issues, metrics, parseTime, analysisTime } = result;
  
  let report = `# Code Analysis Report\n\n`;
  report += `**File:** ${filePath}\n`;
  report += `**Language:** ${language}\n`;
  report += `**Parse Time:** ${parseTime}ms\n`;
  report += `**Analysis Time:** ${analysisTime}ms\n\n`;
  
  // Metrics
  report += `## Metrics\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Lines of Code | ${metrics.loc} |\n`;
  report += `| Functions | ${metrics.functions} |\n`;
  report += `| Classes | ${metrics.classes} |\n`;
  report += `| Cyclomatic Complexity | ${metrics.complexity} |\n`;
  report += `| Max Nesting Depth | ${metrics.maxNestingDepth} |\n`;
  report += `| Imports | ${metrics.imports} |\n\n`;
  
  // Issues
  if (issues.length === 0) {
    report += `## Issues\n\n✅ No issues found!\n`;
  } else {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info' || i.severity === 'suggestion');
    
    report += `## Issues (${issues.length} total)\n\n`;
    report += `- 🔴 Errors: ${errors.length}\n`;
    report += `- 🟠 Warnings: ${warnings.length}\n`;
    report += `- 🔵 Info: ${infos.length}\n\n`;
    
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '🔴' :
                   issue.severity === 'warning' ? '🟠' : '🔵';
      
      report += `### ${icon} ${issue.ruleId}: ${issue.message}\n\n`;
      report += `**Line ${issue.line}:${issue.column}**\n\n`;
      
      if (issue.suggestion) {
        report += `💡 **Suggestion:** ${issue.suggestion}\n\n`;
      }
      
      if (issue.quickFix) {
        report += `🔧 **Quick Fix:** ${issue.quickFix.description}\n\n`;
      }
    }
  }
  
  return report;
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Convert tree-sitter issues to codeAnalyzer format
 */
export function convertToCodeIssues(issues: TreeSitterIssue[]): Array<{
  ruleId: string;
  message: string;
  severity: string;
  line: number;
  column: number;
  suggestion?: string;
  source: 'tree-sitter';
}> {
  return issues.map(issue => ({
    ruleId: issue.ruleId,
    message: issue.message,
    severity: issue.severity,
    line: issue.line,
    column: issue.column,
    suggestion: issue.suggestion,
    source: 'tree-sitter' as const
  }));
}

// ============================================================================
// Exports
// ============================================================================

export {
  parseCode,
  parseCodeCached,
  detectLanguage,
  extractMetrics,
  findNodesByType,
  walkAST,
  clearASTParserCache,
  getSupportedLanguages,
  ALL_TREE_SITTER_RULES,
  getRulesForLanguage
};

export type {
  ParsedAST,
  TreeSitterRule,
  TreeSitterIssue,
  TreeSitterContext,
  TreeSitterAnalysisResult,
  TreeSitterMetrics,
  SupportedASTLanguage,
  ASTNode
};
