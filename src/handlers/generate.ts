/**
 * Generate handler - Generate boilerplate code from templates
 * Phase 6: Advanced Features
 * 
 * Improvements:
 * - Detects project conventions (quotes, semicolons, indentation)
 * - Adapts templates based on state management in use
 * - Respects existing code patterns
 */

import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { detectConventions, CodeConventions, formatWithConventions } from '../services/conventionDetector.js';

interface GenerateArgs {
  type: 'component' | 'hook' | 'service' | 'test' | 'api' | 'model' | 'util';
  name: string;
  options?: {
    typescript?: boolean;
    withTests?: boolean;
    withStyles?: boolean;
    framework?: string;
    scanProject?: boolean;  // Scan project for conventions
  };
}

// Cached conventions
let cachedConventions: CodeConventions | null = null;
let cachedProjectPath: string | null = null;

/**
 * Get conventions for current project (with caching)
 */
function getProjectConventions(): CodeConventions {
  const projectPath = process.cwd();
  
  if (cachedConventions && cachedProjectPath === projectPath) {
    return cachedConventions;
  }
  
  cachedConventions = detectConventions(projectPath);
  cachedProjectPath = projectPath;
  return cachedConventions;
}

/**
 * Apply conventions to generated code
 */
function applyConventions(code: string, conventions: CodeConventions): string {
  let result = code;
  
  // Apply indentation
  if (conventions.indentation === 'tabs') {
    result = result.replace(/^( {2})/gm, '\t');
    result = result.replace(/^( {4})/gm, '\t\t');
    result = result.replace(/^( {6})/gm, '\t\t\t');
    result = result.replace(/^( {8})/gm, '\t\t\t\t');
  } else if (conventions.indentSize !== 2) {
    const spaces = ' '.repeat(conventions.indentSize);
    result = result.replace(/^  /gm, spaces);
    result = result.replace(/^    /gm, spaces + spaces);
    result = result.replace(/^      /gm, spaces + spaces + spaces);
  }
  
  // Apply quote style (careful with JSX)
  if (conventions.quotes === 'double') {
    // Only change quotes outside of JSX attributes
    result = result.replace(/(?<!=)'([^']*)'(?!>)/g, '"$1"');
  }
  
  // Apply semicolons
  if (!conventions.semicolons) {
    // Remove trailing semicolons (simple cases)
    result = result.replace(/;(\s*\n)/g, '$1');
    result = result.replace(/;(\s*$)/g, '$1');
  }
  
  return result;
}

// Template generators by type
const templates: Record<string, (name: string, opts: GenerateArgs['options']) => string> = {
  // React Component
  component: (name, opts) => {
    const ts = opts?.typescript !== false;
    const withStyles = opts?.withStyles;
    
    if (ts) {
      return `import React from 'react';
${withStyles ? `import styles from './${name}.module.css';\n` : ''}
interface ${name}Props {
  /** Add your props here */
  className?: string;
  children?: React.ReactNode;
}

/**
 * ${name} Component
 * 
 * @example
 * <${name}>Content</${name}>
 */
export const ${name}: React.FC<${name}Props> = ({ 
  className,
  children,
}) => {
  return (
    <div className={\`${withStyles ? '${styles.container} ' : ''}$\{className || ''}\`}>
      {children}
    </div>
  );
};

export default ${name};
`;
    }
    
    return `import React from 'react';
${withStyles ? `import styles from './${name}.module.css';\n` : ''}
/**
 * ${name} Component
 */
export const ${name} = ({ className, children }) => {
  return (
    <div className={className}>
      {children}
    </div>
  );
};

export default ${name};
`;
  },

  // React Hook
  hook: (name, opts) => {
    const hookName = name.startsWith('use') ? name : `use${name}`;
    const ts = opts?.typescript !== false;
    
    if (ts) {
      return `import { useState, useEffect, useCallback } from 'react';

interface ${hookName}Options {
  /** Initial value */
  initialValue?: unknown;
}

interface ${hookName}Result {
  /** Current state */
  data: unknown;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * ${hookName} - Custom React Hook
 * 
 * @example
 * const { data, loading, error } = ${hookName}();
 */
export function ${hookName}(options: ${hookName}Options = {}): ${hookName}Result {
  const [data, setData] = useState<unknown>(options.initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement fetch logic
      // const result = await fetchData();
      // setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export default ${hookName};
`;
    }
    
    return `import { useState, useEffect, useCallback } from 'react';

/**
 * ${hookName} - Custom React Hook
 */
export function ${hookName}(options = {}) {
  const [data, setData] = useState(options.initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Implement fetch logic
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
`;
  },

  // Service
  service: (name, opts) => {
    const ts = opts?.typescript !== false;
    const serviceName = name.endsWith('Service') ? name : `${name}Service`;
    
    if (ts) {
      return `/**
 * ${serviceName}
 * 
 * Service layer for ${name.replace('Service', '')} operations
 */

interface ${serviceName}Config {
  baseUrl?: string;
  timeout?: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class ${serviceName} {
  private baseUrl: string;
  private timeout: number;

  constructor(config: ${serviceName}Config = {}) {
    this.baseUrl = config.baseUrl || '/api';
    this.timeout = config.timeout || 10000;
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }

      const data = await response.json();
      return { data, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async getAll<T>(): Promise<T[]> {
    const response = await this.request<T[]>('');
    return response.data;
  }

  async getById<T>(id: string | number): Promise<T> {
    const response = await this.request<T>(\`/\${id}\`);
    return response.data;
  }

  async create<T>(data: Partial<T>): Promise<T> {
    const response = await this.request<T>('', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  async update<T>(id: string | number, data: Partial<T>): Promise<T> {
    const response = await this.request<T>(\`/\${id}\`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  async delete(id: string | number): Promise<void> {
    await this.request(\`/\${id}\`, { method: 'DELETE' });
  }
}

export const ${name.toLowerCase()}Service = new ${serviceName}();
export default ${serviceName};
`;
    }
    
    return `/**
 * ${serviceName}
 */

class ${serviceName} {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || '/api';
  }

  async getAll() {
    const response = await fetch(this.baseUrl);
    return response.json();
  }

  async getById(id) {
    const response = await fetch(\`\${this.baseUrl}/\${id}\`);
    return response.json();
  }

  async create(data) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async update(id, data) {
    const response = await fetch(\`\${this.baseUrl}/\${id}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async delete(id) {
    await fetch(\`\${this.baseUrl}/\${id}\`, { method: 'DELETE' });
  }
}

export default ${serviceName};
`;
  },

  // Test file
  test: (name, opts) => {
    const framework = opts?.framework || 'vitest';
    
    if (framework === 'jest') {
      return `/**
 * Tests for ${name}
 */

describe('${name}', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('initialization', () => {
    it('should initialize correctly', () => {
      // Arrange
      // Act
      // Assert
      expect(true).toBe(true);
    });
  });

  describe('main functionality', () => {
    it('should perform main operation', () => {
      // TODO: Implement test
    });

    it('should handle edge cases', () => {
      // TODO: Implement test
    });

    it('should handle errors gracefully', () => {
      // TODO: Implement test
    });
  });
});
`;
    }
    
    return `/**
 * Tests for ${name}
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('${name}', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize correctly', () => {
      // Arrange
      // Act
      // Assert
      expect(true).toBe(true);
    });
  });

  describe('main functionality', () => {
    it('should perform main operation', async () => {
      // TODO: Implement test
    });

    it('should handle edge cases', () => {
      // TODO: Implement test
    });

    it('should handle errors gracefully', () => {
      // TODO: Implement test
    });
  });

  describe('integration', () => {
    it('should work with other components', () => {
      // TODO: Implement integration test
    });
  });
});
`;
  },

  // API endpoint
  api: (name, opts) => {
    const ts = opts?.typescript !== false;
    const framework = opts?.framework || 'express';
    
    if (framework === 'nextjs') {
      return `/**
 * API Route: /api/${name.toLowerCase()}
 */
import { NextRequest, NextResponse } from 'next/server';

// GET /api/${name.toLowerCase()}
export async function GET(request: NextRequest) {
  try {
    // TODO: Implement GET logic
    const data = { message: '${name} endpoint' };
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST /api/${name.toLowerCase()}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // TODO: Implement POST logic
    // Validate body
    // Create resource
    
    return NextResponse.json(
      { message: 'Created', data: body },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PUT /api/${name.toLowerCase()}
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // TODO: Implement PUT logic
    
    return NextResponse.json({ message: 'Updated', data: body });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE /api/${name.toLowerCase()}
export async function DELETE(request: NextRequest) {
  try {
    // TODO: Implement DELETE logic
    
    return NextResponse.json({ message: 'Deleted' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
`;
    }
    
    // Express
    if (ts) {
      return `/**
 * ${name} API Routes
 */
import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// Middleware for this router
router.use((req: Request, res: Response, next: NextFunction) => {
  // Add any route-specific middleware here
  next();
});

// GET /api/${name.toLowerCase()}
router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: Implement GET logic
    res.json({ message: '${name} list' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/${name.toLowerCase()}/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Implement GET by ID logic
    res.json({ id, message: '${name} details' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/${name.toLowerCase()}
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    // TODO: Implement POST logic
    res.status(201).json({ message: 'Created', data });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/${name.toLowerCase()}/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    // TODO: Implement PUT logic
    res.json({ id, message: 'Updated', data });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/${name.toLowerCase()}/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Implement DELETE logic
    res.json({ id, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
`;
    }
    
    return `/**
 * ${name} API Routes
 */
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ message: '${name} list' });
});

router.get('/:id', async (req, res) => {
  res.json({ id: req.params.id });
});

router.post('/', async (req, res) => {
  res.status(201).json({ data: req.body });
});

router.put('/:id', async (req, res) => {
  res.json({ id: req.params.id, data: req.body });
});

router.delete('/:id', async (req, res) => {
  res.json({ message: 'Deleted' });
});

module.exports = router;
`;
  },

  // Model/Entity
  model: (name, opts) => {
    const ts = opts?.typescript !== false;
    
    if (ts) {
      return `/**
 * ${name} Model
 */

export interface ${name} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  // Add your fields here
}

export interface Create${name}Input {
  // Fields required to create a ${name}
}

export interface Update${name}Input {
  // Fields that can be updated
}

/**
 * ${name} validation schema
 */
export const ${name.toLowerCase()}Schema = {
  id: { type: 'string', required: true },
  createdAt: { type: 'date', required: true },
  updatedAt: { type: 'date', required: true },
};

/**
 * Create a new ${name} instance
 */
export function create${name}(input: Create${name}Input): ${name} {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

/**
 * Validate ${name} data
 */
export function validate${name}(data: unknown): data is ${name} {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  );
}

export default ${name};
`;
    }
    
    return `/**
 * ${name} Model
 */

function create${name}(input) {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function validate${name}(data) {
  return data && typeof data.id === 'string';
}

module.exports = { create${name}, validate${name} };
`;
  },

  // Utility module
  util: (name, opts) => {
    const ts = opts?.typescript !== false;
    
    if (ts) {
      return `/**
 * ${name} Utilities
 */

/**
 * Format a value for display
 */
export function format${name}(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Parse a string value
 */
export function parse${name}(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Validate a ${name.toLowerCase()} value
 */
export function isValid${name}(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/**
 * Compare two ${name.toLowerCase()} values
 */
export function compare${name}(a: unknown, b: unknown): number {
  const strA = String(a);
  const strB = String(b);
  return strA.localeCompare(strB);
}

/**
 * Create a default ${name.toLowerCase()} value
 */
export function createDefault${name}(): unknown {
  return null;
}

/**
 * Deep clone a ${name.toLowerCase()} value
 */
export function clone${name}<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export default {
  format${name},
  parse${name},
  isValid${name},
  compare${name},
  createDefault${name},
  clone${name},
};
`;
    }
    
    return `/**
 * ${name} Utilities
 */

function format${name}(value) {
  if (value == null) return '';
  return String(value);
}

function parse${name}(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isValid${name}(value) {
  return value != null;
}

module.exports = { format${name}, parse${name}, isValid${name} };
`;
  },
};

export async function handleGenerate(
  args: GenerateArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { type, name, options = {} } = args;

  if (!type || !name) {
    return jsonResponse({
      error: 'Both type and name are required',
      availableTypes: Object.keys(templates),
      example: 'generate type:"component" name:"UserCard"'
    });
  }

  // Detect project conventions
  const conventions = options.scanProject !== false ? getProjectConventions() : null;
  
  // Infer TypeScript from project type or conventions
  if (options.typescript === undefined) {
    if (state.activeProjectType?.includes('typescript')) {
      options.typescript = true;
    } else if (conventions?.strictMode) {
      options.typescript = true;
    }
  }
  
  // Infer framework from conventions
  if (!options.framework && conventions) {
    if (conventions.stateManagement === 'zustand') {
      options.framework = 'zustand';
    }
  }

  const generator = templates[type];
  if (!generator) {
    return jsonResponse({
      error: `Unknown template type: ${type}`,
      availableTypes: Object.keys(templates)
    });
  }

  logger.info('Generating template', { type, name, options, conventions: conventions?.sources });

  let code = generator(name, options);
  
  // Apply detected conventions to generated code
  if (conventions && conventions.confidence !== 'low') {
    code = applyConventions(code, conventions);
  }
  
  const ext = options.typescript !== false ? 'ts' : 'js';
  const filename = type === 'test' 
    ? `${name}.test.${ext}` 
    : type === 'component'
    ? `${name}.tsx`
    : `${name}.${ext}`;

  return jsonResponse({
    success: true,
    type,
    name,
    filename,
    code,
    conventions: conventions ? {
      applied: conventions.confidence !== 'low',
      sources: conventions.sources,
      indentation: conventions.indentation,
      quotes: conventions.quotes,
      semicolons: conventions.semicolons
    } : null,
    instructions: [
      `1. Create file: ${filename}`,
      '2. Paste the generated code',
      '3. Customize the TODO sections',
      options.withTests ? `4. Run: npm test ${name}` : null,
    ].filter(Boolean)
  });
}
