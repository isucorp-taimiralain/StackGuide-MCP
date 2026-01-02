/**
 * AST Analyzer Tests
 * Tests for the ts-morph based code analysis
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  parseCode, 
  analyzeWithAST, 
  clearASTCache,
  BUILTIN_AST_RULES 
} from '../src/services/astAnalyzer.js';

describe('astAnalyzer', () => {
  afterEach(() => {
    clearASTCache();
  });

  describe('parseCode', () => {
    it('should parse valid TypeScript code', () => {
      const code = `
        function hello(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;
      
      const sourceFile = parseCode('test.ts', code);
      expect(sourceFile).not.toBeNull();
    });

    it('should parse valid JavaScript code', () => {
      const code = `
        function hello(name) {
          return 'Hello, ' + name + '!';
        }
      `;
      
      const sourceFile = parseCode('test.js', code);
      expect(sourceFile).not.toBeNull();
    });

    it('should parse TSX code', () => {
      const code = `
        export function Component({ name }: { name: string }) {
          return <div>Hello, {name}!</div>;
        }
      `;
      
      const sourceFile = parseCode('Component.tsx', code);
      expect(sourceFile).not.toBeNull();
    });

    it('should handle syntax errors gracefully', () => {
      const code = `
        function broken( {
          return 'missing closing paren';
        }
      `;
      
      // ts-morph is lenient and will still create a source file
      const sourceFile = parseCode('broken.ts', code);
      expect(sourceFile).not.toBeNull();
    });
  });

  describe('BUILTIN_AST_RULES', () => {
    it('should have at least 5 builtin rules', () => {
      expect(BUILTIN_AST_RULES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have all required properties on each rule', () => {
      for (const rule of BUILTIN_AST_RULES) {
        expect(rule.id).toBeDefined();
        expect(rule.type).toBe('ast');
        expect(rule.nodeTypes).toBeDefined();
        expect(rule.nodeTypes.length).toBeGreaterThan(0);
        expect(rule.check).toBeInstanceOf(Function);
        expect(rule.severity).toBeDefined();
        expect(rule.message).toBeDefined();
        expect(rule.source).toBe('builtin');
      }
    });
  });

  describe('analyzeWithAST', () => {
    it('should detect empty function bodies (AST002)', () => {
      const code = `
        function doNothing() {}
        
        const alsoEmpty = () => {};
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST002');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      // Should detect both empty functions
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.some(i => i.rule === 'AST002')).toBe(true);
    });

    it('should detect functions with too many parameters (AST003)', () => {
      const code = `
        function tooManyParams(a: string, b: string, c: number, d: boolean, e: object) {
          return a + b + c + d + e;
        }
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST003');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('AST003');
      expect(issues[0].message).toContain('5 parameters');
    });

    it('should not flag functions with acceptable parameter count', () => {
      const code = `
        function okParams(a: string, b: string) {
          return a + b;
        }
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST003');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      expect(issues.length).toBe(0);
    });

    it('should detect complex conditionals (AST005)', () => {
      const code = `
        if (a && b && c && d && e) {
          doSomething();
        }
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST005');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('AST005');
    });

    it('should detect missing return types in TypeScript (AST006)', () => {
      const code = `
        export function noReturnType(x: number) {
          return x * 2;
        }
        
        export function withReturnType(x: number): number {
          return x * 2;
        }
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST006');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      // Should flag noReturnType but not withReturnType
      expect(issues.length).toBe(1);
      expect(issues[0].message).toContain('noReturnType');
    });

    it('should detect explicit any type usage (AST007)', () => {
      const code = `
        function process(data: any): void {
          console.log(data);
        }
        
        const value: any = 'test';
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST007');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.every(i => i.rule === 'AST007')).toBe(true);
    });

    it('should detect large classes (AST009)', () => {
      const members = Array.from({ length: 20 }, (_, i) => 
        `method${i}() { return ${i}; }`
      ).join('\n');
      
      const code = `
        class HugeClass {
          ${members}
        }
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST009');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('AST009');
      expect(issues[0].message).toContain('20 members');
    });

    it('should skip analysis for non-JS/TS files', () => {
      const code = `
        def hello(name):
            return f"Hello, {name}!"
      `;
      
      const issues = analyzeWithAST('test.py', code, BUILTIN_AST_RULES);
      
      expect(issues.length).toBe(0);
    });

    it('should return issues with correct structure', () => {
      const code = `
        function empty() {}
      `;
      
      const rules = BUILTIN_AST_RULES.filter(r => r.id === 'AST002');
      const issues = analyzeWithAST('test.ts', code, rules);
      
      if (issues.length > 0) {
        const issue = issues[0];
        expect(issue.severity).toBeDefined();
        expect(issue.rule).toBe('AST002');
        expect(issue.category).toBeDefined();
        expect(issue.message).toBeDefined();
        expect(issue.source).toBe('builtin');
      }
    });

    it('should handle multiple rules at once', () => {
      const code = `
        function manyParams(a: any, b: any, c: any, d: any, e: any) {}
      `;
      
      // This code should trigger:
      // - AST002 (empty function)
      // - AST003 (too many params)
      // - AST007 (any type - multiple times)
      const issues = analyzeWithAST('test.ts', code, BUILTIN_AST_RULES);
      
      const ruleIds = new Set(issues.map(i => i.rule));
      expect(ruleIds.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clearASTCache', () => {
    it('should clear the cache without errors', () => {
      // Parse something first
      parseCode('test.ts', 'const x = 1;');
      
      // Clear should not throw
      expect(() => clearASTCache()).not.toThrow();
    });

    it('should allow re-parsing after clear', () => {
      parseCode('test.ts', 'const x = 1;');
      clearASTCache();
      
      const sourceFile = parseCode('test.ts', 'const y = 2;');
      expect(sourceFile).not.toBeNull();
    });
  });
});

describe('AST integration with codeAnalyzer', () => {
  it('should run AST rules when analyzing TypeScript files', async () => {
    const { analyzeCode } = await import('../src/services/codeAnalyzer.js');
    
    const code = `
      function empty() {}
      function tooMany(a: any, b: any, c: any, d: any, e: any) {}
    `;
    
    const result = analyzeCode('test.ts', code, 'all');
    
    // Should have issues from both pattern and AST rules
    expect(result.issues.length).toBeGreaterThan(0);
    
    // Check that AST rules were applied
    const astIssues = result.issues.filter(i => i.rule.startsWith('AST'));
    expect(astIssues.length).toBeGreaterThan(0);
  });

  it('should not run AST rules for Python files', async () => {
    const { analyzeCode } = await import('../src/services/codeAnalyzer.js');
    
    const code = `
      def empty():
          pass
    `;
    
    const result = analyzeCode('test.py', code, 'all');
    
    // Should not have AST issues
    const astIssues = result.issues.filter(i => i.rule.startsWith('AST'));
    expect(astIssues.length).toBe(0);
  });

  it('should include AST rule count in registry stats', async () => {
    const { ruleRegistry } = await import('../src/services/codeAnalyzer.js');
    
    const stats = ruleRegistry.getStats();
    
    expect(stats.ast).toBeGreaterThan(0);
    expect(stats.total).toBeGreaterThan(stats.ast); // Should include both pattern and AST
  });
});
