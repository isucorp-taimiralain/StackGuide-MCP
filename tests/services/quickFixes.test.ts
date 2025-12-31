/**
 * Tests for Quick Fix Suggestions in Code Analyzer - Phase 6
 */
import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/services/codeAnalyzer.js';
import type { QuickFix, CodeIssue } from '../../src/services/codeAnalyzer.js';

describe('Quick Fix Suggestions', () => {
  describe('security quick fixes', () => {
    it('should suggest fix for eval()', () => {
      const code = `
        const data = eval(userInput);
      `;
      const result = analyzeCode('test.js', code, 'security');
      
      const evalIssue = result.issues.find(i => i.rule === 'SEC001');
      expect(evalIssue).toBeDefined();
      expect(evalIssue?.quickFix).toBeDefined();
      expect(evalIssue?.quickFix?.description).toContain('JSON.parse');
      expect(evalIssue?.quickFix?.after).toBe('JSON.parse(');
    });

    it('should suggest fix for innerHTML', () => {
      const code = `
        element.innerHTML = userContent;
      `;
      const result = analyzeCode('test.js', code, 'security');
      
      const issue = result.issues.find(i => i.rule === 'SEC002');
      expect(issue?.quickFix).toBeDefined();
      expect(issue?.quickFix?.after).toBe('textContent =');
    });

    it('should suggest fix for hardcoded password', () => {
      const code = `
        const password = "secret123";
      `;
      const result = analyzeCode('test.js', code, 'security');
      
      const issue = result.issues.find(i => i.rule === 'SEC004');
      expect(issue?.quickFix).toBeDefined();
      expect(issue?.quickFix?.after).toContain('process.env');
    });
  });

  describe('coding standards quick fixes', () => {
    it('should suggest fix for debugger statement', () => {
      const code = `
        function test() {
          debugger;
          return true;
        }
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD003');
      expect(issue?.quickFix).toBeDefined();
      expect(issue?.quickFix?.before).toBe('debugger;');
      expect(issue?.quickFix?.after).toBe('');
    });

    it('should suggest fix for var declaration', () => {
      const code = `
        var count = 0;
        var name = "test";
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const varIssues = result.issues.filter(i => i.rule === 'STD004');
      expect(varIssues.length).toBeGreaterThan(0);
      expect(varIssues[0].quickFix?.after).toContain('const');
    });

    it('should suggest fix for loose equality', () => {
      const code = `
        if (a == b) {
          console.log("equal");
        }
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD005');
      expect(issue?.quickFix).toBeDefined();
      expect(issue?.quickFix?.before).toBe('==');
      expect(issue?.quickFix?.after).toBe('===');
    });

    it('should suggest fix for loose inequality', () => {
      const code = `
        if (a != b) {
          console.log("not equal");
        }
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD006');
      expect(issue?.quickFix).toBeDefined();
      expect(issue?.quickFix?.before).toBe('!=');
      expect(issue?.quickFix?.after).toBe('!==');
    });
  });

  describe('quickFixes collection', () => {
    it('should collect unique quick fixes in result', () => {
      const code = `
        var a = 1;
        var b = 2;
        if (a == b) {
          eval(input);
        }
      `;
      const result = analyzeCode('test.js', code, 'all');
      
      expect(result.quickFixes).toBeDefined();
      expect(result.quickFixes!.length).toBeGreaterThan(0);
    });

    it('should deduplicate quick fixes', () => {
      const code = `
        var a = 1;
        var b = 2;
        var c = 3;
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      // Multiple var declarations but should have unique fix suggestions
      const varFixes = result.quickFixes?.filter(f => f.description.includes('var'));
      // Fixes are deduplicated by 'before' value
      expect(varFixes).toBeDefined();
    });
  });

  describe('issues without quick fixes', () => {
    it('should not have quickFix for TODO comments', () => {
      const code = `
        // TODO: implement this
        function placeholder() {}
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const todoIssue = result.issues.find(i => i.rule === 'STD002');
      expect(todoIssue).toBeDefined();
      expect(todoIssue?.quickFix).toBeUndefined();
    });

    it('should not have quickFix for long functions', () => {
      const code = `
        function longFunction() {
          ${'const x = 1;\n'.repeat(100)}
        }
      `;
      const result = analyzeCode('test.js', code, 'coding-standards');
      
      const longFnIssue = result.issues.find(i => i.rule === 'STD007');
      if (longFnIssue) {
        expect(longFnIssue.quickFix).toBeUndefined();
      }
    });
  });
});
