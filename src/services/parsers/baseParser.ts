/**
 * Base Language Parser
 * Abstract base class for language-specific parsers
 * @version 3.2.0
 */

import type { CodeIssue } from '../../config/types.js';
import type {
  LanguageParser,
  LanguageRule,
  ParseResult,
  ParseContext,
  ParsedSymbol,
  ImportInfo,
  FunctionInfo,
  ClassInfo,
  VariableInfo,
  CommentInfo,
  PatternMatch,
  SupportedLanguage
} from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Abstract base class for language parsers
 */
export abstract class BaseLanguageParser implements LanguageParser {
  abstract readonly language: SupportedLanguage;
  abstract readonly extensions: string[];
  
  protected rules: LanguageRule[] = [];
  
  /**
   * Parse source code into structured data
   */
  abstract parse(code: string, filePath: string): ParseResult;
  
  /**
   * Get language-specific rules
   */
  getRules(): LanguageRule[] {
    return this.rules.filter(r => r.enabled);
  }
  
  /**
   * Check if parser can handle this file
   */
  canHandle(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return this.extensions.includes(ext);
  }
  
  /**
   * Analyze code using language-specific rules
   */
  analyze(code: string, filePath: string): CodeIssue[] {
    const startTime = Date.now();
    const issues: CodeIssue[] = [];
    
    try {
      const parseResult = this.parse(code, filePath);
      const context = this.createContext(code, filePath, parseResult);
      
      for (const rule of this.getRules()) {
        try {
          const result = rule.check(context);
          if (result?.hasIssue) {
            issues.push({
              severity: rule.severity,
              rule: rule.id,
              category: rule.category,
              message: result.message,
              line: result.line,
              column: result.column,
              source: 'builtin',
              suggestion: result.suggestion,
              details: result.details
            });
          }
        } catch (error) {
          logger.warn(`Rule ${rule.id} failed`, { error, filePath });
        }
      }
      
      logger.debug(`${this.language} analysis complete`, {
        filePath,
        issues: issues.length,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      logger.error(`${this.language} parsing failed`, { error, filePath });
    }
    
    return issues;
  }
  
  /**
   * Create parse context for rules
   */
  protected createContext(code: string, filePath: string, parseResult: ParseResult): ParseContext {
    const lines = code.split('\n');
    
    return {
      code,
      filePath,
      language: this.language,
      symbols: parseResult.symbols,
      imports: parseResult.imports,
      functions: parseResult.functions,
      classes: parseResult.classes,
      variables: parseResult.variables,
      comments: parseResult.comments,
      
      getLine: (lineNumber: number) => lines[lineNumber - 1] || '',
      
      getLines: (start: number, end: number) => lines.slice(start - 1, end),
      
      containsPattern: (pattern: RegExp) => pattern.test(code),
      
      findPatternMatches: (pattern: RegExp) => {
        const matches: PatternMatch[] = [];
        const globalPattern = new RegExp(pattern.source, 'gm');
        let match;
        
        while ((match = globalPattern.exec(code)) !== null) {
          const beforeMatch = code.substring(0, match.index);
          const lineNumber = beforeMatch.split('\n').length;
          const lastNewline = beforeMatch.lastIndexOf('\n');
          const column = match.index - lastNewline;
          
          matches.push({
            match: match[0],
            line: lineNumber,
            column,
            groups: match.groups
          });
        }
        
        return matches;
      }
    };
  }
  
  /**
   * Helper: Extract comments from code
   */
  protected extractComments(code: string, lineCommentPrefix: string, blockStart?: string, blockEnd?: string): CommentInfo[] {
    const comments: CommentInfo[] = [];
    const lines = code.split('\n');
    
    // Line comments
    const lineCommentRegex = new RegExp(`${escapeRegex(lineCommentPrefix)}(.*)$`, 'gm');
    let match;
    
    while ((match = lineCommentRegex.exec(code)) !== null) {
      const beforeMatch = code.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const text = match[1].trim();
      
      comments.push({
        text,
        line: lineNumber,
        type: 'line',
        isTodo: /\bTODO\b/i.test(text),
        isFixme: /\bFIXME\b/i.test(text)
      });
    }
    
    // Block comments
    if (blockStart && blockEnd) {
      const blockRegex = new RegExp(
        `${escapeRegex(blockStart)}([\\s\\S]*?)${escapeRegex(blockEnd)}`,
        'gm'
      );
      
      while ((match = blockRegex.exec(code)) !== null) {
        const beforeMatch = code.substring(0, match.index);
        const startLine = beforeMatch.split('\n').length;
        const endLine = startLine + match[0].split('\n').length - 1;
        const text = match[1].trim();
        
        comments.push({
          text,
          line: startLine,
          endLine,
          type: text.startsWith('*') ? 'doc' : 'block',
          isTodo: /\bTODO\b/i.test(text),
          isFixme: /\bFIXME\b/i.test(text)
        });
      }
    }
    
    return comments;
  }
  
  /**
   * Helper: Count complexity (basic cyclomatic)
   */
  protected calculateComplexity(code: string): number {
    // Count decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b\?\s*:/g, // ternary
      /\&\&/g,
      /\|\|/g
    ];
    
    let complexity = 1; // Base complexity
    
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
