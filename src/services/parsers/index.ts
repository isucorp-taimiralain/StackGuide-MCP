/**
 * Parser Registry
 * Centralized management of language-specific parsers
 * @version 3.2.0
 */

import type { CodeIssue } from '../../config/types.js';
import type { LanguageParser, SupportedLanguage, ParserFactory } from './types.js';
import { getLanguageFromPath } from './types.js';
import { PythonParser } from './pythonParser.js';
import { GoParser } from './goParser.js';
import { RustParser } from './rustParser.js';
import { logger } from '../../utils/logger.js';

/**
 * Registry for language parsers
 */
class ParserRegistry {
  private parsers: Map<SupportedLanguage, LanguageParser> = new Map();
  private factories: Map<SupportedLanguage, ParserFactory> = new Map();
  
  constructor() {
    // Register builtin parsers
    this.registerFactory('python', () => new PythonParser());
    this.registerFactory('go', () => new GoParser());
    this.registerFactory('rust', () => new RustParser());
  }
  
  /**
   * Register a parser factory for lazy instantiation
   */
  registerFactory(language: SupportedLanguage, factory: ParserFactory): void {
    this.factories.set(language, factory);
    logger.debug('Registered parser factory', { language });
  }
  
  /**
   * Get parser for a specific language (lazy instantiation)
   */
  getParser(language: SupportedLanguage): LanguageParser | null {
    // Check if already instantiated
    if (this.parsers.has(language)) {
      return this.parsers.get(language)!;
    }
    
    // Check for factory
    const factory = this.factories.get(language);
    if (factory) {
      const parser = factory();
      this.parsers.set(language, parser);
      logger.debug('Instantiated parser', { language });
      return parser;
    }
    
    return null;
  }
  
  /**
   * Get parser for a file path
   */
  getParserForFile(filePath: string): LanguageParser | null {
    const language = getLanguageFromPath(filePath);
    return this.getParser(language);
  }
  
  /**
   * Analyze code using appropriate language parser
   */
  analyze(filePath: string, code: string): CodeIssue[] {
    const parser = this.getParserForFile(filePath);
    
    if (!parser) {
      logger.debug('No parser available for file', { filePath });
      return [];
    }
    
    return parser.analyze(code, filePath);
  }
  
  /**
   * Check if a language is supported
   */
  isSupported(language: SupportedLanguage): boolean {
    return this.factories.has(language);
  }
  
  /**
   * Check if a file is supported
   */
  isFileSupported(filePath: string): boolean {
    const language = getLanguageFromPath(filePath);
    return this.isSupported(language);
  }
  
  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.factories.keys());
  }
  
  /**
   * Get total rule count across all parsers
   */
  getTotalRuleCount(): number {
    let total = 0;
    for (const [language] of this.factories) {
      const parser = this.getParser(language);
      if (parser) {
        total += parser.getRules().length;
      }
    }
    return total;
  }
  
  /**
   * Get rules by language
   */
  getRulesByLanguage(language: SupportedLanguage) {
    const parser = this.getParser(language);
    return parser?.getRules() || [];
  }
  
  /**
   * Clear all instantiated parsers (for memory management)
   */
  clearParsers(): void {
    this.parsers.clear();
    logger.debug('Cleared parser instances');
  }
}

// Export singleton instance
export const parserRegistry = new ParserRegistry();

// Re-export types
export * from './types.js';
export { PythonParser, PYTHON_RULES } from './pythonParser.js';
export { GoParser, GO_RULES } from './goParser.js';
export { RustParser, RUST_RULES } from './rustParser.js';
export { BaseLanguageParser } from './baseParser.js';
