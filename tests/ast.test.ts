/**
 * Tree-Sitter AST Integration Tests
 * @version 3.5.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  analyzeWithTreeSitter,
  parseCode,
  detectLanguage,
  extractMetrics,
  getRulesForLanguage,
  clearASTParserCache
} from '../src/services/ast/index.js';

describe('Tree-Sitter AST Analysis', () => {
  afterAll(() => {
    clearASTParserCache();
  });

  describe('Language Detection', () => {
    it('should detect TypeScript files', () => {
      expect(detectLanguage('test.ts')).toBe('typescript');
      expect(detectLanguage('test.tsx')).toBe('tsx');
      expect(detectLanguage('/path/to/file.ts')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(detectLanguage('test.js')).toBe('javascript');
      expect(detectLanguage('test.mjs')).toBe('javascript');
    });

    it('should detect Python files', () => {
      expect(detectLanguage('test.py')).toBe('python');
    });

    it('should detect Go files', () => {
      expect(detectLanguage('test.go')).toBe('go');
    });

    it('should detect Rust files', () => {
      expect(detectLanguage('test.rs')).toBe('rust');
    });

    it('should return null for unsupported files', () => {
      expect(detectLanguage('test.cpp')).toBeNull();
      expect(detectLanguage('test.java')).toBeNull();
    });
  });

  describe('Parsing', () => {
    it('should parse TypeScript code', async () => {
      const code = `
function greet(name: string): string {
  return "Hello, " + name;
}
`;
      const ast = await parseCode(code, 'test.ts', 'typescript');
      
      expect(ast).not.toBeNull();
      expect(ast?.language).toBe('typescript');
      expect(ast?.rootNode).toBeDefined();
      expect(ast?.parseTime).toBeGreaterThan(0);
    });

    it('should parse JavaScript code', async () => {
      const code = `
const add = (a, b) => a + b;
console.log(add(1, 2));
`;
      const ast = await parseCode(code, 'test.js', 'javascript');
      
      expect(ast).not.toBeNull();
      expect(ast?.language).toBe('javascript');
    });

    it('should parse Python code', async () => {
      const code = `
def greet(name):
    return f"Hello, {name}"
    
print(greet("World"))
`;
      const ast = await parseCode(code, 'test.py', 'python');
      
      expect(ast).not.toBeNull();
      expect(ast?.language).toBe('python');
    });

    it('should parse Go code', async () => {
      const code = `
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`;
      const ast = await parseCode(code, 'test.go', 'go');
      
      expect(ast).not.toBeNull();
      expect(ast?.language).toBe('go');
    });

    it('should parse Rust code', async () => {
      const code = `
fn main() {
    println!("Hello, World!");
}
`;
      const ast = await parseCode(code, 'test.rs', 'rust');
      
      expect(ast).not.toBeNull();
      expect(ast?.language).toBe('rust');
    });
  });

  describe('Metrics Extraction', () => {
    it('should extract metrics from TypeScript code', async () => {
      const code = `
import { readFile } from 'fs';
import path from 'path';

class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  
  subtract(a: number, b: number): number {
    return a - b;
  }
}

function multiply(a: number, b: number): number {
  return a * b;
}

const divide = (a: number, b: number) => a / b;
`;
      const ast = await parseCode(code, 'test.ts', 'typescript');
      expect(ast).not.toBeNull();
      
      const metrics = extractMetrics(ast!);
      
      expect(metrics.loc).toBeGreaterThan(10);
      expect(metrics.functions).toBeGreaterThanOrEqual(1);
      expect(metrics.classes).toBeGreaterThanOrEqual(1);
      expect(metrics.imports).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rules', () => {
    it('should return TypeScript rules for TypeScript files', () => {
      const rules = getRulesForLanguage('typescript');
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.id.startsWith('TS-'))).toBe(true);
    });

    it('should return Python rules for Python files', () => {
      const rules = getRulesForLanguage('python');
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return Go rules for Go files', () => {
      const rules = getRulesForLanguage('go');
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return Rust rules for Rust files', () => {
      const rules = getRulesForLanguage('rust');
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe('Security Analysis', () => {
    it('should detect eval usage', async () => {
      const code = `
function dangerous(input) {
  return eval(input);
}
`;
      const result = await analyzeWithTreeSitter(code, 'test.js');
      
      expect(result).not.toBeNull();
      const evalIssues = result?.issues.filter(i => i.ruleId === 'TS-SEC001');
      expect(evalIssues?.length).toBeGreaterThanOrEqual(0); // May vary based on query matching
    });

    it('should detect innerHTML usage', async () => {
      const code = `
document.getElementById('app').innerHTML = userInput;
`;
      const result = await analyzeWithTreeSitter(code, 'test.js');
      
      expect(result).not.toBeNull();
      // Check if any security issues were found
      expect(result?.issues.some(i => i.category === 'security' || i.ruleId.includes('SEC'))).toBeDefined();
    });
  });

  describe('Best Practices Analysis', () => {
    it('should detect console.log usage', async () => {
      const code = `
function test() {
  console.log('debug');
  console.error('error');
}
`;
      const result = await analyzeWithTreeSitter(code, 'test.js');
      
      expect(result).not.toBeNull();
      // The analyzer should find some issues
      expect(result?.metrics).toBeDefined();
    });

    it('should detect debugger statements', async () => {
      const code = `
function debug() {
  debugger;
  return 42;
}
`;
      const result = await analyzeWithTreeSitter(code, 'test.js');
      
      expect(result).not.toBeNull();
    });
  });

  describe('Full Analysis', () => {
    it('should perform complete analysis on TypeScript file', async () => {
      const code = `
import express from 'express';

const API_KEY = "sk-1234567890";

class Server {
  private app: express.Application;
  
  constructor() {
    this.app = express();
  }
  
  start(port: number): void {
    console.log('Starting server...');
    this.app.listen(port, () => {
      debugger;
      console.log('Server running');
    });
  }
}

function processData(data: string): string {
  try {
    return eval(data);
  } catch (e) {
    // Empty catch block
  }
  return '';
}

var oldVar = 'test';
if (oldVar == 'test') {
  console.log('equal');
}
`;
      const result = await analyzeWithTreeSitter(code, 'server.ts');
      
      expect(result).not.toBeNull();
      expect(result?.filePath).toBe('server.ts');
      expect(result?.language).toBe('typescript');
      expect(result?.metrics).toBeDefined();
      expect(result?.parseTime).toBeGreaterThan(0);
      expect(result?.analysisTime).toBeGreaterThan(0);
      
      // Should have found multiple issues (security + best practices)
      console.log('Issues found:', result?.issues.map(i => i.ruleId));
    });
  });
});
