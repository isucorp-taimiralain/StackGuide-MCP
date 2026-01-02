/**
 * Python Language Parser
 * Semantic analysis for Python code
 * @version 3.2.0
 */

import { BaseLanguageParser } from './baseParser.js';
import type {
  ParseResult,
  ParsedSymbol,
  ImportInfo,
  FunctionInfo,
  ClassInfo,
  VariableInfo,
  CommentInfo,
  ParameterInfo,
  MemberInfo,
  LanguageRule,
  ParseContext
} from './types.js';

/**
 * Python-specific parser with semantic rules
 */
export class PythonParser extends BaseLanguageParser {
  readonly language = 'python' as const;
  readonly extensions = ['.py', '.pyi', '.pyw'];
  
  constructor() {
    super();
    this.rules = PYTHON_RULES;
  }
  
  parse(code: string, filePath: string): ParseResult {
    const startTime = Date.now();
    
    const symbols: ParsedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const variables: VariableInfo[] = [];
    
    // Extract components
    imports.push(...this.extractImports(code));
    functions.push(...this.extractFunctions(code));
    classes.push(...this.extractClasses(code));
    variables.push(...this.extractVariables(code));
    
    // Build symbol list
    for (const imp of imports) {
      symbols.push({
        type: 'import',
        name: imp.module,
        line: imp.line,
        column: 1
      });
    }
    
    for (const func of functions) {
      symbols.push({
        type: 'function',
        name: func.name,
        line: func.line,
        column: 1,
        modifiers: func.decorators
      });
    }
    
    for (const cls of classes) {
      symbols.push({
        type: 'class',
        name: cls.name,
        line: cls.line,
        column: 1,
        modifiers: cls.decorators
      });
    }
    
    // Extract decorators as symbols
    const decoratorMatches = code.matchAll(/@(\w+)(?:\([^)]*\))?/g);
    for (const match of decoratorMatches) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      symbols.push({
        type: 'decorator',
        name: match[1],
        line,
        column: 1
      });
    }
    
    const comments = this.extractComments(code, '#', '"""', '"""');
    
    return {
      language: 'python',
      filePath,
      symbols,
      imports,
      functions,
      classes,
      variables,
      comments,
      errors: [],
      parseTime: Date.now() - startTime
    };
  }
  
  private extractImports(code: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = code.split('\n');
    
    // import module
    // import module as alias
    // from module import item1, item2
    // from module import item as alias
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;
      
      // from X import Y
      const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const module = fromMatch[1];
        const itemsPart = fromMatch[2];
        const items: string[] = [];
        let alias: string | undefined;
        
        // Check for "import *"
        if (itemsPart.trim() === '*') {
          items.push('*');
        } else {
          // Parse individual items
          const itemMatches = itemsPart.matchAll(/(\w+)(?:\s+as\s+(\w+))?/g);
          for (const itemMatch of itemMatches) {
            items.push(itemMatch[1]);
            if (itemMatch[2]) {
              alias = itemMatch[2];
            }
          }
        }
        
        imports.push({
          module,
          items,
          alias,
          line: lineNum,
          isRelative: module.startsWith('.')
        });
        continue;
      }
      
      // import X [as Y]
      const importMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?$/);
      if (importMatch) {
        imports.push({
          module: importMatch[1],
          items: [],
          alias: importMatch[2],
          line: lineNum,
          isDefault: true
        });
      }
    }
    
    return imports;
  }
  
  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');
    
    // Match function definitions with decorators
    const funcRegex = /^(\s*)(?:(@\w+(?:\([^)]*\))?)\s*\n\s*)*def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/gm;
    
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      const indent = match[1] || '';
      const funcName = match[3];
      const paramsStr = match[4] || '';
      const returnType = match[5]?.trim();
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      // Find decorators above this function
      const decorators: string[] = [];
      for (let i = lineNum - 2; i >= 0; i--) {
        const prevLine = lines[i]?.trim();
        if (prevLine?.startsWith('@')) {
          decorators.unshift(prevLine);
        } else if (prevLine && !prevLine.startsWith('#')) {
          break;
        }
      }
      
      // Parse parameters
      const parameters = this.parseParameters(paramsStr);
      
      // Find function end
      const indentLevel = indent.length;
      let endLine = lineNum;
      for (let i = lineNum; i < lines.length; i++) {
        const currentLine = lines[i];
        if (currentLine.trim() && !currentLine.startsWith(' '.repeat(indentLevel + 1)) && !currentLine.match(/^\s*#/)) {
          if (i > lineNum) {
            endLine = i;
            break;
          }
        }
        endLine = i + 1;
      }
      
      // Check for docstring
      let docstring: string | undefined;
      const firstBodyLine = lines[lineNum]?.trim();
      if (firstBodyLine?.startsWith('"""') || firstBodyLine?.startsWith("'''")) {
        const quote = firstBodyLine.startsWith('"""') ? '"""' : "'''";
        if (firstBodyLine.endsWith(quote) && firstBodyLine.length > 6) {
          docstring = firstBodyLine.slice(3, -3);
        } else {
          // Multi-line docstring
          for (let i = lineNum; i < endLine; i++) {
            if (lines[i].includes(quote) && i > lineNum) {
              docstring = lines.slice(lineNum, i + 1).join('\n');
              break;
            }
          }
        }
      }
      
      // Calculate complexity for the function body
      const bodyLines = lines.slice(lineNum, endLine);
      const complexity = this.calculateComplexity(bodyLines.join('\n'));
      
      functions.push({
        name: funcName,
        line: lineNum,
        endLine,
        parameters,
        returnType,
        isAsync: lines[lineNum - 1]?.includes('async def'),
        isExported: true, // Python has no explicit export
        decorators,
        docstring,
        complexity,
        bodyLines: endLine - lineNum
      });
    }
    
    return functions;
  }
  
  private parseParameters(paramsStr: string): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    if (!paramsStr.trim()) return params;
    
    // Split by comma, but handle nested brackets
    const paramList = this.splitParams(paramsStr);
    
    for (const param of paramList) {
      const trimmed = param.trim();
      if (!trimmed || trimmed === 'self' || trimmed === 'cls') continue;
      
      // name: type = default
      const paramMatch = trimmed.match(/^(\*{0,2})(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/);
      if (paramMatch) {
        params.push({
          name: paramMatch[2],
          type: paramMatch[3]?.trim(),
          defaultValue: paramMatch[4]?.trim(),
          isOptional: !!paramMatch[4],
          isRest: paramMatch[1] === '*' || paramMatch[1] === '**'
        });
      }
    }
    
    return params;
  }
  
  private splitParams(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of paramsStr) {
      if (char === '(' || char === '[' || char === '{') depth++;
      if (char === ')' || char === ']' || char === '}') depth--;
      
      if (char === ',' && depth === 0) {
        params.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) params.push(current);
    return params;
  }
  
  private extractClasses(code: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const lines = code.split('\n');
    
    const classRegex = /^(\s*)class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/gm;
    
    let match;
    while ((match = classRegex.exec(code)) !== null) {
      const indent = match[1] || '';
      const className = match[2];
      const basesStr = match[3] || '';
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      // Parse base classes
      const baseClasses = basesStr.split(',').map(b => b.trim()).filter(b => b);
      
      // Find decorators
      const decorators: string[] = [];
      for (let i = lineNum - 2; i >= 0; i--) {
        const prevLine = lines[i]?.trim();
        if (prevLine?.startsWith('@')) {
          decorators.unshift(prevLine);
        } else if (prevLine && !prevLine.startsWith('#')) {
          break;
        }
      }
      
      // Find class end and members
      const indentLevel = indent.length;
      let endLine = lineNum;
      const members: MemberInfo[] = [];
      
      for (let i = lineNum; i < lines.length; i++) {
        const currentLine = lines[i];
        const trimmedLine = currentLine.trim();
        
        if (trimmedLine && !currentLine.startsWith(' '.repeat(indentLevel + 1)) && !trimmedLine.startsWith('#')) {
          if (i > lineNum) {
            endLine = i;
            break;
          }
        }
        
        // Find methods
        const methodMatch = trimmedLine.match(/^def\s+(\w+)\s*\(/);
        if (methodMatch) {
          const memberName = methodMatch[1];
          members.push({
            name: memberName,
            type: memberName === '__init__' ? 'constructor' : 'method',
            visibility: memberName.startsWith('_') ? 'private' : 'public',
            line: i + 1,
            isStatic: lines[i - 1]?.trim().includes('@staticmethod')
          });
        }
        
        // Find class attributes
        const attrMatch = trimmedLine.match(/^(\w+)\s*(?::\s*\w+)?\s*=/);
        if (attrMatch && !trimmedLine.startsWith('def ')) {
          members.push({
            name: attrMatch[1],
            type: 'field',
            visibility: attrMatch[1].startsWith('_') ? 'private' : 'public',
            line: i + 1,
            isStatic: true
          });
        }
        
        endLine = i + 1;
      }
      
      // Find docstring
      let docstring: string | undefined;
      const firstBodyLine = lines[lineNum]?.trim();
      if (firstBodyLine?.startsWith('"""') || firstBodyLine?.startsWith("'''")) {
        docstring = firstBodyLine;
      }
      
      classes.push({
        name: className,
        line: lineNum,
        endLine,
        baseClasses,
        members,
        decorators,
        docstring
      });
    }
    
    return classes;
  }
  
  private extractVariables(code: string): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const lines = code.split('\n');
    
    // Module-level variables (not indented)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith(' ') && !line.startsWith('\t') && !line.trim().startsWith('#')) {
        // name = value or name: type = value
        const varMatch = line.match(/^([A-Z_][A-Z0-9_]*)\s*(?::\s*(\w+))?\s*=\s*(.+)$/);
        if (varMatch) {
          variables.push({
            name: varMatch[1],
            line: i + 1,
            type: varMatch[2],
            isConst: varMatch[1] === varMatch[1].toUpperCase(),
            scope: 'module',
            value: varMatch[3]
          });
        }
      }
    }
    
    return variables;
  }
}

/**
 * Python-specific semantic rules
 */
const PYTHON_RULES: LanguageRule[] = [
  {
    id: 'PY001',
    name: 'missing-type-hints',
    description: 'Function parameters should have type hints',
    language: 'python',
    severity: 'warning',
    category: 'type-safety',
    enabled: true,
    priority: 70,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        const hasUntypedParams = func.parameters.some(p => !p.type && !p.isRest);
        if (hasUntypedParams && !func.name.startsWith('_')) {
          return {
            hasIssue: true,
            message: `Function '${func.name}' has parameters without type hints`,
            line: func.line,
            suggestion: 'Add type hints to all parameters for better code clarity'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY002',
    name: 'missing-return-type',
    description: 'Functions should have return type hints',
    language: 'python',
    severity: 'warning',
    category: 'type-safety',
    enabled: true,
    priority: 70,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (!func.returnType && !func.name.startsWith('_') && func.name !== '__init__') {
          return {
            hasIssue: true,
            message: `Function '${func.name}' has no return type hint`,
            line: func.line,
            suggestion: 'Add return type annotation: -> ReturnType'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY003',
    name: 'missing-docstring',
    description: 'Public functions and classes should have docstrings',
    language: 'python',
    severity: 'info',
    category: 'documentation',
    enabled: true,
    priority: 50,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (!func.docstring && !func.name.startsWith('_')) {
          return {
            hasIssue: true,
            message: `Function '${func.name}' has no docstring`,
            line: func.line,
            suggestion: 'Add a docstring explaining the function purpose'
          };
        }
      }
      for (const cls of ctx.classes) {
        if (!cls.docstring) {
          return {
            hasIssue: true,
            message: `Class '${cls.name}' has no docstring`,
            line: cls.line,
            suggestion: 'Add a docstring explaining the class purpose'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY004',
    name: 'star-import',
    description: 'Avoid wildcard imports (from X import *)',
    language: 'python',
    severity: 'warning',
    category: 'best-practices',
    enabled: true,
    priority: 80,
    check: (ctx: ParseContext) => {
      for (const imp of ctx.imports) {
        if (imp.items.includes('*')) {
          return {
            hasIssue: true,
            message: `Wildcard import from '${imp.module}'`,
            line: imp.line,
            suggestion: 'Import specific names instead of using *'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY005',
    name: 'bare-except',
    description: 'Avoid bare except clauses',
    language: 'python',
    severity: 'error',
    category: 'error-handling',
    enabled: true,
    priority: 90,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/except\s*:/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: 'Bare except clause catches all exceptions including SystemExit and KeyboardInterrupt',
          line: matches[0].line,
          suggestion: 'Use except Exception: or a more specific exception type'
        };
      }
      return null;
    }
  },
  {
    id: 'PY006',
    name: 'mutable-default-arg',
    description: 'Avoid mutable default arguments',
    language: 'python',
    severity: 'error',
    category: 'bugs',
    enabled: true,
    priority: 95,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        for (const param of func.parameters) {
          if (param.defaultValue) {
            const val = param.defaultValue;
            if (val === '[]' || val === '{}' || val.startsWith('[') || val.startsWith('{')) {
              return {
                hasIssue: true,
                message: `Mutable default argument '${param.name}=${val}' in '${func.name}'`,
                line: func.line,
                suggestion: 'Use None as default and create mutable in function body'
              };
            }
          }
        }
      }
      return null;
    }
  },
  {
    id: 'PY007',
    name: 'complex-function',
    description: 'Function has high cyclomatic complexity',
    language: 'python',
    severity: 'warning',
    category: 'maintainability',
    enabled: true,
    priority: 60,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (func.complexity && func.complexity > 10) {
          return {
            hasIssue: true,
            message: `Function '${func.name}' has complexity of ${func.complexity}`,
            line: func.line,
            details: 'Cyclomatic complexity above 10 indicates hard to test code',
            suggestion: 'Break down into smaller functions'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY008',
    name: 'long-function',
    description: 'Function body is too long',
    language: 'python',
    severity: 'info',
    category: 'maintainability',
    enabled: true,
    priority: 50,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (func.bodyLines && func.bodyLines > 50) {
          return {
            hasIssue: true,
            message: `Function '${func.name}' is ${func.bodyLines} lines long`,
            line: func.line,
            suggestion: 'Consider splitting into smaller, focused functions'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'PY009',
    name: 'assert-in-production',
    description: 'Assert statements are disabled with python -O',
    language: 'python',
    severity: 'warning',
    category: 'best-practices',
    enabled: true,
    priority: 70,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/^\s*assert\s+/m);
      if (matches.length > 3) { // Allow some asserts
        return {
          hasIssue: true,
          message: `${matches.length} assert statements found - disabled with -O flag`,
          line: matches[0].line,
          suggestion: 'Use explicit validation with if/raise for production code'
        };
      }
      return null;
    }
  },
  {
    id: 'PY010',
    name: 'print-statement',
    description: 'Avoid print() for logging in production code',
    language: 'python',
    severity: 'info',
    category: 'coding-standards',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\bprint\s*\(/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: `Found ${matches.length} print() statements`,
          line: matches[0].line,
          suggestion: 'Use logging module for production code'
        };
      }
      return null;
    }
  },
  {
    id: 'PY011',
    name: 'unused-import',
    description: 'Import appears to be unused',
    language: 'python',
    severity: 'info',
    category: 'code-quality',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      for (const imp of ctx.imports) {
        for (const item of imp.items) {
          if (item !== '*') {
            // Simple check - see if the name appears elsewhere in code
            const pattern = new RegExp(`\\b${item}\\b`, 'g');
            const matches = ctx.code.match(pattern);
            if (matches && matches.length === 1) {
              return {
                hasIssue: true,
                message: `Import '${item}' from '${imp.module}' appears unused`,
                line: imp.line,
                suggestion: 'Remove unused import'
              };
            }
          }
        }
      }
      return null;
    }
  },
  {
    id: 'PY012',
    name: 'global-statement',
    description: 'Avoid using global statement',
    language: 'python',
    severity: 'warning',
    category: 'best-practices',
    enabled: true,
    priority: 75,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\bglobal\s+\w/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: 'Use of global statement detected',
          line: matches[0].line,
          suggestion: 'Pass variables as parameters or use a class instead'
        };
      }
      return null;
    }
  }
];

export { PYTHON_RULES };
