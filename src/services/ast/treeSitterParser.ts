/**
 * Tree-Sitter Core Parser
 * Multi-language AST parsing using web-tree-sitter (WASM)
 * Architecture-independent — no native bindings required.
 * @version 4.0.0
 */

import { Parser, Language, Node as TreeSitterNode, Query } from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { logger } from '../../utils/logger.js';
import type {
  ASTNode,
  ParsedAST,
  ASTError,
  SupportedASTLanguage,
  LanguageGrammar,
  TreeSitterMetrics
} from './types.js';

const esmRequire = createRequire(import.meta.url);
const WASM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'wasm');

// ============================================================================
// WASM Initialization
// ============================================================================

let wasmInitialized = false;

async function ensureWasmInit(): Promise<void> {
  if (wasmInitialized) return;

  try {
    const wasmPath = esmRequire.resolve('web-tree-sitter/web-tree-sitter.wasm');
    await Parser.init({
      locateFile() {
        return wasmPath;
      }
    });
    wasmInitialized = true;
    logger.debug('Initialized web-tree-sitter WASM runtime');
  } catch (error) {
    logger.error('Failed to initialize web-tree-sitter', { error: String(error) });
    throw error;
  }
}

// ============================================================================
// Language Grammars
// ============================================================================

const LANGUAGE_EXTENSIONS: Record<SupportedASTLanguage, string[]> = {
  typescript: ['.ts', '.mts', '.cts'],
  tsx: ['.tsx'],
  javascript: ['.js', '.mjs', '.cjs', '.jsx'],
  python: ['.py', '.pyi', '.pyw'],
  go: ['.go'],
  rust: ['.rs'],
};

const WASM_GRAMMAR_FILES: Record<SupportedASTLanguage, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-typescript.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
};

let grammars: Map<SupportedASTLanguage, LanguageGrammar> | null = null;

async function loadGrammars(): Promise<Map<SupportedASTLanguage, LanguageGrammar>> {
  if (grammars) return grammars;

  await ensureWasmInit();
  grammars = new Map();

  for (const [lang, wasmFile] of Object.entries(WASM_GRAMMAR_FILES) as Array<[SupportedASTLanguage, string]>) {
    try {
      const wasmPath = join(WASM_DIR, wasmFile);
      const language = await Language.load(wasmPath);
      grammars.set(lang, {
        language: lang,
        extensions: LANGUAGE_EXTENSIONS[lang],
        parser: language
      });
      logger.debug(`Loaded ${lang} grammar`);
    } catch (e) {
      logger.warn(`Failed to load ${lang} grammar`, { error: String(e) });
    }
  }

  logger.info(`Loaded ${grammars.size} tree-sitter grammars`);
  return grammars;
}

// ============================================================================
// Parser Instance Pool
// ============================================================================

const parserPool: Map<SupportedASTLanguage, Parser> = new Map();

async function getParser(language: SupportedASTLanguage): Promise<Parser | null> {
  if (parserPool.has(language)) {
    return parserPool.get(language)!;
  }

  const loadedGrammars = await loadGrammars();
  const grammar = loadedGrammars.get(language);

  if (!grammar) {
    logger.warn(`No grammar available for language: ${language}`);
    return null;
  }

  const parser = new Parser();
  parser.setLanguage(grammar.parser as Language);
  parserPool.set(language, parser);

  return parser;
}

// ============================================================================
// Core Parsing Functions
// ============================================================================

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): SupportedASTLanguage | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'));

  const extensionMap: Record<string, SupportedASTLanguage> = {
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.pyi': 'python',
    '.pyw': 'python',
    '.go': 'go',
    '.rs': 'rust'
  };

  return extensionMap[ext] || null;
}

/**
 * Parse source code into AST using web-tree-sitter
 */
export async function parseCode(
  code: string,
  filePath: string,
  language?: SupportedASTLanguage
): Promise<ParsedAST | null> {
  const startTime = Date.now();
  const lang = language || detectLanguage(filePath);

  if (!lang) {
    logger.debug(`Unsupported file type for AST parsing: ${filePath}`);
    return null;
  }

  const parser = await getParser(lang);
  if (!parser) {
    return null;
  }

  try {
    const tree = parser.parse(code);
    if (!tree) return null;

    const errors: ASTError[] = [];

    collectErrors(tree.rootNode, errors);

    const result: ParsedAST = {
      language: lang,
      filePath,
      rootNode: convertNode(tree.rootNode),
      parseTime: Date.now() - startTime,
      errors
    };

    logger.debug(`Parsed ${filePath} in ${result.parseTime}ms`, {
      language: lang,
      errors: errors.length
    });

    return result;
  } catch (error) {
    logger.error(`Failed to parse ${filePath}`, { error: String(error) });
    return null;
  }
}

/**
 * Convert web-tree-sitter node to our AST node type
 */
function convertNode(node: TreeSitterNode): ASTNode {
  return {
    type: node.type,
    text: node.text,
    startPosition: { row: node.startPosition.row, column: node.startPosition.column },
    endPosition: { row: node.endPosition.row, column: node.endPosition.column },
    children: node.children.map(convertNode),
    namedChildren: node.namedChildren.map(convertNode),
    childCount: node.childCount,
    namedChildCount: node.namedChildCount,
    isNamed: node.isNamed
  };
}

/**
 * Collect syntax errors from AST
 */
function collectErrors(node: TreeSitterNode, errors: ASTError[]): void {
  if (node.type === 'ERROR' || node.isMissing) {
    errors.push({
      message: node.isMissing
        ? `Missing ${node.type}`
        : `Syntax error: unexpected ${node.text.substring(0, 20)}`,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      type: 'syntax'
    });
  }

  for (const child of node.children) {
    collectErrors(child, errors);
  }
}

// ============================================================================
// AST Query Functions
// ============================================================================

/**
 * Query AST using tree-sitter query syntax
 */
export async function queryAST(
  ast: ParsedAST,
  queryPattern: string
): Promise<Array<{ captures: Map<string, ASTNode[]> }>> {
  const parser = await getParser(ast.language);
  if (!parser) return [];

  try {
    const language = parser.language;
    if (!language) return [];

    const query = new Query(language, queryPattern);

    const tree = parser.parse(ast.rootNode.text);
    if (!tree) return [];

    const matches = query.matches(tree.rootNode);

    return matches.map(match => {
      const captures = new Map<string, ASTNode[]>();

      for (const capture of match.captures) {
        const name = capture.name;
        if (!captures.has(name)) {
          captures.set(name, []);
        }
        captures.get(name)!.push(convertNode(capture.node));
      }

      return { captures };
    });
  } catch (error) {
    logger.warn('AST query failed', { pattern: queryPattern, error: String(error) });
    return [];
  }
}

// ============================================================================
// AST Traversal
// ============================================================================

/**
 * Walk the AST and call visitor functions
 */
export function walkAST(
  node: ASTNode,
  visitor: {
    enter?: (node: ASTNode, parent?: ASTNode) => boolean | void;
    leave?: (node: ASTNode, parent?: ASTNode) => void;
  },
  parent?: ASTNode
): void {
  if (visitor.enter) {
    const result = visitor.enter(node, parent);
    if (result === false) {
      if (visitor.leave) visitor.leave(node, parent);
      return;
    }
  }

  for (const child of node.namedChildren) {
    walkAST(child, visitor, node);
  }

  if (visitor.leave) {
    visitor.leave(node, parent);
  }
}

/**
 * Find all nodes matching a predicate
 */
export function findNodes(
  ast: ParsedAST,
  predicate: (node: ASTNode) => boolean
): ASTNode[] {
  const results: ASTNode[] = [];

  walkAST(ast.rootNode, {
    enter: (node) => {
      if (predicate(node)) {
        results.push(node);
      }
    }
  });

  return results;
}

/**
 * Find nodes by type
 */
export function findNodesByType(ast: ParsedAST, ...types: string[]): ASTNode[] {
  const typeSet = new Set(types);
  return findNodes(ast, node => typeSet.has(node.type));
}

// ============================================================================
// Metrics Extraction
// ============================================================================

/**
 * Extract code metrics from AST
 */
export function extractMetrics(ast: ParsedAST): TreeSitterMetrics {
  let functions = 0;
  let classes = 0;
  let imports = 0;
  let maxNestingDepth = 0;
  let complexity = 1;

  const functionTypes = new Set([
    'function_declaration', 'function_definition', 'method_declaration',
    'method_definition', 'arrow_function', 'function_expression',
    'func_literal', 'function_item'
  ]);

  const classTypes = new Set([
    'class_declaration', 'class_definition', 'class_specifier',
    'struct_item', 'impl_item'
  ]);

  const importTypes = new Set([
    'import_statement', 'import_declaration', 'import_from_statement',
    'import_spec', 'use_declaration'
  ]);

  const branchTypes = new Set([
    'if_statement', 'if_expression', 'conditional_expression',
    'while_statement', 'for_statement', 'for_in_statement',
    'for_of_statement', 'switch_statement', 'match_expression',
    'case_clause', 'match_arm', 'catch_clause', 'except_clause',
    '&&', '||', '??'
  ]);

  let currentDepth = 0;

  walkAST(ast.rootNode, {
    enter: (node) => {
      if (functionTypes.has(node.type)) {
        functions++;
        currentDepth++;
        maxNestingDepth = Math.max(maxNestingDepth, currentDepth);
      }

      if (classTypes.has(node.type)) {
        classes++;
      }

      if (importTypes.has(node.type)) {
        imports++;
      }

      if (branchTypes.has(node.type)) {
        complexity++;
        currentDepth++;
        maxNestingDepth = Math.max(maxNestingDepth, currentDepth);
      }
    },
    leave: (node) => {
      if (functionTypes.has(node.type) || branchTypes.has(node.type)) {
        currentDepth--;
      }
    }
  });

  const loc = ast.rootNode.text.split('\n').length;

  return {
    loc,
    functions,
    classes,
    maxNestingDepth,
    complexity,
    imports
  };
}

// ============================================================================
// Cache Management
// ============================================================================

const astCache = new Map<string, ParsedAST>();
const MAX_CACHE_SIZE = 100;

export function parseCodeCached(
  code: string,
  filePath: string,
  language?: SupportedASTLanguage
): Promise<ParsedAST | null> {
  const cacheKey = `${filePath}:${code.length}:${code.substring(0, 100)}`;

  if (astCache.has(cacheKey)) {
    return Promise.resolve(astCache.get(cacheKey)!);
  }

  return parseCode(code, filePath, language).then(ast => {
    if (ast) {
      if (astCache.size >= MAX_CACHE_SIZE) {
        const firstKey = astCache.keys().next().value;
        if (firstKey) astCache.delete(firstKey);
      }
      astCache.set(cacheKey, ast);
    }
    return ast;
  });
}

export function clearASTParserCache(): void {
  astCache.clear();
  logger.debug('Cleared AST parser cache');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the text of a specific line from code
 */
export function getLineText(code: string, lineNumber: number): string {
  const lines = code.split('\n');
  return lines[lineNumber - 1] || '';
}

/**
 * Check if language is supported
 */
export async function isLanguageSupported(language: string): Promise<boolean> {
  const loadedGrammars = await loadGrammars();
  return loadedGrammars.has(language as SupportedASTLanguage);
}

/**
 * Get list of supported languages
 */
export async function getSupportedLanguages(): Promise<SupportedASTLanguage[]> {
  const loadedGrammars = await loadGrammars();
  return Array.from(loadedGrammars.keys());
}
