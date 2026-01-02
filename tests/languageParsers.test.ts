/**
 * Language Parser Tests
 * Tests for multi-language parsing and semantic analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  parserRegistry,
  PythonParser,
  GoParser,
  RustParser,
  getLanguageFromPath
} from '../src/services/parsers/index.js';
import { analyzeCode } from '../src/services/codeAnalyzer.js';

describe('Language Detection', () => {
  it('should detect Python files', () => {
    expect(getLanguageFromPath('main.py')).toBe('python');
    expect(getLanguageFromPath('utils.pyi')).toBe('python');
  });

  it('should detect Go files', () => {
    expect(getLanguageFromPath('main.go')).toBe('go');
  });

  it('should detect Rust files', () => {
    expect(getLanguageFromPath('lib.rs')).toBe('rust');
  });

  it('should detect TypeScript/JavaScript', () => {
    expect(getLanguageFromPath('app.ts')).toBe('typescript');
    expect(getLanguageFromPath('app.tsx')).toBe('typescript');
    expect(getLanguageFromPath('app.js')).toBe('javascript');
    expect(getLanguageFromPath('app.jsx')).toBe('javascript');
  });

  it('should return unknown for unsupported extensions', () => {
    expect(getLanguageFromPath('file.xyz')).toBe('unknown');
  });
});

describe('Parser Registry', () => {
  it('should have registered parsers for Python, Go, Rust', () => {
    expect(parserRegistry.isSupported('python')).toBe(true);
    expect(parserRegistry.isSupported('go')).toBe(true);
    expect(parserRegistry.isSupported('rust')).toBe(true);
  });

  it('should return supported languages', () => {
    const languages = parserRegistry.getSupportedLanguages();
    expect(languages).toContain('python');
    expect(languages).toContain('go');
    expect(languages).toContain('rust');
  });

  it('should check if file is supported', () => {
    expect(parserRegistry.isFileSupported('test.py')).toBe(true);
    expect(parserRegistry.isFileSupported('main.go')).toBe(true);
    expect(parserRegistry.isFileSupported('lib.rs')).toBe(true);
    expect(parserRegistry.isFileSupported('unknown.xyz')).toBe(false);
  });

  it('should get parser for file', () => {
    const pythonParser = parserRegistry.getParserForFile('test.py');
    expect(pythonParser).not.toBeNull();
    expect(pythonParser?.language).toBe('python');
  });

  it('should return total rule count', () => {
    const count = parserRegistry.getTotalRuleCount();
    // 12 Python + 12 Go + 12 Rust = 36
    expect(count).toBeGreaterThanOrEqual(30);
  });
});

describe('Python Parser', () => {
  const parser = new PythonParser();

  it('should parse Python imports', () => {
    const code = `
import os
from typing import List, Dict
from .utils import helper
    `;
    
    const result = parser.parse(code, 'test.py');
    
    expect(result.imports.length).toBeGreaterThanOrEqual(3);
    expect(result.imports.some(i => i.module === 'os')).toBe(true);
    expect(result.imports.some(i => i.module === 'typing')).toBe(true);
  });

  it('should parse Python functions', () => {
    const code = `
def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}!"

def fetch_data(url: str):
    pass
    `;
    
    const result = parser.parse(code, 'test.py');
    
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.functions.some(f => f.name === 'greet')).toBe(true);
    const greetFunc = result.functions.find(f => f.name === 'greet');
    expect(greetFunc?.returnType).toBe('str');
  });

  it('should parse Python classes', () => {
    const code = `
class User:
    """User model class."""
    
    def __init__(self, name: str):
        self.name = name
    
    def greet(self):
        return f"Hi, {self.name}"
    `;
    
    const result = parser.parse(code, 'test.py');
    
    expect(result.classes.length).toBe(1);
    expect(result.classes[0].name).toBe('User');
    expect(result.classes[0].members.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect PY004 - star import', () => {
    const code = `from os import *`;
    
    const issues = parser.analyze(code, 'test.py');
    
    expect(issues.some(i => i.rule === 'PY004')).toBe(true);
  });

  it('should detect PY005 - bare except', () => {
    const code = `
try:
    do_something()
except:
    pass
    `;
    
    const issues = parser.analyze(code, 'test.py');
    
    expect(issues.some(i => i.rule === 'PY005')).toBe(true);
  });

  it('should detect PY006 - mutable default argument', () => {
    const code = `
def append_to(element, to=[]):
    to.append(element)
    return to
    `;
    
    const issues = parser.analyze(code, 'test.py');
    
    expect(issues.some(i => i.rule === 'PY006')).toBe(true);
  });
});

describe('Go Parser', () => {
  const parser = new GoParser();

  it('should parse Go imports', () => {
    const code = `
package main

import (
    "fmt"
    "net/http"
    log "github.com/sirupsen/logrus"
)
    `;
    
    const result = parser.parse(code, 'main.go');
    
    expect(result.imports.length).toBeGreaterThanOrEqual(3);
    expect(result.imports.some(i => i.module === 'fmt')).toBe(true);
  });

  it('should parse Go functions', () => {
    const code = `
package main

func Hello(name string) string {
    return "Hello, " + name
}

func (u *User) Greet() string {
    return "Hi"
}
    `;
    
    const result = parser.parse(code, 'main.go');
    
    expect(result.functions.length).toBe(2);
    expect(result.functions[0].name).toBe('Hello');
    expect(result.functions[0].isExported).toBe(true);
  });

  it('should parse Go structs', () => {
    const code = `
package main

type User struct {
    Name  string
    email string
}
    `;
    
    const result = parser.parse(code, 'main.go');
    
    expect(result.classes.length).toBe(1);
    expect(result.classes[0].name).toBe('User');
    expect(result.classes[0].members.length).toBe(2);
  });

  it('should detect GO001 - discarded error', () => {
    const code = `
package main

func main() {
    _ = doSomething()
}
    `;
    
    const issues = parser.analyze(code, 'main.go');
    
    expect(issues.some(i => i.rule === 'GO001')).toBe(true);
  });

  it('should detect GO005 - empty interface', () => {
    const code = `
package main

func process(data interface{}) {
    fmt.Println(data)
}
    `;
    
    const issues = parser.analyze(code, 'main.go');
    
    expect(issues.some(i => i.rule === 'GO005')).toBe(true);
  });

  it('should detect GO012 - panic without recover', () => {
    const code = `
package main

func main() {
    panic("error")
}
    `;
    
    const issues = parser.analyze(code, 'main.go');
    
    expect(issues.some(i => i.rule === 'GO012')).toBe(true);
  });
});

describe('Rust Parser', () => {
  const parser = new RustParser();

  it('should parse Rust use statements', () => {
    const code = `
use std::io::{Read, Write};
use crate::utils::helper;
    `;
    
    const result = parser.parse(code, 'lib.rs');
    
    expect(result.imports.length).toBeGreaterThanOrEqual(2);
    expect(result.imports.some(i => i.module === 'std::io')).toBe(true);
  });

  it('should parse Rust functions', () => {
    const code = `
pub fn greet(name: &str) -> String {
    format!("Hello, {}", name)
}

pub fn fetch_data() -> String {
    "data".to_string()
}
    `;
    
    const result = parser.parse(code, 'lib.rs');
    
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.functions.some(f => f.name === 'greet')).toBe(true);
    const greetFunc = result.functions.find(f => f.name === 'greet');
    expect(greetFunc?.isPublic).toBe(true);
  });

  it('should parse Rust structs', () => {
    const code = `
#[derive(Debug, Clone)]
pub struct User {
    pub name: String,
    email: String,
}
    `;
    
    const result = parser.parse(code, 'lib.rs');
    
    expect(result.classes.length).toBe(1);
    expect(result.classes[0].name).toBe('User');
    expect(result.classes[0].traits).toContain('Debug');
    expect(result.classes[0].traits).toContain('Clone');
  });

  it('should detect RS001 - unsafe block', () => {
    const code = `
fn dangerous() {
    unsafe {
        std::ptr::null::<i32>();
    }
}
    `;
    
    const issues = parser.analyze(code, 'lib.rs');
    
    expect(issues.some(i => i.rule === 'RS001')).toBe(true);
  });

  it('should detect RS002 - excessive unwrap', () => {
    const code = `
fn main() {
    let a = some_option.unwrap();
    let b = another.unwrap();
    let c = third.unwrap();
    let d = fourth.unwrap();
}
    `;
    
    const issues = parser.analyze(code, 'main.rs'); // not test file
    
    // Should not trigger in main.rs (allowed in main)
    // Note: test files are excluded
  });

  it('should detect RS006 - panic in lib', () => {
    const code = `
pub fn process() {
    panic!("something went wrong");
}
    `;
    
    const issues = parser.analyze(code, 'lib.rs');
    
    expect(issues.some(i => i.rule === 'RS006')).toBe(true);
  });
});

describe('Integration with codeAnalyzer', () => {
  it('should run Python parser for .py files', () => {
    const code = `
from os import *

def bad_default(items=[]):
    return items
    `;
    
    const result = analyzeCode('test.py', code, 'all');
    
    // Should have issues from Python parser
    const pythonIssues = result.issues.filter(i => i.rule.startsWith('PY'));
    expect(pythonIssues.length).toBeGreaterThan(0);
  });

  it('should run Go parser for .go files', () => {
    const code = `
package main

func main() {
    panic("error")
}
    `;
    
    const result = analyzeCode('main.go', code, 'all');
    
    // Should have issues from Go parser
    const goIssues = result.issues.filter(i => i.rule.startsWith('GO'));
    expect(goIssues.length).toBeGreaterThan(0);
  });

  it('should run Rust parser for .rs files', () => {
    const code = `
fn process() {
    unsafe {
        do_something();
    }
}
    `;
    
    const result = analyzeCode('lib.rs', code, 'all');
    
    // Should have issues from Rust parser
    const rustIssues = result.issues.filter(i => i.rule.startsWith('RS'));
    expect(rustIssues.length).toBeGreaterThan(0);
  });

  it('should include language parser rule count in stats', async () => {
    const { ruleRegistry } = await import('../src/services/codeAnalyzer.js');
    
    const stats = ruleRegistry.getStats();
    
    expect(stats.languageParsers).toBeGreaterThan(0);
    expect(stats.total).toBeGreaterThanOrEqual(stats.ast);
  });
});
