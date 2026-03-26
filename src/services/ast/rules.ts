/**
 * Tree-Sitter AST Rules
 * Semantic analysis rules using tree-sitter pattern matching
 * @version 3.5.0
 */

import type { ASTQueryMatch, TreeSitterRule, TreeSitterIssue, TreeSitterContext } from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

function createIssue(
  ruleId: string,
  message: string,
  severity: TreeSitterIssue['severity'],
  node: { startPosition: { row: number; column: number } },
  options: {
    suggestion?: string;
    quickFix?: TreeSitterIssue['quickFix'];
  } = {}
): TreeSitterIssue {
  return {
    ruleId,
    message,
    severity,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    suggestion: options.suggestion,
    quickFix: options.quickFix
  };
}

function checkMatches(
  matches: ASTQueryMatch[],
  captureName: string,
  predicate: (text: string) => boolean,
  createIssueForMatch: (node: ASTQueryMatch['captures'][0]['node']) => TreeSitterIssue
): TreeSitterIssue[] {
  const issues: TreeSitterIssue[] = [];
  
  for (const match of matches) {
    const capture = match.captures.find(c => c.name === captureName);
    if (capture && predicate(capture.node.text)) {
      issues.push(createIssueForMatch(capture.node));
    }
  }
  
  return issues;
}

// ============================================================================
// TypeScript/JavaScript Rules
// ============================================================================

const evalUsageRule: TreeSitterRule = {
  id: 'TS-SEC001',
  name: 'No eval()',
  description: 'Avoid using eval() as it can lead to code injection vulnerabilities',
  category: 'security',
  severity: 'error',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(call_expression function: (identifier) @fn)',
  check: (matches) => checkMatches(
    matches, 'fn', text => text === 'eval',
    node => createIssue('TS-SEC001', 'Avoid eval() - code injection vulnerability', 'error', node, {
      suggestion: 'Use JSON.parse() for JSON data, or restructure logic to avoid dynamic execution'
    })
  )
};

const innerHTMLRule: TreeSitterRule = {
  id: 'TS-SEC002',
  name: 'No innerHTML',
  description: 'Avoid innerHTML for XSS prevention',
  category: 'security',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(member_expression property: (property_identifier) @prop)',
  check: (matches) => checkMatches(
    matches, 'prop', text => text === 'innerHTML',
    node => createIssue('TS-SEC002', 'Avoid innerHTML - XSS vulnerability', 'warning', node, {
      suggestion: 'Use textContent or DOM manipulation methods'
    })
  )
};

const hardcodedSecretsRule: TreeSitterRule = {
  id: 'TS-SEC003',
  name: 'No hardcoded secrets',
  description: 'Detect hardcoded secrets',
  category: 'security',
  severity: 'error',
  languages: ['typescript', 'javascript', 'tsx', 'python'],
  enabled: true,
  query: '(variable_declarator name: (identifier) @name value: (string) @value)',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    const secretPatterns = /(password|secret|api[_-]?key|token|auth|credential)/i;
    
    for (const match of matches) {
      const nameCapture = match.captures.find(c => c.name === 'name');
      const valueCapture = match.captures.find(c => c.name === 'value');
      if (nameCapture && valueCapture && secretPatterns.test(nameCapture.node.text) && valueCapture.node.text.length > 2) {
        issues.push(createIssue('TS-SEC003', 'Hardcoded secret in "' + nameCapture.node.text + '"', 'error', nameCapture.node, {
          suggestion: 'Use environment variables'
        }));
      }
    }
    return issues;
  }
};

const sqlInjectionRule: TreeSitterRule = {
  id: 'TS-SEC004',
  name: 'SQL Injection Prevention',
  description: 'Detect SQL injection vulnerabilities',
  category: 'security',
  severity: 'error',
  languages: ['typescript', 'javascript', 'tsx', 'python'],
  enabled: true,
  query: '(template_string) @template',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    const sqlPatterns = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i;
    
    for (const match of matches) {
      const capture = match.captures.find(c => c.name === 'template');
      if (capture && sqlPatterns.test(capture.node.text) && capture.node.text.includes('${')) {
        issues.push(createIssue('TS-SEC004', 'SQL injection: avoid string interpolation in SQL', 'error', capture.node, {
          suggestion: 'Use parameterized queries'
        }));
      }
    }
    return issues;
  }
};

const consoleLogRule: TreeSitterRule = {
  id: 'TS-BP001',
  name: 'No console.log',
  description: 'Remove console statements',
  category: 'best-practices',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(call_expression function: (member_expression object: (identifier) @obj))',
  check: (matches): TreeSitterIssue[] => {
    return checkMatches(matches, 'obj', text => text === 'console',
      node => createIssue('TS-BP001', 'Remove console statement', 'warning', node, {
        suggestion: 'Use a logging library'
      })
    );
  }
};

const debuggerRule: TreeSitterRule = {
  id: 'TS-BP002',
  name: 'No debugger',
  description: 'Remove debugger statements',
  category: 'best-practices',
  severity: 'error',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(debugger_statement) @debugger',
  check: (matches): TreeSitterIssue[] => {
    return checkMatches(matches, 'debugger', () => true,
      node => createIssue('TS-BP002', 'Remove debugger statement', 'error', node)
    );
  }
};

const emptyCatchRule: TreeSitterRule = {
  id: 'TS-BP003',
  name: 'No empty catch',
  description: 'Catch blocks should not be empty',
  category: 'best-practices',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(catch_clause body: (statement_block) @body)',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    for (const match of matches) {
      const bodyCapture = match.captures.find(c => c.name === 'body');
      if (bodyCapture) {
        const content = bodyCapture.node.text.replace(/[\s{}]/g, '').replace(/\/\/.*/g, '');
        if (content.length === 0) {
          issues.push(createIssue('TS-BP003', 'Empty catch block', 'warning', bodyCapture.node, {
            suggestion: 'Add error handling or logging'
          }));
        }
      }
    }
    return issues;
  }
};

const noVarRule: TreeSitterRule = {
  id: 'TS-BP004',
  name: 'No var',
  description: 'Use let/const instead of var',
  category: 'best-practices',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(variable_declaration) @var',
  check: (matches): TreeSitterIssue[] => {
    return checkMatches(matches, 'var', text => text.startsWith('var '),
      node => createIssue('TS-BP004', 'Use let/const instead of var', 'warning', node, {
        suggestion: 'Replace var with const or let'
      })
    );
  }
};

const looseEqualityRule: TreeSitterRule = {
  id: 'TS-BP005',
  name: 'Use strict equality',
  description: 'Use === instead of ==',
  category: 'best-practices',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx'],
  enabled: true,
  query: '(binary_expression operator: "==" @op)',
  check: (matches): TreeSitterIssue[] => {
    return checkMatches(matches, 'op', text => text === '==' || text === '!=',
      node => createIssue('TS-BP005', 'Use strict equality (===)', 'warning', node)
    );
  }
};

const nestedLoopsRule: TreeSitterRule = {
  id: 'TS-PERF002',
  name: 'Nested loops',
  description: 'Avoid deeply nested loops',
  category: 'performance',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx', 'python', 'go', 'rust'],
  enabled: true,
  query: '(for_statement) @loop',
  check: (_matches, context): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    const loopPattern = /\bfor\s*\([^)]+\)\s*\{[^}]*\bfor\s*\([^)]+\)\s*\{/g;
    let match;
    while ((match = loopPattern.exec(context.code)) !== null) {
      const lines = context.code.substring(0, match.index).split('\n');
      issues.push({ 
        ruleId: 'TS-PERF002', 
        message: 'Nested loops - O(n²) complexity', 
        severity: 'warning', 
        line: lines.length, 
        column: 1 
      });
    }
    return issues;
  }
};

const longFunctionRule: TreeSitterRule = {
  id: 'TS-MAINT001',
  name: 'Long function',
  description: 'Functions should be short',
  category: 'maintainability',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx', 'python', 'go', 'rust'],
  enabled: true,
  query: '(function_declaration) @func',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    const maxLines = 50;
    for (const match of matches) {
      const funcCapture = match.captures.find(c => c.name === 'func');
      if (funcCapture) {
        const lines = funcCapture.node.text.split('\n').length;
        if (lines > maxLines) {
          issues.push(createIssue('TS-MAINT001', 'Function has ' + lines + ' lines (max ' + maxLines + ')', 'warning', funcCapture.node));
        }
      }
    }
    return issues;
  }
};

const tooManyParamsRule: TreeSitterRule = {
  id: 'TS-MAINT002',
  name: 'Too many parameters',
  description: 'Functions should have fewer parameters',
  category: 'maintainability',
  severity: 'warning',
  languages: ['typescript', 'javascript', 'tsx', 'python', 'go', 'rust'],
  enabled: true,
  query: '(function_declaration parameters: (formal_parameters) @params)',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    const maxParams = 4;
    for (const match of matches) {
      const paramsCapture = match.captures.find(c => c.name === 'params');
      if (paramsCapture) {
        const paramCount = paramsCapture.node.text === '()' ? 0 : (paramsCapture.node.text.match(/,/g) || []).length + 1;
        if (paramCount > maxParams) {
          issues.push(createIssue('TS-MAINT002', paramCount + ' params (max ' + maxParams + ')', 'warning', paramsCapture.node));
        }
      }
    }
    return issues;
  }
};

// Python rules
const bareExceptRule: TreeSitterRule = {
  id: 'TS-PY001',
  name: 'No bare except',
  description: 'Catch specific exceptions',
  category: 'best-practices',
  severity: 'warning',
  languages: ['python'],
  enabled: true,
  query: '(except_clause) @except',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    for (const match of matches) {
      const exceptCapture = match.captures.find(c => c.name === 'except');
      if (exceptCapture && /^except\s*:/.test(exceptCapture.node.text)) {
        issues.push(createIssue('TS-PY001', 'Bare except - catch specific exceptions', 'warning', exceptCapture.node));
      }
    }
    return issues;
  }
};

const mutableDefaultRule: TreeSitterRule = {
  id: 'TS-PY002',
  name: 'No mutable defaults',
  description: 'Avoid mutable default arguments',
  category: 'best-practices',
  severity: 'error',
  languages: ['python'],
  enabled: true,
  query: '(default_parameter value: (list) @default)',
  check: (matches): TreeSitterIssue[] => checkMatches(matches, 'default', () => true,
    node => createIssue('TS-PY002', 'Mutable default argument', 'error', node))
};

// Go rules
const ignoredErrorRule: TreeSitterRule = {
  id: 'TS-GO001',
  name: 'Handle errors',
  description: 'Error returns should be handled',
  category: 'best-practices',
  severity: 'warning',
  languages: ['go'],
  enabled: true,
  query: '(short_var_declaration left: (expression_list) @left)',
  check: (matches): TreeSitterIssue[] => {
    const issues: TreeSitterIssue[] = [];
    for (const match of matches) {
      const leftCapture = match.captures.find(c => c.name === 'left');
      if (leftCapture && (/, _$/.test(leftCapture.node.text) || /^_,/.test(leftCapture.node.text))) {
        issues.push(createIssue('TS-GO001', 'Error value ignored', 'warning', leftCapture.node));
      }
    }
    return issues;
  }
};

// Rust rules
const unwrapUsageRule: TreeSitterRule = {
  id: 'TS-RS001',
  name: 'Avoid unwrap()',
  description: 'Use proper error handling',
  category: 'best-practices',
  severity: 'warning',
  languages: ['rust'],
  enabled: true,
  query: '(call_expression function: (field_expression field: (field_identifier) @method))',
  check: (matches): TreeSitterIssue[] => checkMatches(matches, 'method', text => text === 'unwrap' || text === 'expect',
    node => createIssue('TS-RS001', 'Avoid ' + node.text + '() - use ? or match', 'warning', node))
};

// ============================================================================
// Exports
// ============================================================================

export const TYPESCRIPT_RULES: TreeSitterRule[] = [
  evalUsageRule, innerHTMLRule, hardcodedSecretsRule, sqlInjectionRule,
  consoleLogRule, debuggerRule, emptyCatchRule, noVarRule, looseEqualityRule,
  nestedLoopsRule, longFunctionRule, tooManyParamsRule
];

export const PYTHON_RULES: TreeSitterRule[] = [
  hardcodedSecretsRule, sqlInjectionRule, nestedLoopsRule, longFunctionRule,
  tooManyParamsRule, bareExceptRule, mutableDefaultRule
];

export const GO_RULES: TreeSitterRule[] = [
  nestedLoopsRule, longFunctionRule, tooManyParamsRule, ignoredErrorRule
];

export const RUST_RULES: TreeSitterRule[] = [
  nestedLoopsRule, longFunctionRule, tooManyParamsRule, unwrapUsageRule
];

export const ALL_TREE_SITTER_RULES: TreeSitterRule[] = [
  ...TYPESCRIPT_RULES, bareExceptRule, mutableDefaultRule, ignoredErrorRule, unwrapUsageRule
];

export function getRulesForLanguage(language: string): TreeSitterRule[] {
  const languageRules: Record<string, TreeSitterRule[]> = {
    typescript: TYPESCRIPT_RULES,
    javascript: TYPESCRIPT_RULES,
    tsx: TYPESCRIPT_RULES,
    python: PYTHON_RULES,
    go: GO_RULES,
    rust: RUST_RULES
  };
  return (languageRules[language] || []).filter(r => r.enabled);
}
