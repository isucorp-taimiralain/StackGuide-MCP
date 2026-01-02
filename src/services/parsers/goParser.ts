/**
 * Go Language Parser
 * Semantic analysis for Go code
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
 * Go-specific parser with semantic rules
 */
export class GoParser extends BaseLanguageParser {
  readonly language = 'go' as const;
  readonly extensions = ['.go'];
  
  constructor() {
    super();
    this.rules = GO_RULES;
  }
  
  parse(code: string, filePath: string): ParseResult {
    const startTime = Date.now();
    
    const symbols: ParsedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = []; // Go uses structs
    const variables: VariableInfo[] = [];
    
    // Extract components
    imports.push(...this.extractImports(code));
    functions.push(...this.extractFunctions(code));
    classes.push(...this.extractStructs(code));
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
        column: 1
      });
    }
    
    for (const cls of classes) {
      symbols.push({
        type: 'struct',
        name: cls.name,
        line: cls.line,
        column: 1
      });
    }
    
    // Extract interfaces
    const interfaceMatches = code.matchAll(/type\s+(\w+)\s+interface\s*{/g);
    for (const match of interfaceMatches) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      symbols.push({
        type: 'interface',
        name: match[1],
        line,
        column: 1
      });
    }
    
    const comments = this.extractComments(code, '//', '/*', '*/');
    
    return {
      language: 'go',
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
    
    // Single import: import "package"
    const singleImportRegex = /import\s+"([^"]+)"/g;
    let match;
    
    while ((match = singleImportRegex.exec(code)) !== null) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      imports.push({
        module: match[1],
        items: [],
        line
      });
    }
    
    // Import block: import ( ... )
    const importBlockRegex = /import\s*\(\s*([\s\S]*?)\s*\)/g;
    
    while ((match = importBlockRegex.exec(code)) !== null) {
      const blockContent = match[1];
      const blockStart = code.substring(0, match.index).split('\n').length;
      const lines = blockContent.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // alias "package" or just "package"
        const pkgMatch = line.match(/^(?:(\w+)\s+)?"([^"]+)"$/);
        if (pkgMatch) {
          imports.push({
            module: pkgMatch[2],
            items: [],
            alias: pkgMatch[1],
            line: blockStart + i
          });
        }
      }
    }
    
    return imports;
  }
  
  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');
    
    // func name(params) returns { or func (receiver) name(params) returns {
    const funcRegex = /func\s+(?:\(\s*\w+\s+\*?[\w.]+\s*\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(([^)]*)\)|\s*(\w+(?:\.\w+)?))?\s*{/g;
    
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1];
      const paramsStr = match[2] || '';
      const returnTuple = match[3];
      const returnType = match[4] || returnTuple;
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      
      // Find function end by brace matching
      let braceCount = 1;
      let endLine = lineNum;
      const funcStart = match.index + match[0].length;
      
      for (let i = funcStart; i < code.length && braceCount > 0; i++) {
        if (code[i] === '{') braceCount++;
        if (code[i] === '}') braceCount--;
        if (braceCount === 0) {
          endLine = code.substring(0, i).split('\n').length;
        }
      }
      
      // Parse parameters
      const parameters = this.parseGoParams(paramsStr);
      
      // Calculate complexity
      const bodyCode = lines.slice(lineNum, endLine).join('\n');
      const complexity = this.calculateComplexity(bodyCode);
      
      // Check if it's exported (starts with uppercase)
      const isExported = funcName[0] === funcName[0].toUpperCase();
      
      functions.push({
        name: funcName,
        line: lineNum,
        endLine,
        parameters,
        returnType,
        isExported,
        complexity,
        bodyLines: endLine - lineNum
      });
    }
    
    return functions;
  }
  
  private parseGoParams(paramsStr: string): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    if (!paramsStr.trim()) return params;
    
    // Split by comma, handling func types
    const paramList = this.splitGoParams(paramsStr);
    
    for (const param of paramList) {
      const trimmed = param.trim();
      if (!trimmed) continue;
      
      // name type or name1, name2 type
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const type = parts[parts.length - 1];
        for (let i = 0; i < parts.length - 1; i++) {
          const name = parts[i].replace(',', '');
          params.push({
            name,
            type,
            isRest: type.startsWith('...')
          });
        }
      } else if (parts.length === 1 && parts[0].includes(' ')) {
        // Single param with type
        const [name, type] = parts[0].split(' ');
        params.push({ name, type });
      }
    }
    
    return params;
  }
  
  private splitGoParams(paramsStr: string): string[] {
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
  
  private extractStructs(code: string): ClassInfo[] {
    const structs: ClassInfo[] = [];
    const lines = code.split('\n');
    
    // type Name struct { ... }
    const structRegex = /type\s+(\w+)\s+struct\s*{([^}]*)}/g;
    
    let match;
    while ((match = structRegex.exec(code)) !== null) {
      const structName = match[1];
      const bodyContent = match[2];
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const endLine = lineNum + bodyContent.split('\n').length;
      
      // Parse fields
      const members: MemberInfo[] = [];
      const fieldLines = bodyContent.split('\n');
      
      for (let i = 0; i < fieldLines.length; i++) {
        const fieldLine = fieldLines[i].trim();
        if (!fieldLine || fieldLine.startsWith('//')) continue;
        
        // FieldName Type `tag`
        const fieldMatch = fieldLine.match(/^(\w+)\s+([\w.*\[\]]+)/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          members.push({
            name: fieldName,
            type: 'field',
            dataType: fieldMatch[2],
            visibility: fieldName[0] === fieldName[0].toUpperCase() ? 'public' : 'private',
            line: lineNum + i + 1
          });
        }
      }
      
      structs.push({
        name: structName,
        line: lineNum,
        endLine,
        members,
        isExported: structName[0] === structName[0].toUpperCase()
      });
    }
    
    return structs;
  }
  
  private extractVariables(code: string): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const lines = code.split('\n');
    
    // Package-level: var name Type = value or const name = value
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // const or var declaration
      const varMatch = line.match(/^(const|var)\s+(\w+)(?:\s+(\w+))?\s*=\s*(.+)$/);
      if (varMatch) {
        variables.push({
          name: varMatch[2],
          line: i + 1,
          type: varMatch[3],
          isConst: varMatch[1] === 'const',
          scope: 'module',
          value: varMatch[4],
          isExported: varMatch[2][0] === varMatch[2][0].toUpperCase()
        });
      }
    }
    
    return variables;
  }
}

/**
 * Go-specific semantic rules
 */
const GO_RULES: LanguageRule[] = [
  {
    id: 'GO001',
    name: 'unchecked-error',
    description: 'Error return value should be checked',
    language: 'go',
    severity: 'error',
    category: 'error-handling',
    enabled: true,
    priority: 95,
    check: (ctx: ParseContext) => {
      // Look for function calls that return error but discard it
      const matches = ctx.findPatternMatches(/\w+\s*\(\s*[^)]*\s*\)\s*$/m);
      // Check for common patterns that ignore errors
      const ignorePatterns = ctx.findPatternMatches(/[^,]\s*:?=\s*\w+\([^)]*\)(?!\s*;\s*if)/);
      
      // More specific: look for _ = to ignore error
      const discardError = ctx.findPatternMatches(/_\s*=\s*\w+\([^)]*\)/);
      if (discardError.length > 0) {
        return {
          hasIssue: true,
          message: 'Error value explicitly discarded',
          line: discardError[0].line,
          suggestion: 'Handle the error instead of discarding it'
        };
      }
      return null;
    }
  },
  {
    id: 'GO002',
    name: 'missing-defer-close',
    description: 'Opened resource should have defer Close()',
    language: 'go',
    severity: 'warning',
    category: 'resource-management',
    enabled: true,
    priority: 85,
    check: (ctx: ParseContext) => {
      // Look for Open/Create calls
      const openCalls = ctx.findPatternMatches(/os\.(Open|Create)\s*\(/);
      const httpBodies = ctx.findPatternMatches(/\.Body\b/);
      
      // Check for corresponding defer close
      const deferClose = ctx.findPatternMatches(/defer\s+\w+\.Close\(\)/);
      
      if ((openCalls.length > 0 || httpBodies.length > 0) && deferClose.length === 0) {
        const line = openCalls[0]?.line || httpBodies[0]?.line;
        return {
          hasIssue: true,
          message: 'Opened file/resource without defer Close()',
          line,
          suggestion: 'Add defer file.Close() after opening'
        };
      }
      return null;
    }
  },
  {
    id: 'GO003',
    name: 'context-first-param',
    description: 'Context should be first parameter',
    language: 'go',
    severity: 'info',
    category: 'best-practices',
    enabled: true,
    priority: 50,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        const hasContext = func.parameters.some(p => 
          p.type === 'context.Context' || p.type?.includes('Context')
        );
        if (hasContext && func.parameters[0]?.type !== 'context.Context') {
          return {
            hasIssue: true,
            message: `Context parameter not first in '${func.name}'`,
            line: func.line,
            suggestion: 'Move context.Context to be the first parameter'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'GO004',
    name: 'naked-return',
    description: 'Avoid naked returns in long functions',
    language: 'go',
    severity: 'warning',
    category: 'readability',
    enabled: true,
    priority: 60,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (func.bodyLines && func.bodyLines > 10) {
          // Check for naked return
          const startLine = func.line;
          const endLine = func.endLine || startLine + 10;
          const funcBody = ctx.getLines(startLine, endLine).join('\n');
          
          if (/\breturn\s*$/.test(funcBody) && func.returnType) {
            return {
              hasIssue: true,
              message: `Naked return in function '${func.name}' (${func.bodyLines} lines)`,
              line: func.line,
              suggestion: 'Use explicit return values for clarity in longer functions'
            };
          }
        }
      }
      return null;
    }
  },
  {
    id: 'GO005',
    name: 'empty-interface',
    description: 'Avoid interface{} (use any or specific types)',
    language: 'go',
    severity: 'info',
    category: 'type-safety',
    enabled: true,
    priority: 50,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\binterface\s*\{\s*\}/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: `Found ${matches.length} uses of interface{} - consider using 'any' or specific types`,
          line: matches[0].line,
          suggestion: 'Use type parameters or the any keyword (Go 1.18+)'
        };
      }
      return null;
    }
  },
  {
    id: 'GO006',
    name: 'unused-goroutine-result',
    description: 'Goroutine result might be lost',
    language: 'go',
    severity: 'warning',
    category: 'concurrency',
    enabled: true,
    priority: 80,
    check: (ctx: ParseContext) => {
      // Look for go statements
      const goStatements = ctx.findPatternMatches(/\bgo\s+\w+\s*\(/);
      const channels = ctx.findPatternMatches(/\bmake\s*\(\s*chan\b/);
      const waitGroups = ctx.findPatternMatches(/sync\.WaitGroup/);
      
      if (goStatements.length > 0 && channels.length === 0 && waitGroups.length === 0) {
        return {
          hasIssue: true,
          message: 'Goroutine started without channel or WaitGroup for result',
          line: goStatements[0].line,
          suggestion: 'Use channels or sync.WaitGroup to collect goroutine results'
        };
      }
      return null;
    }
  },
  {
    id: 'GO007',
    name: 'race-condition-risk',
    description: 'Potential race condition with shared variable',
    language: 'go',
    severity: 'warning',
    category: 'concurrency',
    enabled: true,
    priority: 85,
    check: (ctx: ParseContext) => {
      // Detect goroutines accessing non-local variables
      const goBlocks = ctx.findPatternMatches(/go\s+func\s*\([^)]*\)\s*{[^}]+}/);
      const mutex = ctx.findPatternMatches(/sync\.(Mutex|RWMutex)/);
      
      if (goBlocks.length > 1 && mutex.length === 0) {
        return {
          hasIssue: true,
          message: 'Multiple goroutines without mutex protection',
          line: goBlocks[0].line,
          suggestion: 'Consider using sync.Mutex or channels for safe concurrent access'
        };
      }
      return null;
    }
  },
  {
    id: 'GO008',
    name: 'init-function',
    description: 'Avoid complex init() functions',
    language: 'go',
    severity: 'info',
    category: 'best-practices',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (func.name === 'init' && func.bodyLines && func.bodyLines > 20) {
          return {
            hasIssue: true,
            message: `init() function is ${func.bodyLines} lines - too complex`,
            line: func.line,
            suggestion: 'Keep init() simple, move logic to explicit setup functions'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'GO009',
    name: 'public-struct-private-fields',
    description: 'Exported struct has all private fields',
    language: 'go',
    severity: 'info',
    category: 'api-design',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      for (const cls of ctx.classes) {
        if (cls.isExported) {
          const publicFields = cls.members.filter(m => m.visibility === 'public');
          if (publicFields.length === 0 && cls.members.length > 0) {
            return {
              hasIssue: true,
              message: `Exported struct '${cls.name}' has only private fields`,
              line: cls.line,
              suggestion: 'Consider adding constructor function or public fields'
            };
          }
        }
      }
      return null;
    }
  },
  {
    id: 'GO010',
    name: 'fmt-printf-verbs',
    description: 'Check Printf format verbs match arguments',
    language: 'go',
    severity: 'warning',
    category: 'bugs',
    enabled: true,
    priority: 75,
    check: (ctx: ParseContext) => {
      // Simple check for Printf with %v and wrong arg count
      const printfCalls = ctx.findPatternMatches(/fmt\.(Printf|Sprintf|Errorf)\s*\(\s*"([^"]+)"/);
      for (const call of printfCalls) {
        const format = call.groups?.['2'] || call.match;
        const verbCount = (format.match(/%[vdsqxXbcdefgpstTw]/g) || []).length;
        // Count arguments after format string (rough estimate)
        const lineContent = ctx.getLine(call.line);
        const argCount = (lineContent.split(',').length - 1);
        
        if (verbCount > argCount) {
          return {
            hasIssue: true,
            message: 'Printf format has more verbs than arguments',
            line: call.line,
            suggestion: 'Check format string arguments match verb count'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'GO011',
    name: 'sync-pool-new',
    description: 'sync.Pool should have New function',
    language: 'go',
    severity: 'warning',
    category: 'performance',
    enabled: true,
    priority: 60,
    check: (ctx: ParseContext) => {
      const poolDecl = ctx.findPatternMatches(/sync\.Pool\s*{/);
      const poolNew = ctx.findPatternMatches(/sync\.Pool\s*{\s*New:/);
      
      if (poolDecl.length > poolNew.length) {
        return {
          hasIssue: true,
          message: 'sync.Pool without New function',
          line: poolDecl[0].line,
          suggestion: 'Add New: func() interface{} {...} to initialize pool objects'
        };
      }
      return null;
    }
  },
  {
    id: 'GO012',
    name: 'panic-recover',
    description: 'Check for panic without recover',
    language: 'go',
    severity: 'warning',
    category: 'error-handling',
    enabled: true,
    priority: 70,
    check: (ctx: ParseContext) => {
      const panics = ctx.findPatternMatches(/\bpanic\s*\(/);
      const recovers = ctx.findPatternMatches(/\brecover\s*\(/);
      
      if (panics.length > 0 && recovers.length === 0) {
        return {
          hasIssue: true,
          message: `${panics.length} panic() calls without recover()`,
          line: panics[0].line,
          suggestion: 'Consider using recover() or returning errors instead of panic'
        };
      }
      return null;
    }
  }
];

export { GO_RULES };
