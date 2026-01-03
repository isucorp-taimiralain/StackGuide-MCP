/**
 * ProjectFs - Injectable Filesystem Abstraction
 * Enables real FS access in production, mocks in tests
 * @version 3.4.0
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: Date;
}

export interface DirectoryScanOptions {
  maxDepth?: number;
  ignorePatterns?: string[];
  includeHidden?: boolean;
}

export interface ProjectFs {
  /** Check if path exists */
  exists(filepath: string): Promise<boolean>;
  
  /** Check if path is a directory */
  isDirectory(filepath: string): Promise<boolean>;
  
  /** Check if path is a file */
  isFile(filepath: string): Promise<boolean>;
  
  /** Read file contents */
  readFile(filepath: string): Promise<string>;
  
  /** Write file contents */
  writeFile(filepath: string, content: string): Promise<void>;
  
  /** Read directory entries */
  readDir(dirpath: string): Promise<FileInfo[]>;
  
  /** Recursively scan directory */
  scanDir(dirpath: string, options?: DirectoryScanOptions): Promise<FileInfo[]>;
  
  /** Get file/directory info */
  stat(filepath: string): Promise<FileInfo | null>;
  
  /** Resolve path relative to base */
  resolve(...paths: string[]): string;
  
  /** Join paths */
  join(...paths: string[]): string;
  
  /** Get base directory */
  getBasePath(): string;
}

// ============================================================================
// Real Filesystem Implementation
// ============================================================================

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'target',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  'vendor',
  '.idea',
  '.vscode'
];

export class RealProjectFs implements ProjectFs {
  private basePath: string;
  
  constructor(basePath: string = process.cwd()) {
    this.basePath = path.resolve(basePath);
  }
  
  async exists(filepath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(filepath);
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  
  async isDirectory(filepath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(filepath);
      const stats = await fs.promises.stat(fullPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  async isFile(filepath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(filepath);
      const stats = await fs.promises.stat(fullPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
  
  async readFile(filepath: string): Promise<string> {
    const fullPath = this.resolve(filepath);
    return fs.promises.readFile(fullPath, 'utf-8');
  }
  
  async writeFile(filepath: string, content: string): Promise<void> {
    const fullPath = this.resolve(filepath);
    const dir = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf-8');
  }
  
  async readDir(dirpath: string): Promise<FileInfo[]> {
    const fullPath = this.resolve(dirpath);
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirpath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile()
    }));
  }
  
  async scanDir(dirpath: string, options: DirectoryScanOptions = {}): Promise<FileInfo[]> {
    const {
      maxDepth = 5,
      ignorePatterns = DEFAULT_IGNORE_PATTERNS,
      includeHidden = false
    } = options;
    
    const results: FileInfo[] = [];
    
    const scan = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;
      
      try {
        const entries = await this.readDir(currentPath);
        
        for (const entry of entries) {
          // Skip hidden files unless requested
          if (!includeHidden && entry.name.startsWith('.')) continue;
          
          // Skip ignored patterns
          if (ignorePatterns.some(pattern => entry.name === pattern)) continue;
          
          results.push(entry);
          
          if (entry.isDirectory) {
            await scan(entry.path, depth + 1);
          }
        }
      } catch (error) {
        // Directory may not exist or be inaccessible
      }
    };
    
    await scan(dirpath, 0);
    return results;
  }
  
  async stat(filepath: string): Promise<FileInfo | null> {
    try {
      const fullPath = this.resolve(filepath);
      const stats = await fs.promises.stat(fullPath);
      
      return {
        name: path.basename(filepath),
        path: filepath,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        modifiedAt: stats.mtime
      };
    } catch {
      return null;
    }
  }
  
  resolve(...paths: string[]): string {
    if (paths.length === 0) return this.basePath;
    
    const firstPath = paths[0];
    if (path.isAbsolute(firstPath)) {
      return path.resolve(...paths);
    }
    
    return path.resolve(this.basePath, ...paths);
  }
  
  join(...paths: string[]): string {
    return path.join(...paths);
  }
  
  getBasePath(): string {
    return this.basePath;
  }
}

// ============================================================================
// Mock Filesystem Implementation (for testing)
// ============================================================================

export interface MockFileEntry {
  content?: string;
  isDirectory?: boolean;
}

export class MockProjectFs implements ProjectFs {
  private basePath: string;
  private files: Map<string, MockFileEntry>;
  
  constructor(basePath: string = '/mock/project', initialFiles?: Record<string, MockFileEntry>) {
    this.basePath = basePath;
    this.files = new Map(Object.entries(initialFiles || {}));
  }
  
  addFile(filepath: string, content: string): void {
    this.files.set(filepath, { content, isDirectory: false });
  }
  
  addDirectory(dirpath: string): void {
    this.files.set(dirpath, { isDirectory: true });
  }
  
  async exists(filepath: string): Promise<boolean> {
    const resolved = this.resolve(filepath);
    return this.files.has(resolved) || this.hasChildrenAt(resolved);
  }
  
  async isDirectory(filepath: string): Promise<boolean> {
    const resolved = this.resolve(filepath);
    const entry = this.files.get(resolved);
    if (entry?.isDirectory) return true;
    return this.hasChildrenAt(resolved);
  }
  
  async isFile(filepath: string): Promise<boolean> {
    const resolved = this.resolve(filepath);
    const entry = this.files.get(resolved);
    return entry?.content !== undefined;
  }
  
  async readFile(filepath: string): Promise<string> {
    const resolved = this.resolve(filepath);
    const entry = this.files.get(resolved);
    if (!entry?.content) {
      throw new Error(`ENOENT: no such file: ${resolved}`);
    }
    return entry.content;
  }
  
  async writeFile(filepath: string, content: string): Promise<void> {
    const resolved = this.resolve(filepath);
    this.files.set(resolved, { content, isDirectory: false });
  }
  
  async readDir(dirpath: string): Promise<FileInfo[]> {
    const resolved = this.resolve(dirpath);
    const results: FileInfo[] = [];
    const seen = new Set<string>();
    
    for (const [filePath, entry] of this.files) {
      if (filePath.startsWith(resolved + '/')) {
        const relativePath = filePath.slice(resolved.length + 1);
        const parts = relativePath.split('/');
        const name = parts[0];
        
        if (!seen.has(name)) {
          seen.add(name);
          results.push({
            name,
            path: path.join(dirpath, name),
            isDirectory: parts.length > 1 || entry.isDirectory === true,
            isFile: parts.length === 1 && entry.content !== undefined
          });
        }
      }
    }
    
    return results;
  }
  
  async scanDir(dirpath: string, options: DirectoryScanOptions = {}): Promise<FileInfo[]> {
    const { maxDepth = 5, ignorePatterns = [], includeHidden = false } = options;
    const results: FileInfo[] = [];
    
    const scan = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;
      
      const entries = await this.readDir(currentPath);
      
      for (const entry of entries) {
        if (!includeHidden && entry.name.startsWith('.')) continue;
        if (ignorePatterns.some(p => entry.name === p)) continue;
        
        results.push(entry);
        
        if (entry.isDirectory) {
          await scan(entry.path, depth + 1);
        }
      }
    };
    
    await scan(dirpath, 0);
    return results;
  }
  
  async stat(filepath: string): Promise<FileInfo | null> {
    const resolved = this.resolve(filepath);
    const entry = this.files.get(resolved);
    
    if (!entry && !this.hasChildrenAt(resolved)) return null;
    
    return {
      name: path.basename(filepath),
      path: filepath,
      isDirectory: entry?.isDirectory === true || this.hasChildrenAt(resolved),
      isFile: entry?.content !== undefined,
      size: entry?.content?.length || 0
    };
  }
  
  resolve(...paths: string[]): string {
    if (paths.length === 0) return this.basePath;
    
    const firstPath = paths[0];
    if (path.isAbsolute(firstPath)) {
      return path.resolve(...paths);
    }
    
    return path.resolve(this.basePath, ...paths);
  }
  
  join(...paths: string[]): string {
    return path.join(...paths);
  }
  
  getBasePath(): string {
    return this.basePath;
  }
  
  private hasChildrenAt(dirpath: string): boolean {
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(dirpath + '/')) {
        return true;
      }
    }
    return false;
  }
}

// ============================================================================
// Factory & Default Instance
// ============================================================================

let defaultFs: ProjectFs | null = null;

export function createProjectFs(basePath?: string): ProjectFs {
  return new RealProjectFs(basePath);
}

export function getProjectFs(): ProjectFs {
  if (!defaultFs) {
    defaultFs = createProjectFs();
  }
  return defaultFs;
}

export function setProjectFs(fs: ProjectFs): void {
  defaultFs = fs;
}

export function resetProjectFs(): void {
  defaultFs = null;
}
