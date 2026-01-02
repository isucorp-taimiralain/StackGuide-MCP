/**
 * Rust Language Parser
 * Semantic analysis for Rust code
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
 * Rust-specific parser with semantic rules
 */
export class RustParser extends BaseLanguageParser {
  readonly language = 'rust' as const;
  readonly extensions = ['.rs'];
  
  constructor() {
    super();
    this.rules = RUST_RULES;
  }
  
  parse(code: string, filePath: string): ParseResult {
    const startTime = Date.now();
    
    const symbols: ParsedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = []; // Rust uses structs
    const variables: VariableInfo[] = [];
    
    // Extract components
    imports.push(...this.extractUses(code));
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
        column: 1,
        modifiers: func.annotations
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
    
    // Extract traits
    const traitMatches = code.matchAll(/trait\s+(\w+)/g);
    for (const match of traitMatches) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      symbols.push({
        type: 'trait',
        name: match[1],
        line,
        column: 1
      });
    }
    
    // Extract enums
    const enumMatches = code.matchAll(/enum\s+(\w+)/g);
    for (const match of enumMatches) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      symbols.push({
        type: 'enum',
        name: match[1],
        line,
        column: 1
      });
    }
    
    // Extract macros
    const macroMatches = code.matchAll(/macro_rules!\s+(\w+)/g);
    for (const match of macroMatches) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      symbols.push({
        type: 'macro',
        name: match[1],
        line,
        column: 1
      });
    }
    
    const comments = this.extractComments(code, '//', '/*', '*/');
    
    return {
      language: 'rust',
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
  
  private extractUses(code: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    
    // use crate::module::item;
    // use crate::module::{item1, item2};
    // use crate::module::*;
    const useRegex = /use\s+([\w:]+)(?:::\{([^}]+)\}|::(\*)|::(\w+))?;/g;
    
    let match;
    while ((match = useRegex.exec(code)) !== null) {
      const beforeMatch = code.substring(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      const module = match[1];
      let items: string[] = [];
      
      if (match[2]) {
        // Multiple items in braces
        items = match[2].split(',').map(s => s.trim());
      } else if (match[3]) {
        // Wildcard
        items = ['*'];
      } else if (match[4]) {
        // Single item
        items = [match[4]];
      }
      
      imports.push({
        module,
        items,
        line,
        isRelative: module.startsWith('crate::') || module.startsWith('super::')
      });
    }
    
    return imports;
  }
  
  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');
    
    // fn name(params) -> ReturnType { or async fn, pub fn, pub async fn
    const funcRegex = /(pub\s+)?(async\s+)?fn\s+(\w+)(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*([^\s{]+))?\s*(?:where[^{]+)?\s*{/g;
    
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      const isPublic = !!match[1];
      const isAsync = !!match[2];
      const funcName = match[3];
      const paramsStr = match[4] || '';
      const returnType = match[5];
      
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
      
      // Look for attributes above function
      const annotations: string[] = [];
      for (let i = lineNum - 2; i >= 0 && i > lineNum - 10; i--) {
        const prevLine = lines[i]?.trim();
        if (prevLine?.startsWith('#[')) {
          annotations.unshift(prevLine);
        } else if (prevLine && !prevLine.startsWith('//')) {
          break;
        }
      }
      
      // Parse parameters
      const parameters = this.parseRustParams(paramsStr);
      
      // Calculate complexity
      const bodyCode = lines.slice(lineNum, endLine).join('\n');
      const complexity = this.calculateComplexity(bodyCode);
      
      // Look for doc comments
      let docstring: string | undefined;
      for (let i = lineNum - 2; i >= 0; i--) {
        const prevLine = lines[i]?.trim();
        if (prevLine?.startsWith('///')) {
          docstring = (docstring ? prevLine.slice(3) + '\n' : '') + docstring;
        } else if (prevLine?.startsWith('#[') || prevLine === '') {
          continue;
        } else {
          break;
        }
      }
      
      functions.push({
        name: funcName,
        line: lineNum,
        endLine,
        parameters,
        returnType,
        isAsync,
        isExported: isPublic,
        isPublic,
        annotations,
        docstring,
        complexity,
        bodyLines: endLine - lineNum
      });
    }
    
    return functions;
  }
  
  private parseRustParams(paramsStr: string): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    if (!paramsStr.trim()) return params;
    
    // Split by comma, handling generics
    const paramList = this.splitRustParams(paramsStr);
    
    for (const param of paramList) {
      const trimmed = param.trim();
      if (!trimmed || trimmed === 'self' || trimmed === '&self' || trimmed === '&mut self') continue;
      
      // name: Type
      const paramMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
      if (paramMatch) {
        const type = paramMatch[2].trim();
        params.push({
          name: paramMatch[1],
          type,
          isOptional: type.startsWith('Option<')
        });
      }
    }
    
    return params;
  }
  
  private splitRustParams(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of paramsStr) {
      if (char === '<' || char === '(' || char === '[' || char === '{') depth++;
      if (char === '>' || char === ')' || char === ']' || char === '}') depth--;
      
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
    
    // pub struct Name { ... } or struct Name { ... }
    const structRegex = /(pub\s+)?struct\s+(\w+)(?:<[^>]+>)?\s*{([^}]*)}/g;
    
    let match;
    while ((match = structRegex.exec(code)) !== null) {
      const isPublic = !!match[1];
      const structName = match[2];
      const bodyContent = match[3];
      
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const endLine = lineNum + bodyContent.split('\n').length;
      
      // Look for derive macros
      const decorators: string[] = [];
      const traits: string[] = [];
      for (let i = lineNum - 2; i >= 0 && i > lineNum - 5; i--) {
        const prevLine = lines[i]?.trim();
        if (prevLine?.startsWith('#[derive(')) {
          decorators.push(prevLine);
          const deriveMatch = prevLine.match(/#\[derive\(([^)]+)\)\]/);
          if (deriveMatch) {
            traits.push(...deriveMatch[1].split(',').map(t => t.trim()));
          }
        } else if (prevLine?.startsWith('#[')) {
          decorators.push(prevLine);
        } else if (!prevLine?.startsWith('//')) {
          break;
        }
      }
      
      // Parse fields
      const members: MemberInfo[] = [];
      const fieldLines = bodyContent.split('\n');
      
      for (let i = 0; i < fieldLines.length; i++) {
        const fieldLine = fieldLines[i].trim();
        if (!fieldLine || fieldLine.startsWith('//')) continue;
        
        // pub field: Type, or field: Type,
        const fieldMatch = fieldLine.match(/^(pub\s+)?(\w+)\s*:\s*([^,]+)/);
        if (fieldMatch) {
          members.push({
            name: fieldMatch[2],
            type: 'field',
            dataType: fieldMatch[3].trim(),
            visibility: fieldMatch[1] ? 'public' : 'private',
            line: lineNum + i + 1
          });
        }
      }
      
      structs.push({
        name: structName,
        line: lineNum,
        endLine,
        members,
        traits,
        decorators,
        isExported: isPublic
      });
    }
    
    return structs;
  }
  
  private extractVariables(code: string): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const lines = code.split('\n');
    
    // Static and const declarations at module level
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // const NAME: Type = value; or static NAME: Type = value;
      const constMatch = line.match(/^(pub\s+)?(const|static)\s+(\w+)\s*:\s*(\w+)\s*=\s*(.+);$/);
      if (constMatch) {
        variables.push({
          name: constMatch[3],
          line: i + 1,
          type: constMatch[4],
          isConst: constMatch[2] === 'const',
          scope: 'module',
          value: constMatch[5],
          isExported: !!constMatch[1]
        });
      }
    }
    
    return variables;
  }
}

/**
 * Rust-specific semantic rules
 */
const RUST_RULES: LanguageRule[] = [
  {
    id: 'RS001',
    name: 'unsafe-block',
    description: 'Unsafe blocks require careful review',
    language: 'rust',
    severity: 'warning',
    category: 'safety',
    enabled: true,
    priority: 95,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\bunsafe\s*{/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: `${matches.length} unsafe block(s) found`,
          line: matches[0].line,
          suggestion: 'Document why unsafe is needed and verify memory safety'
        };
      }
      return null;
    }
  },
  {
    id: 'RS002',
    name: 'unwrap-usage',
    description: 'Avoid unwrap() in production code',
    language: 'rust',
    severity: 'warning',
    category: 'error-handling',
    enabled: true,
    priority: 85,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\.unwrap\(\)/);
      // Allow in tests
      if (ctx.filePath.includes('test') || ctx.filePath.includes('_test.rs')) {
        return null;
      }
      if (matches.length > 2) { // Allow a few
        return {
          hasIssue: true,
          message: `${matches.length} unwrap() calls - may panic at runtime`,
          line: matches[0].line,
          suggestion: 'Use match, if let, or ? operator for error handling'
        };
      }
      return null;
    }
  },
  {
    id: 'RS003',
    name: 'expect-message',
    description: 'expect() should have descriptive message',
    language: 'rust',
    severity: 'info',
    category: 'error-handling',
    enabled: true,
    priority: 50,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\.expect\(\s*""\s*\)/);
      if (matches.length > 0) {
        return {
          hasIssue: true,
          message: 'expect() called with empty message',
          line: matches[0].line,
          suggestion: 'Add descriptive error message to expect()'
        };
      }
      return null;
    }
  },
  {
    id: 'RS004',
    name: 'clone-performance',
    description: 'Excessive clone() calls may impact performance',
    language: 'rust',
    severity: 'info',
    category: 'performance',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      const matches = ctx.findPatternMatches(/\.clone\(\)/);
      if (matches.length > 5) {
        return {
          hasIssue: true,
          message: `${matches.length} clone() calls found`,
          line: matches[0].line,
          suggestion: 'Consider using references or Rc/Arc to reduce cloning'
        };
      }
      return null;
    }
  },
  {
    id: 'RS005',
    name: 'missing-derive',
    description: 'Struct might benefit from common derives',
    language: 'rust',
    severity: 'info',
    category: 'best-practices',
    enabled: true,
    priority: 30,
    check: (ctx: ParseContext) => {
      for (const cls of ctx.classes) {
        if (cls.isExported && (!cls.traits || cls.traits.length === 0)) {
          return {
            hasIssue: true,
            message: `Struct '${cls.name}' has no derive macros`,
            line: cls.line,
            suggestion: 'Consider adding #[derive(Debug, Clone)] or other common derives'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'RS006',
    name: 'panic-in-lib',
    description: 'Avoid panic! in library code',
    language: 'rust',
    severity: 'warning',
    category: 'error-handling',
    enabled: true,
    priority: 80,
    check: (ctx: ParseContext) => {
      // Skip if it's a binary crate
      if (ctx.filePath.includes('main.rs')) {
        return null;
      }
      
      const panics = ctx.findPatternMatches(/\bpanic!\s*\(/);
      const unreachable = ctx.findPatternMatches(/\bunreachable!\s*\(/);
      const unimplemented = ctx.findPatternMatches(/\bunimplemented!\s*\(/);
      const todo = ctx.findPatternMatches(/\btodo!\s*\(/);
      
      const total = panics.length + unreachable.length + unimplemented.length + todo.length;
      if (total > 0) {
        const first = panics[0] || unreachable[0] || unimplemented[0] || todo[0];
        return {
          hasIssue: true,
          message: `${total} panic/unreachable/unimplemented/todo! macro(s) in library code`,
          line: first.line,
          suggestion: 'Return Result<T, E> instead of panicking'
        };
      }
      return null;
    }
  },
  {
    id: 'RS007',
    name: 'string-concat-loop',
    description: 'String concatenation in loop is inefficient',
    language: 'rust',
    severity: 'warning',
    category: 'performance',
    enabled: true,
    priority: 70,
    check: (ctx: ParseContext) => {
      // Look for String + or += in loops
      const loopPatterns = ctx.findPatternMatches(/for\s+\w+\s+in[^{]+{[^}]*\+=/);
      if (loopPatterns.length > 0) {
        // Check if it's string concatenation
        const content = ctx.getLine(loopPatterns[0].line);
        if (content.includes('String') || content.includes('"')) {
          return {
            hasIssue: true,
            message: 'String concatenation in loop detected',
            line: loopPatterns[0].line,
            suggestion: 'Use String::with_capacity() or collect() for better performance'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'RS008',
    name: 'box-unnecessary',
    description: 'Box might be unnecessary for small types',
    language: 'rust',
    severity: 'info',
    category: 'performance',
    enabled: true,
    priority: 30,
    check: (ctx: ParseContext) => {
      const boxUsages = ctx.findPatternMatches(/Box::new\(\w+\)/);
      const boxSmall = ctx.findPatternMatches(/Box<(i32|i64|u32|u64|f32|f64|bool|char)>/);
      
      if (boxSmall.length > 0) {
        return {
          hasIssue: true,
          message: 'Boxing primitive types may be unnecessary',
          line: boxSmall[0].line,
          suggestion: 'Box is mainly useful for recursive types or trait objects'
        };
      }
      return null;
    }
  },
  {
    id: 'RS009',
    name: 'dead-code-allow',
    description: 'Excessive dead code allowances',
    language: 'rust',
    severity: 'info',
    category: 'code-quality',
    enabled: true,
    priority: 30,
    check: (ctx: ParseContext) => {
      const deadCodeAllows = ctx.findPatternMatches(/#\[allow\(dead_code\)\]/);
      if (deadCodeAllows.length > 3) {
        return {
          hasIssue: true,
          message: `${deadCodeAllows.length} dead_code allow attributes`,
          line: deadCodeAllows[0].line,
          suggestion: 'Remove unused code instead of suppressing warnings'
        };
      }
      return null;
    }
  },
  {
    id: 'RS010',
    name: 'mutex-lock-guard',
    description: 'Lock guard might be held across await',
    language: 'rust',
    severity: 'error',
    category: 'concurrency',
    enabled: true,
    priority: 95,
    check: (ctx: ParseContext) => {
      for (const func of ctx.functions) {
        if (func.isAsync) {
          const startLine = func.line;
          const endLine = func.endLine || startLine + 50;
          const body = ctx.getLines(startLine, endLine).join('\n');
          
          // Check for lock().await pattern
          if (body.includes('.lock()') && body.includes('.await')) {
            return {
              hasIssue: true,
              message: `Mutex lock held across await in '${func.name}'`,
              line: func.line,
              details: 'This can cause deadlocks with non-async Mutex',
              suggestion: 'Use tokio::sync::Mutex for async code or restructure'
            };
          }
        }
      }
      return null;
    }
  },
  {
    id: 'RS011',
    name: 'complex-generic',
    description: 'Generic bounds are too complex',
    language: 'rust',
    severity: 'info',
    category: 'maintainability',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      const whereClausesMatch = ctx.findPatternMatches(/where\s+[^{]+{/);
      for (const match of whereClausesMatch) {
        const clauseContent = match.match;
        const boundCount = (clauseContent.match(/:/g) || []).length;
        if (boundCount > 5) {
          return {
            hasIssue: true,
            message: 'Complex generic bounds in where clause',
            line: match.line,
            suggestion: 'Consider creating type aliases or trait aliases for clarity'
          };
        }
      }
      return null;
    }
  },
  {
    id: 'RS012',
    name: 'missing-error-type',
    description: 'Consider using custom error type',
    language: 'rust',
    severity: 'info',
    category: 'api-design',
    enabled: true,
    priority: 40,
    check: (ctx: ParseContext) => {
      // Check for many different error types in Returns
      const stringErrors = ctx.findPatternMatches(/Result<[^,]+,\s*String>/);
      const boxErrors = ctx.findPatternMatches(/Result<[^,]+,\s*Box<dyn\s+std::error::Error/);
      
      if (stringErrors.length > 3) {
        return {
          hasIssue: true,
          message: 'Multiple functions return Result<T, String>',
          line: stringErrors[0].line,
          suggestion: 'Define a custom error type for better error handling'
        };
      }
      
      if (boxErrors.length > 3) {
        return {
          hasIssue: true,
          message: 'Multiple functions use Box<dyn Error>',
          line: boxErrors[0].line,
          suggestion: 'Consider using thiserror or anyhow for error handling'
        };
      }
      
      return null;
    }
  }
];

export { RUST_RULES };
