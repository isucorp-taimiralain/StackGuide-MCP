/**
 * Code Analyzer Service
 * Analyzes code against rules and patterns to find issues
 */

import { logger } from '../utils/logger.js';

export interface QuickFix {
  description: string;
  before: string;
  after: string;
  isRegex?: boolean;
}

export interface CodeIssue {
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  rule: string;
  category: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
  quickFix?: QuickFix;
}

export interface AnalysisResult {
  file: string;
  language: string;
  issues: CodeIssue[];
  score: number; // 0-100
  summary: {
    errors: number;
    warnings: number;
    info: number;
    suggestions: number;
  };
  quickFixes?: QuickFix[];
}

interface PatternRule {
  id: string;
  category: string;
  pattern: RegExp;
  severity: CodeIssue['severity'];
  message: string;
  suggestion?: string;
  languages?: string[];
  quickFix?: (match: string) => QuickFix | undefined;
}

// Pattern-based rules for common issues
const PATTERN_RULES: PatternRule[] = [
  // Security
  {
    id: 'SEC001',
    category: 'security',
    pattern: /eval\s*\(/g,
    severity: 'error',
    message: 'Avoid using eval() - it can execute arbitrary code',
    suggestion: 'Use JSON.parse() for JSON data or safer alternatives',
    languages: ['javascript', 'typescript'],
    quickFix: (match) => ({
      description: 'Replace eval() with JSON.parse()',
      before: match,
      after: 'JSON.parse('
    })
  },
  {
    id: 'SEC002',
    category: 'security',
    pattern: /innerHTML\s*=/g,
    severity: 'warning',
    message: 'innerHTML can lead to XSS vulnerabilities',
    suggestion: 'Use textContent or sanitize HTML input',
    languages: ['javascript', 'typescript'],
    quickFix: (match) => ({
      description: 'Replace innerHTML with textContent',
      before: match,
      after: 'textContent ='
    })
  },
  {
    id: 'SEC003',
    category: 'security',
    pattern: /dangerouslySetInnerHTML/g,
    severity: 'warning',
    message: 'dangerouslySetInnerHTML can lead to XSS - ensure content is sanitized',
    suggestion: 'Sanitize HTML with DOMPurify or similar library',
    languages: ['javascript', 'typescript', 'jsx', 'tsx']
  },
  {
    id: 'SEC004',
    category: 'security',
    pattern: /password\s*[:=]\s*['"`][^'"`]+['"`]/gi,
    severity: 'error',
    message: 'Hardcoded password detected',
    suggestion: 'Use environment variables for sensitive data',
    quickFix: (match) => ({
      description: 'Replace hardcoded password with environment variable',
      before: match,
      after: 'password = process.env.PASSWORD'
    })
  },
  {
    id: 'SEC005',
    category: 'security',
    pattern: /api[_-]?key\s*[:=]\s*['"`][a-zA-Z0-9]{20,}['"`]/gi,
    severity: 'error',
    message: 'Hardcoded API key detected',
    suggestion: 'Use environment variables for API keys',
    quickFix: (match) => ({
      description: 'Replace hardcoded API key with environment variable',
      before: match,
      after: 'apiKey = process.env.API_KEY'
    })
  },
  {
    id: 'SEC006',
    category: 'security',
    pattern: /SELECT\s+\*\s+FROM\s+\w+\s+WHERE.*\+|SELECT\s+\*\s+FROM\s+\w+\s+WHERE.*\$\{/gi,
    severity: 'error',
    message: 'Potential SQL injection - string concatenation in query',
    suggestion: 'Use parameterized queries or an ORM',
  },
  {
    id: 'SEC007',
    category: 'security',
    pattern: /exec\s*\([^)]*\+|exec\s*\([^)]*\$\{/g,
    severity: 'error',
    message: 'Command injection risk - dynamic command execution',
    suggestion: 'Validate and sanitize all user input',
    languages: ['python']
  },
  {
    id: 'SEC008',
    category: 'security',
    pattern: /jwt\.decode\s*\([^)]*verify\s*=\s*False/gi,
    severity: 'error',
    message: 'JWT decoded without verification',
    suggestion: 'Always verify JWT signatures',
    languages: ['python']
  },

  // Performance
  {
    id: 'PERF001',
    category: 'performance',
    pattern: /document\.querySelectorAll\([^)]+\)\.forEach/g,
    severity: 'info',
    message: 'Consider caching querySelectorAll result for multiple operations',
    suggestion: 'Store the result in a variable before iterating',
    languages: ['javascript', 'typescript']
  },
  {
    id: 'PERF002',
    category: 'performance',
    pattern: /JSON\.parse\(JSON\.stringify\(/g,
    severity: 'warning',
    message: 'Deep clone with JSON is slow for large objects',
    suggestion: 'Use structuredClone() or a dedicated library like lodash.cloneDeep',
  },
  {
    id: 'PERF003',
    category: 'performance',
    pattern: /useEffect\(\s*\(\)\s*=>\s*\{[^}]*\},\s*\[\s*\]\s*\)/gs,
    severity: 'info',
    message: 'Empty dependency array - effect runs only once',
    suggestion: 'Verify this is intentional behavior',
    languages: ['javascript', 'typescript', 'jsx', 'tsx']
  },
  {
    id: 'PERF004',
    category: 'performance',
    pattern: /await\s+\w+\([^)]*\)\s*;\s*await\s+\w+\([^)]*\)\s*;/g,
    severity: 'suggestion',
    message: 'Sequential awaits might be parallelizable',
    suggestion: 'Consider Promise.all() for independent async operations',
  },
  {
    id: 'PERF005',
    category: 'performance',
    pattern: /\.map\([^)]+\)\.filter\([^)]+\)/g,
    severity: 'suggestion',
    message: 'Chained map().filter() iterates twice',
    suggestion: 'Consider using reduce() for single-pass transformation',
  },

  // Coding Standards
  {
    id: 'STD001',
    category: 'coding-standards',
    pattern: /console\.(log|debug|info)\s*\(/g,
    severity: 'warning',
    message: 'Console statement found - remove for production',
    suggestion: 'Use a proper logging library or remove before deployment',
    quickFix: (match) => ({
      description: 'Remove console statement',
      before: match,
      after: '// ' + match + ' // TODO: Remove or replace with logger'
    })
  },
  {
    id: 'STD002',
    category: 'coding-standards',
    pattern: /\/\/\s*TODO:|\/\/\s*FIXME:|\/\/\s*HACK:/gi,
    severity: 'info',
    message: 'TODO/FIXME comment found - address before release',
  },
  {
    id: 'STD003',
    category: 'coding-standards',
    pattern: /debugger\s*;/g,
    severity: 'error',
    message: 'Debugger statement found - remove before deployment',
    languages: ['javascript', 'typescript'],
    quickFix: () => ({
      description: 'Remove debugger statement',
      before: 'debugger;',
      after: ''
    })
  },
  {
    id: 'STD004',
    category: 'coding-standards',
    pattern: /var\s+(\w+)\s*=/g,
    severity: 'warning',
    message: 'Prefer const or let over var',
    suggestion: 'Use const for immutable values, let for mutable',
    languages: ['javascript', 'typescript'],
    quickFix: (match) => ({
      description: 'Replace var with const',
      before: match,
      after: match.replace('var ', 'const ')
    })
  },
  {
    id: 'STD005',
    category: 'coding-standards',
    pattern: /==(?!=)/g,
    severity: 'warning',
    message: 'Use strict equality (===) instead of loose equality (==)',
    languages: ['javascript', 'typescript'],
    quickFix: () => ({
      description: 'Replace == with ===',
      before: '==',
      after: '==='
    })
  },
  {
    id: 'STD006',
    category: 'coding-standards',
    pattern: /!=(?!=)/g,
    severity: 'warning',
    message: 'Use strict inequality (!==) instead of loose inequality (!=)',
    languages: ['javascript', 'typescript'],
    quickFix: () => ({
      description: 'Replace != with !==',
      before: '!=',
      after: '!=='
    })
  },
  {
    id: 'STD007',
    category: 'coding-standards',
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}\}/g,
    severity: 'warning',
    message: 'Function appears too long (>500 chars)',
    suggestion: 'Consider breaking into smaller functions',
  },
  {
    id: 'STD008',
    category: 'coding-standards',
    pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g,
    severity: 'warning',
    message: 'Empty catch block - errors are silently ignored',
    suggestion: 'Log the error or handle it appropriately',
  },

  // Architecture
  {
    id: 'ARCH001',
    category: 'architecture',
    pattern: /import.*from\s+['"]\.\.\/\.\.\/\.\.\/\.\./g,
    severity: 'warning',
    message: 'Deep relative import - consider path aliases',
    suggestion: 'Configure path aliases in tsconfig.json',
    languages: ['javascript', 'typescript']
  },
  {
    id: 'ARCH002',
    category: 'architecture',
    pattern: /class\s+\w+\s*\{[\s\S]*constructor\s*\([^)]{200,}\)/g,
    severity: 'warning',
    message: 'Constructor has many parameters - consider dependency injection',
    suggestion: 'Use a DI container or builder pattern',
  },
  {
    id: 'ARCH003',
    category: 'architecture',
    pattern: /new\s+(Date|Math\.random)\s*\(\)/g,
    severity: 'suggestion',
    message: 'Direct instantiation makes testing harder',
    suggestion: 'Inject dependencies for better testability',
  },

  // Python specific
  {
    id: 'PY001',
    category: 'coding-standards',
    pattern: /except\s*:/g,
    severity: 'warning',
    message: 'Bare except catches all exceptions including SystemExit',
    suggestion: 'Specify exception type: except Exception:',
    languages: ['python']
  },
  {
    id: 'PY002',
    category: 'coding-standards',
    pattern: /print\s*\(/g,
    severity: 'info',
    message: 'Print statement found - consider using logging',
    suggestion: 'Use the logging module for production code',
    languages: ['python']
  },
  {
    id: 'PY003',
    category: 'security',
    pattern: /pickle\.load|pickle\.loads/g,
    severity: 'error',
    message: 'Pickle is unsafe for untrusted data',
    suggestion: 'Use JSON or a safe serialization format',
    languages: ['python']
  },
  {
    id: 'PY004',
    category: 'coding-standards',
    pattern: /from\s+\w+\s+import\s+\*/g,
    severity: 'warning',
    message: 'Wildcard imports make code harder to understand',
    suggestion: 'Import specific names explicitly',
    languages: ['python']
  },

  // Go specific
  {
    id: 'GO001',
    category: 'coding-standards',
    pattern: /fmt\.Print|fmt\.Println/g,
    severity: 'info',
    message: 'fmt.Print found - consider using structured logging',
    suggestion: 'Use log/slog or a logging library',
    languages: ['go']
  },
  {
    id: 'GO002',
    category: 'coding-standards',
    pattern: /panic\s*\(/g,
    severity: 'warning',
    message: 'Panic should be used sparingly',
    suggestion: 'Return errors instead of panicking',
    languages: ['go']
  },
  {
    id: 'GO003',
    category: 'coding-standards',
    pattern: /if\s+err\s*!=\s*nil\s*\{\s*return\s+nil\s*,?\s*err\s*\}/g,
    severity: 'suggestion',
    message: 'Consider wrapping errors with context',
    suggestion: 'Use fmt.Errorf("context: %w", err)',
    languages: ['go']
  },

  // Rust specific
  {
    id: 'RS001',
    category: 'coding-standards',
    pattern: /\.unwrap\(\)/g,
    severity: 'warning',
    message: 'unwrap() can panic on None/Err',
    suggestion: 'Use ? operator or match/if let for proper error handling',
    languages: ['rust']
  },
  {
    id: 'RS002',
    category: 'coding-standards',
    pattern: /\.expect\("[^"]*"\)/g,
    severity: 'info',
    message: 'expect() can panic - ensure this is intentional',
    suggestion: 'Use ? operator for propagating errors',
    languages: ['rust']
  },
  {
    id: 'RS003',
    category: 'coding-standards',
    pattern: /unsafe\s*\{/g,
    severity: 'warning',
    message: 'Unsafe block found - ensure safety invariants are documented',
    suggestion: 'Add SAFETY comment explaining why this is safe',
    languages: ['rust']
  }
];

function detectLanguage(file: string, content: string): string {
  const ext = file.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'java': 'java',
    'cs': 'csharp',
    'swift': 'swift',
    'kt': 'kotlin'
  };
  return langMap[ext] || 'unknown';
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

export function analyzeCode(
  file: string,
  content: string,
  focus: 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards' = 'all'
): AnalysisResult {
  const language = detectLanguage(file, content);
  const issues: CodeIssue[] = [];

  logger.debug('Analyzing code', { file, language, focus, contentLength: content.length });

  // Filter rules by focus and language
  const applicableRules = PATTERN_RULES.filter(rule => {
    if (focus !== 'all' && rule.category !== focus) return false;
    if (rule.languages && !rule.languages.includes(language)) return false;
    return true;
  });

  // Apply pattern rules
  for (const rule of applicableRules) {
    let match;
    // Reset regex state
    rule.pattern.lastIndex = 0;
    
    while ((match = rule.pattern.exec(content)) !== null) {
      const line = getLineNumber(content, match.index);
      const matchedText = match[0];
      
      // Generate quick fix if available
      const quickFix = rule.quickFix ? rule.quickFix(matchedText) : undefined;
      
      issues.push({
        severity: rule.severity,
        rule: rule.id,
        category: rule.category,
        message: rule.message,
        line,
        code: matchedText.substring(0, 100),
        suggestion: rule.suggestion,
        quickFix
      });

      // Prevent infinite loop on zero-length matches
      if (match.index === rule.pattern.lastIndex) {
        rule.pattern.lastIndex++;
      }
    }
  }

  // Sort issues by severity and line
  const severityOrder = { error: 0, warning: 1, info: 2, suggestion: 3 };
  issues.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (a.line || 0) - (b.line || 0);
  });

  // Calculate summary
  const summary = {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
    suggestions: issues.filter(i => i.severity === 'suggestion').length
  };

  // Calculate score (100 - penalties)
  let score = 100;
  score -= summary.errors * 10;
  score -= summary.warnings * 5;
  score -= summary.info * 1;
  score -= summary.suggestions * 0.5;
  score = Math.max(0, Math.min(100, score));

  // Collect unique quick fixes
  const quickFixes = issues
    .filter(i => i.quickFix)
    .map(i => i.quickFix!)
    .filter((fix, idx, arr) => arr.findIndex(f => f.before === fix.before) === idx);

  logger.info('Analysis complete', { file, issuesFound: issues.length, score, quickFixesAvailable: quickFixes.length });

  return {
    file,
    language,
    issues,
    score: Math.round(score),
    summary,
    quickFixes: quickFixes.length > 0 ? quickFixes : undefined
  };
}

export function analyzeMultipleFiles(
  files: Array<{ path: string; content: string }>,
  focus: 'all' | 'security' | 'performance' | 'architecture' | 'coding-standards' = 'all'
): {
  files: AnalysisResult[];
  overall: {
    totalFiles: number;
    totalIssues: number;
    averageScore: number;
    summary: AnalysisResult['summary'];
  };
} {
  const results = files.map(f => analyzeCode(f.path, f.content, focus));
  
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const averageScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 100;

  const summary = {
    errors: results.reduce((sum, r) => sum + r.summary.errors, 0),
    warnings: results.reduce((sum, r) => sum + r.summary.warnings, 0),
    info: results.reduce((sum, r) => sum + r.summary.info, 0),
    suggestions: results.reduce((sum, r) => sum + r.summary.suggestions, 0)
  };

  return {
    files: results,
    overall: {
      totalFiles: results.length,
      totalIssues,
      averageScore,
      summary
    }
  };
}

export function formatAnalysisReport(result: AnalysisResult): string {
  const lines: string[] = [];
  
  lines.push(`## Code Review: ${result.file}`);
  lines.push(`**Language:** ${result.language} | **Score:** ${result.score}/100`);
  lines.push('');
  
  if (result.issues.length === 0) {
    lines.push('✅ No issues found!');
  } else {
    lines.push(`### Summary`);
    lines.push(`- 🔴 Errors: ${result.summary.errors}`);
    lines.push(`- 🟡 Warnings: ${result.summary.warnings}`);
    lines.push(`- 🔵 Info: ${result.summary.info}`);
    lines.push(`- 💡 Suggestions: ${result.summary.suggestions}`);
    lines.push('');
    lines.push('### Issues');
    
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '🔴' :
                   issue.severity === 'warning' ? '🟡' :
                   issue.severity === 'info' ? '🔵' : '💡';
      
      lines.push(`#### ${icon} [${issue.rule}] ${issue.message}`);
      if (issue.line) lines.push(`- Line: ${issue.line}`);
      if (issue.code) lines.push(`- Code: \`${issue.code}\``);
      if (issue.suggestion) lines.push(`- 💡 ${issue.suggestion}`);
      if (issue.quickFix) {
        lines.push(`- 🔧 **Quick Fix:** ${issue.quickFix.description}`);
        lines.push(`  - Replace: \`${issue.quickFix.before}\``);
        lines.push(`  - With: \`${issue.quickFix.after}\``);
      }
      lines.push('');
    }
    
    // Add quick fixes summary at the end
    if (result.quickFixes && result.quickFixes.length > 0) {
      lines.push('### 🔧 Available Quick Fixes');
      lines.push('');
      for (const fix of result.quickFixes) {
        lines.push(`- **${fix.description}**`);
        lines.push(`  \`${fix.before}\` → \`${fix.after}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
