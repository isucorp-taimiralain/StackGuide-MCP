/**
 * Tests for Code Analyzer Service
 */
import { describe, it, expect } from 'vitest';
import { analyzeCode, analyzeMultipleFiles, formatAnalysisReport } from '../src/services/codeAnalyzer.js';

describe('codeAnalyzer', () => {
  describe('analyzeCode', () => {
    it('should detect eval() usage as security error', () => {
      const code = `
        function process(data) {
          eval(data.code);
        }
      `;
      const result = analyzeCode('test.ts', code, 'security');
      
      expect(result.issues.length).toBeGreaterThan(0);
      const evalIssue = result.issues.find(i => i.rule === 'SEC001');
      expect(evalIssue).toBeDefined();
      expect(evalIssue?.severity).toBe('error');
    });

    it('should detect hardcoded passwords', () => {
      const code = `const password = "secret123";`;
      const result = analyzeCode('test.ts', code, 'security');
      
      const issue = result.issues.find(i => i.rule === 'SEC004');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    it('should detect innerHTML usage', () => {
      const code = `element.innerHTML = userInput;`;
      const result = analyzeCode('test.ts', code, 'security');
      
      const issue = result.issues.find(i => i.rule === 'SEC002');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });

    it('should detect SQL injection patterns', () => {
      const code = `const query = "SELECT * FROM users WHERE id = " + id;`;
      const result = analyzeCode('test.ts', code, 'security');
      
      const issue = result.issues.find(i => i.rule === 'SEC006');
      expect(issue).toBeDefined();
    });

    it('should detect console.log statements', () => {
      const code = `console.log("debug message");`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD001');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });

    it('should detect var usage', () => {
      const code = `var oldStyle = "value";`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD004');
      expect(issue).toBeDefined();
    });

    it('should detect debugger statements', () => {
      const code = `debugger;`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD003');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    it('should detect loose equality', () => {
      const code = `if (a == b) {}`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD005');
      expect(issue).toBeDefined();
    });

    it('should detect empty catch blocks', () => {
      const code = `try { x(); } catch (e) {}`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD008');
      expect(issue).toBeDefined();
    });

    it('should detect JSON.parse(JSON.stringify) pattern', () => {
      const code = `const copy = JSON.parse(JSON.stringify(obj));`;
      const result = analyzeCode('test.ts', code, 'performance');
      
      const issue = result.issues.find(i => i.rule === 'PERF002');
      expect(issue).toBeDefined();
    });

    it('should detect deep relative imports', () => {
      const code = `import { x } from "../../../../deep/path";`;
      const result = analyzeCode('test.ts', code, 'architecture');
      
      const issue = result.issues.find(i => i.rule === 'ARCH001');
      expect(issue).toBeDefined();
    });

    it('should return correct line numbers', () => {
      const code = `line1
line2
console.log("test");
line4`;
      const result = analyzeCode('test.ts', code, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'STD001');
      expect(issue?.line).toBe(3);
    });

    it('should calculate score correctly', () => {
      const cleanCode = `const x = 1;`;
      const result = analyzeCode('test.ts', cleanCode, 'all');
      
      expect(result.score).toBe(100);
    });

    it('should reduce score based on issues', () => {
      const badCode = `
        eval("code");
        debugger;
        console.log("test");
      `;
      const result = analyzeCode('test.ts', badCode, 'all');
      
      expect(result.score).toBeLessThan(100);
    });

    it('should detect language correctly', () => {
      const result = analyzeCode('app.py', 'print("hello")', 'all');
      expect(result.language).toBe('python');
      
      const tsResult = analyzeCode('app.ts', 'const x = 1', 'all');
      expect(tsResult.language).toBe('typescript');
      
      const goResult = analyzeCode('main.go', 'package main', 'all');
      expect(goResult.language).toBe('go');
    });

    it('should apply Python-specific rules only to Python files', () => {
      const pyCode = `except:
        pass`;
      const pyResult = analyzeCode('app.py', pyCode, 'coding-standards');
      const pyIssue = pyResult.issues.find(i => i.rule === 'PY001');
      expect(pyIssue).toBeDefined();
      
      // Same code in JS should not trigger Python rule
      const jsResult = analyzeCode('app.js', pyCode, 'coding-standards');
      const jsIssue = jsResult.issues.find(i => i.rule === 'PY001');
      expect(jsIssue).toBeUndefined();
    });

    it('should apply Rust-specific rules', () => {
      const rustCode = `let x = some_option.unwrap();`;
      const result = analyzeCode('main.rs', rustCode, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'RS001');
      expect(issue).toBeDefined();
    });

    it('should apply Go-specific rules', () => {
      const goCode = `panic("error")`;
      const result = analyzeCode('main.go', goCode, 'coding-standards');
      
      const issue = result.issues.find(i => i.rule === 'GO002');
      expect(issue).toBeDefined();
    });

    it('should filter by focus area', () => {
      const code = `
        eval("code");
        console.log("test");
      `;
      
      const securityResult = analyzeCode('test.ts', code, 'security');
      const standardsResult = analyzeCode('test.ts', code, 'coding-standards');
      
      // Security focus should not include STD rules
      expect(securityResult.issues.every(i => i.category === 'security')).toBe(true);
      // Standards focus should not include SEC rules
      expect(standardsResult.issues.every(i => i.category === 'coding-standards')).toBe(true);
    });

    it('should return summary counts', () => {
      const code = `
        eval("code");
        debugger;
        console.log("test");
        // TODO: fix
      `;
      const result = analyzeCode('test.ts', code, 'all');
      
      expect(result.summary.errors).toBeGreaterThanOrEqual(2);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(1);
      expect(result.summary.info).toBeGreaterThanOrEqual(1);
    });
  });

  describe('analyzeMultipleFiles', () => {
    it('should analyze multiple files', () => {
      const files = [
        { path: 'file1.ts', content: 'console.log("test");' },
        { path: 'file2.ts', content: 'eval("code");' },
      ];
      
      const result = analyzeMultipleFiles(files, 'all');
      
      expect(result.files.length).toBe(2);
      expect(result.overall.totalFiles).toBe(2);
      expect(result.overall.totalIssues).toBeGreaterThan(0);
    });

    it('should calculate average score', () => {
      const files = [
        { path: 'clean.ts', content: 'const x = 1;' },
        { path: 'dirty.ts', content: 'eval("x"); debugger;' },
      ];
      
      const result = analyzeMultipleFiles(files, 'all');
      
      expect(result.overall.averageScore).toBeLessThan(100);
      expect(result.overall.averageScore).toBeGreaterThan(0);
    });

    it('should aggregate summary correctly', () => {
      const files = [
        { path: 'f1.ts', content: 'eval("x");' },
        { path: 'f2.ts', content: 'eval("y");' },
      ];
      
      const result = analyzeMultipleFiles(files, 'all');
      
      expect(result.overall.summary.errors).toBeGreaterThanOrEqual(2);
    });
  });

  describe('formatAnalysisReport', () => {
    it('should format report with no issues', () => {
      const result = analyzeCode('clean.ts', 'const x = 1;', 'all');
      const report = formatAnalysisReport(result);
      
      expect(report).toContain('clean.ts');
      expect(report).toContain('100/100');
      expect(report).toContain('No issues found');
    });

    it('should format report with issues', () => {
      const result = analyzeCode('test.ts', 'eval("code");', 'all');
      const report = formatAnalysisReport(result);
      
      expect(report).toContain('test.ts');
      expect(report).toContain('SEC001');
      expect(report).toContain('🔴');
    });

    it('should include language in report', () => {
      const result = analyzeCode('app.py', 'x = 1', 'all');
      const report = formatAnalysisReport(result);
      
      expect(report).toContain('python');
    });
  });
});
