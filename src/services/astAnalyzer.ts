/**
 * AST Analyzer Service - Phase 2
 * Provides semantic code analysis using ts-morph
 */

import { Project, SourceFile, Node, SyntaxKind, ts } from 'ts-morph';
import { logger } from '../utils/logger.js';
import { ASTRule, ASTCheckContext, ASTCheckResult, CodeIssue, IssueSeverity } from '../config/types.js';

// =============================================================================
// AST PROJECT MANAGEMENT
// =============================================================================

/**
 * Cached ts-morph project for performance
 * We use in-memory file system to avoid disk I/O
 */
let cachedProject: Project | null = null;

function getProject(): Project {
  if (!cachedProject) {
    cachedProject = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: false, // Be lenient for analysis
        skipLibCheck: true,
        noEmit: true,
      },
    });
    logger.debug('Created new ts-morph project');
  }
  return cachedProject;
}

/**
 * Clear the cached project (useful for testing or memory management)
 */
export function clearASTCache(): void {
  if (cachedProject) {
    cachedProject.getSourceFiles().forEach(sf => cachedProject!.removeSourceFile(sf));
  }
  cachedProject = null;
  logger.debug('Cleared AST cache');
}

// =============================================================================
// AST ANALYSIS
// =============================================================================

/**
 * Parse source code into a ts-morph SourceFile
 */
export function parseCode(filePath: string, content: string): SourceFile | null {
  try {
    const project = getProject();
    
    // Check if file already exists and remove it
    const existing = project.getSourceFile(filePath);
    if (existing) {
      project.removeSourceFile(existing);
    }
    
    // Create the source file
    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
    
    return sourceFile;
  } catch (error) {
    logger.warn('Failed to parse code for AST analysis', { filePath, error: String(error) });
    return null;
  }
}

/**
 * Map string node type names to ts-morph SyntaxKind
 */
const NODE_TYPE_MAP: Record<string, SyntaxKind> = {
  // Declarations
  'FunctionDeclaration': SyntaxKind.FunctionDeclaration,
  'ClassDeclaration': SyntaxKind.ClassDeclaration,
  'VariableDeclaration': SyntaxKind.VariableDeclaration,
  'InterfaceDeclaration': SyntaxKind.InterfaceDeclaration,
  'TypeAliasDeclaration': SyntaxKind.TypeAliasDeclaration,
  'EnumDeclaration': SyntaxKind.EnumDeclaration,
  'MethodDeclaration': SyntaxKind.MethodDeclaration,
  'PropertyDeclaration': SyntaxKind.PropertyDeclaration,
  'Constructor': SyntaxKind.Constructor,
  'GetAccessor': SyntaxKind.GetAccessor,
  'SetAccessor': SyntaxKind.SetAccessor,
  
  // Expressions
  'CallExpression': SyntaxKind.CallExpression,
  'NewExpression': SyntaxKind.NewExpression,
  'ArrowFunction': SyntaxKind.ArrowFunction,
  'FunctionExpression': SyntaxKind.FunctionExpression,
  'BinaryExpression': SyntaxKind.BinaryExpression,
  'ConditionalExpression': SyntaxKind.ConditionalExpression,
  'PropertyAccessExpression': SyntaxKind.PropertyAccessExpression,
  'ElementAccessExpression': SyntaxKind.ElementAccessExpression,
  'AwaitExpression': SyntaxKind.AwaitExpression,
  
  // Statements
  'IfStatement': SyntaxKind.IfStatement,
  'ForStatement': SyntaxKind.ForStatement,
  'ForInStatement': SyntaxKind.ForInStatement,
  'ForOfStatement': SyntaxKind.ForOfStatement,
  'WhileStatement': SyntaxKind.WhileStatement,
  'DoStatement': SyntaxKind.DoStatement,
  'SwitchStatement': SyntaxKind.SwitchStatement,
  'TryStatement': SyntaxKind.TryStatement,
  'CatchClause': SyntaxKind.CatchClause,
  'ThrowStatement': SyntaxKind.ThrowStatement,
  'ReturnStatement': SyntaxKind.ReturnStatement,
  
  // Imports/Exports
  'ImportDeclaration': SyntaxKind.ImportDeclaration,
  'ExportDeclaration': SyntaxKind.ExportDeclaration,
  'ExportAssignment': SyntaxKind.ExportAssignment,
  
  // JSX
  'JsxElement': SyntaxKind.JsxElement,
  'JsxSelfClosingElement': SyntaxKind.JsxSelfClosingElement,
  'JsxFragment': SyntaxKind.JsxFragment,
  
  // Other
  'Parameter': SyntaxKind.Parameter,
  'TypeReference': SyntaxKind.TypeReference,
  'AsExpression': SyntaxKind.AsExpression,
};

/**
 * Create an ASTCheckContext for a node
 */
function createCheckContext(node: Node, sourceFile: SourceFile, filePath: string): ASTCheckContext {
  return {
    node,
    sourceFile,
    filePath,
    sourceText: sourceFile.getFullText(),
    getNodeText: () => node.getText(),
    getStartLine: () => node.getStartLineNumber(),
    getTypeText: () => {
      try {
        // Try to get type information if available
        if ('getType' in node && typeof (node as any).getType === 'function') {
          return (node as any).getType().getText();
        }
        return 'unknown';
      } catch {
        return 'unknown';
      }
    },
  };
}

/**
 * Run AST rules against a source file
 */
export function analyzeWithAST(
  filePath: string,
  content: string,
  rules: ASTRule[]
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  
  // Only analyze TS/JS files
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'].includes(ext || '')) {
    return issues;
  }
  
  const sourceFile = parseCode(filePath, content);
  if (!sourceFile) {
    return issues;
  }
  
  logger.debug('Running AST analysis', { filePath, ruleCount: rules.length });
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    // Get the SyntaxKind values for this rule
    const syntaxKinds = rule.nodeTypes
      .map(nt => NODE_TYPE_MAP[nt])
      .filter((sk): sk is SyntaxKind => sk !== undefined);
    
    if (syntaxKinds.length === 0) {
      logger.warn('No valid node types for AST rule', { ruleId: rule.id, nodeTypes: rule.nodeTypes });
      continue;
    }
    
    // Find all matching nodes
    for (const syntaxKind of syntaxKinds) {
      const nodes = sourceFile.getDescendantsOfKind(syntaxKind);
      
      for (const node of nodes) {
        try {
          const context = createCheckContext(node, sourceFile, filePath);
          const result = rule.check(context);
          
          if (result && result.hasIssue) {
            const quickFix = rule.quickFix ? rule.quickFix(context) : undefined;
            
            issues.push({
              severity: rule.severity,
              rule: rule.id,
              category: rule.category,
              message: result.message || rule.message,
              line: result.line || context.getStartLine(),
              code: result.code || context.getNodeText().substring(0, 100),
              suggestion: rule.suggestion,
              quickFix,
              source: rule.source,
            });
          }
        } catch (error) {
          logger.warn('Error running AST rule check', { 
            ruleId: rule.id, 
            filePath, 
            error: String(error) 
          });
        }
      }
    }
  }
  
  logger.debug('AST analysis complete', { filePath, issuesFound: issues.length });
  
  return issues;
}

// =============================================================================
// BUILTIN AST RULES
// =============================================================================

export const BUILTIN_AST_RULES: ASTRule[] = [
  // -------------------------------------------------------------------------
  // UNUSED EXPORTS
  // -------------------------------------------------------------------------
  {
    id: 'AST001',
    type: 'ast',
    category: 'coding-standards',
    nodeTypes: ['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'],
    severity: 'warning',
    message: 'Exported item may be unused within this file',
    suggestion: 'Verify this export is used by other modules or remove it',
    enabled: true,
    priority: 50,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as Node;
      
      // Check if the node has export modifier
      if (!('getModifiers' in node)) return null;
      
      const modifiers = (node as any).getModifiers?.() || [];
      const isExported = modifiers.some((m: Node) => 
        m.getKind() === SyntaxKind.ExportKeyword
      );
      
      if (!isExported) return null;
      
      // Get the name
      let name = '';
      if ('getName' in node && typeof (node as any).getName === 'function') {
        name = (node as any).getName() || '';
      }
      
      if (!name) return null;
      
      // Check if this name is used elsewhere in the file (simple heuristic)
      const sourceText = ctx.sourceText;
      const usagePattern = new RegExp(`\\b${name}\\b`, 'g');
      const matches = sourceText.match(usagePattern);
      
      // If only 1-2 occurrences, it's likely just the declaration and export
      // This is a heuristic - a proper check would trace references
      if (matches && matches.length <= 2) {
        return {
          hasIssue: true,
          message: `Export '${name}' appears to have no internal usage`,
          code: name,
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // EMPTY FUNCTION
  // -------------------------------------------------------------------------
  {
    id: 'AST002',
    type: 'ast',
    category: 'coding-standards',
    nodeTypes: ['FunctionDeclaration', 'MethodDeclaration', 'ArrowFunction'],
    severity: 'info',
    message: 'Empty function body detected',
    suggestion: 'Add implementation or a comment explaining why it is empty',
    enabled: true,
    priority: 25,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as Node;
      
      // Get function body
      if (!('getBody' in node)) return null;
      const body = (node as any).getBody?.();
      
      if (!body) return null;
      
      // Check if body is empty (no statements, or only whitespace/comments)
      const bodyText = body.getText?.() || '';
      const cleanBody = bodyText.replace(/[{}\s]/g, '').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      
      if (cleanBody.length === 0) {
        let name = 'anonymous';
        if ('getName' in node && typeof (node as any).getName === 'function') {
          name = (node as any).getName() || 'anonymous';
        }
        
        return {
          hasIssue: true,
          message: `Function '${name}' has an empty body`,
          code: ctx.getNodeText().substring(0, 50),
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // TOO MANY PARAMETERS
  // -------------------------------------------------------------------------
  {
    id: 'AST003',
    type: 'ast',
    category: 'architecture',
    nodeTypes: ['FunctionDeclaration', 'MethodDeclaration', 'ArrowFunction', 'Constructor'],
    severity: 'warning',
    message: 'Function has too many parameters',
    suggestion: 'Consider using an options object or refactoring into smaller functions',
    enabled: true,
    priority: 50,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as Node;
      
      if (!('getParameters' in node)) return null;
      const params = (node as any).getParameters?.() || [];
      
      const MAX_PARAMS = 4;
      
      if (params.length > MAX_PARAMS) {
        let name = 'function';
        if ('getName' in node && typeof (node as any).getName === 'function') {
          name = (node as any).getName() || 'function';
        }
        
        return {
          hasIssue: true,
          message: `'${name}' has ${params.length} parameters (max recommended: ${MAX_PARAMS})`,
          code: `${params.length} parameters`,
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // NESTED CALLBACKS (Callback Hell)
  // -------------------------------------------------------------------------
  {
    id: 'AST004',
    type: 'ast',
    category: 'coding-standards',
    nodeTypes: ['CallExpression'],
    severity: 'warning',
    message: 'Deeply nested callbacks detected (callback hell)',
    suggestion: 'Refactor using async/await or Promise chaining',
    enabled: true,
    priority: 75,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as Node;
      
      // Count callback nesting depth
      let depth = 0;
      let current: Node | undefined = node;
      
      while (current) {
        if (current.getKind() === SyntaxKind.CallExpression) {
          // Check if this call has a function argument
          const args = (current as any).getArguments?.() || [];
          const hasFunctionArg = args.some((arg: Node) => 
            arg.getKind() === SyntaxKind.ArrowFunction ||
            arg.getKind() === SyntaxKind.FunctionExpression
          );
          
          if (hasFunctionArg) {
            depth++;
          }
        }
        current = current.getParent();
      }
      
      const MAX_CALLBACK_DEPTH = 3;
      
      if (depth > MAX_CALLBACK_DEPTH) {
        return {
          hasIssue: true,
          message: `Callback nesting depth: ${depth} (max: ${MAX_CALLBACK_DEPTH})`,
          code: ctx.getNodeText().substring(0, 50),
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // COMPLEX CONDITIONAL
  // -------------------------------------------------------------------------
  {
    id: 'AST005',
    type: 'ast',
    category: 'coding-standards',
    nodeTypes: ['IfStatement', 'ConditionalExpression'],
    severity: 'info',
    message: 'Complex conditional expression',
    suggestion: 'Consider extracting conditions into named variables for clarity',
    enabled: true,
    priority: 25,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as Node;
      const text = ctx.getNodeText();
      
      // Count logical operators
      const andCount = (text.match(/&&/g) || []).length;
      const orCount = (text.match(/\|\|/g) || []).length;
      const totalOps = andCount + orCount;
      
      const MAX_LOGICAL_OPS = 3;
      
      if (totalOps > MAX_LOGICAL_OPS) {
        return {
          hasIssue: true,
          message: `Conditional has ${totalOps} logical operators (max: ${MAX_LOGICAL_OPS})`,
          code: text.substring(0, 80),
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // MISSING RETURN TYPE
  // -------------------------------------------------------------------------
  {
    id: 'AST006',
    type: 'ast',
    category: 'best-practices',
    nodeTypes: ['FunctionDeclaration', 'MethodDeclaration'],
    severity: 'suggestion',
    message: 'Function is missing explicit return type',
    suggestion: 'Add return type annotation for better type safety',
    languages: ['typescript', 'tsx'],
    enabled: true,
    priority: 25,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      // Only check TypeScript files
      if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.tsx')) {
        return null;
      }
      
      const node = ctx.node as Node;
      
      if (!('getReturnTypeNode' in node)) return null;
      const returnType = (node as any).getReturnTypeNode?.();
      
      // Skip if return type is present
      if (returnType) return null;
      
      // Skip constructors
      if (node.getKind() === SyntaxKind.Constructor) return null;
      
      let name = 'function';
      if ('getName' in node && typeof (node as any).getName === 'function') {
        name = (node as any).getName() || 'function';
      }
      
      // Skip private/protected methods and simple getters
      const text = ctx.getNodeText();
      if (text.startsWith('private ') || text.startsWith('protected ')) {
        return null;
      }
      
      return {
        hasIssue: true,
        message: `Function '${name}' is missing explicit return type`,
        code: name,
      };
    },
  },
  
  // -------------------------------------------------------------------------
  // ANY TYPE USAGE
  // -------------------------------------------------------------------------
  {
    id: 'AST007',
    type: 'ast',
    category: 'best-practices',
    nodeTypes: ['Parameter', 'VariableDeclaration', 'PropertyDeclaration'],
    severity: 'warning',
    message: 'Explicit "any" type usage detected',
    suggestion: 'Use a more specific type or "unknown" for truly unknown types',
    languages: ['typescript', 'tsx'],
    enabled: true,
    priority: 75,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      // Only check TypeScript files
      if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.tsx')) {
        return null;
      }
      
      const node = ctx.node as Node;
      
      // Get the type node
      let typeNode: Node | undefined;
      if ('getTypeNode' in node) {
        typeNode = (node as any).getTypeNode?.();
      }
      
      if (!typeNode) return null;
      
      const typeText = typeNode.getText();
      
      if (typeText === 'any') {
        return {
          hasIssue: true,
          message: 'Explicit "any" type detected',
          code: ctx.getNodeText().substring(0, 50),
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // REACT: MISSING KEY IN LIST
  // -------------------------------------------------------------------------
  {
    id: 'AST008',
    type: 'ast',
    category: 'react',
    nodeTypes: ['CallExpression'],
    severity: 'error',
    message: 'Missing "key" prop in list rendering',
    suggestion: 'Add a unique "key" prop to each element in the array',
    languages: ['javascript', 'typescript', 'jsx', 'tsx'],
    enabled: true,
    priority: 100,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as any;
      
      // Check if this is a .map() call
      const expression = node.getExpression?.();
      if (!expression) return null;
      
      const expressionText = expression.getText?.() || '';
      if (!expressionText.endsWith('.map')) return null;
      
      // Get the callback argument
      const args = node.getArguments?.() || [];
      if (args.length === 0) return null;
      
      const callback = args[0];
      const callbackText = callback.getText?.() || '';
      
      // Look for JSX element without key prop
      const hasJsxReturn = callbackText.includes('<') && callbackText.includes('>');
      const hasKeyProp = callbackText.includes('key=') || callbackText.includes('key:');
      
      if (hasJsxReturn && !hasKeyProp) {
        return {
          hasIssue: true,
          message: 'Array.map() rendering JSX without "key" prop',
          code: expressionText + '(...)',
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // LONG CLASS
  // -------------------------------------------------------------------------
  {
    id: 'AST009',
    type: 'ast',
    category: 'architecture',
    nodeTypes: ['ClassDeclaration'],
    severity: 'warning',
    message: 'Class has too many members',
    suggestion: 'Consider splitting into smaller, focused classes (SRP)',
    enabled: true,
    priority: 50,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const node = ctx.node as any;
      
      const members = node.getMembers?.() || [];
      const MAX_MEMBERS = 15;
      
      if (members.length > MAX_MEMBERS) {
        const name = node.getName?.() || 'Class';
        
        return {
          hasIssue: true,
          message: `Class '${name}' has ${members.length} members (max: ${MAX_MEMBERS})`,
          code: name,
        };
      }
      
      return null;
    },
  },
  
  // -------------------------------------------------------------------------
  // MAGIC NUMBER
  // -------------------------------------------------------------------------
  {
    id: 'AST010',
    type: 'ast',
    category: 'coding-standards',
    nodeTypes: ['BinaryExpression', 'VariableDeclaration'],
    severity: 'info',
    message: 'Magic number detected',
    suggestion: 'Extract to a named constant for clarity',
    enabled: true,
    priority: 25,
    source: 'builtin',
    check: (ctx: ASTCheckContext): ASTCheckResult | null => {
      const text = ctx.getNodeText();
      
      // Look for numeric literals > 1 (skip 0, 1, -1 as common cases)
      const magicNumbers = text.match(/(?<![a-zA-Z_])\b([2-9]|[1-9]\d{2,})\b(?![a-zA-Z_])/g);
      
      if (magicNumbers && magicNumbers.length > 0) {
        // Filter out common acceptable numbers
        const acceptable = ['100', '1000', '60', '24', '365', '1024', '2048', '4096'];
        const realMagic = magicNumbers.filter(n => !acceptable.includes(n) && parseInt(n) > 10);
        
        if (realMagic.length > 0) {
          return {
            hasIssue: true,
            message: `Magic number(s) detected: ${realMagic.slice(0, 3).join(', ')}`,
            code: text.substring(0, 50),
          };
        }
      }
      
      return null;
    },
  },
];

// =============================================================================
// EXPORTS
// =============================================================================

export { SyntaxKind, Node, SourceFile };
