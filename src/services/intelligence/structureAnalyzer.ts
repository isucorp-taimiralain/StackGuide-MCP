/**
 * Project Structure Analyzer
 * Analyzes project structure and suggests improvements
 * @version 3.3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  StructureAnalysis,
  DirectorySuggestion,
  FileSuggestion,
  StructureImprovement
} from './types.js';
import { getFrameworkTemplate } from './templates.js';

/**
 * Analyze project structure against framework template
 */
export function analyzeStructure(projectPath: string, projectType: string): StructureAnalysis {
  const template = getFrameworkTemplate(projectType);
  
  const existingDirs: string[] = [];
  const existingFiles: string[] = [];
  const missingDirs: DirectorySuggestion[] = [];
  const missingFiles: FileSuggestion[] = [];
  const improvements: StructureImprovement[] = [];
  
  // Scan existing structure
  const scannedDirs = scanDirectory(projectPath, 3); // Max depth 3
  existingDirs.push(...scannedDirs.dirs);
  existingFiles.push(...scannedDirs.files);
  
  if (template) {
    // Check required directories
    for (const dir of template.requiredDirs) {
      const fullPath = path.join(projectPath, dir);
      if (!fs.existsSync(fullPath)) {
        missingDirs.push({
          path: dir,
          purpose: getDirPurpose(dir, projectType),
          priority: 'high'
        });
      }
    }
    
    // Check optional directories
    for (const dir of template.optionalDirs) {
      const fullPath = path.join(projectPath, dir);
      if (!fs.existsSync(fullPath)) {
        missingDirs.push({
          path: dir,
          purpose: getDirPurpose(dir, projectType),
          priority: 'medium'
        });
      }
    }
    
    // Check required files
    for (const file of template.requiredFiles) {
      const fullPath = path.join(projectPath, file);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push({
          path: file,
          purpose: getFilePurpose(file),
          priority: 'high'
        });
      }
    }
    
    // Check optional files
    for (const file of template.optionalFiles) {
      const fullPath = path.join(projectPath, file);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push({
          path: file,
          purpose: getFilePurpose(file),
          priority: 'low'
        });
      }
    }
  }
  
  // Detect common structure issues
  improvements.push(...detectStructureIssues(projectPath, existingDirs, existingFiles, projectType));
  
  // Calculate structure score
  const structureScore = calculateStructureScore(
    missingDirs.filter(d => d.priority === 'high').length,
    missingFiles.filter(f => f.priority === 'high').length,
    improvements.filter(i => i.priority === 'high').length
  );
  
  return {
    rootPath: projectPath,
    projectType,
    structureScore,
    existingDirs,
    missingDirs,
    existingFiles,
    missingFiles,
    improvements
  };
}

/**
 * Scan directory recursively
 */
function scanDirectory(dirPath: string, maxDepth: number, currentDepth = 0): { dirs: string[]; files: string[] } {
  const dirs: string[] = [];
  const files: string[] = [];
  
  if (currentDepth >= maxDepth || !fs.existsSync(dirPath)) {
    return { dirs, files };
  }
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip common non-source directories
      if (shouldSkipEntry(entry.name)) continue;
      
      const relativePath = currentDepth === 0 ? entry.name : entry.name;
      
      if (entry.isDirectory()) {
        dirs.push(relativePath);
        // Recurse
        const subPath = path.join(dirPath, entry.name);
        const subResult = scanDirectory(subPath, maxDepth, currentDepth + 1);
        dirs.push(...subResult.dirs.map(d => path.join(relativePath, d)));
        files.push(...subResult.files.map(f => path.join(relativePath, f)));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  } catch {
    // Permission denied or other error
  }
  
  return { dirs, files };
}

/**
 * Check if entry should be skipped
 */
function shouldSkipEntry(name: string): boolean {
  const skipPatterns = [
    'node_modules',
    '.git',
    '.next',
    '.nuxt',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.venv',
    'venv',
    'target',
    '.idea',
    '.vscode'
  ];
  return skipPatterns.includes(name) || name.startsWith('.');
}

/**
 * Get directory purpose description
 */
function getDirPurpose(dir: string, projectType: string): string {
  const purposes: Record<string, string> = {
    'src': 'Source code root directory',
    'src/components': 'Reusable UI components',
    'src/hooks': 'Custom React hooks',
    'src/utils': 'Utility functions and helpers',
    'src/types': 'TypeScript type definitions',
    'src/services': 'API and business logic services',
    'src/contexts': 'React context providers',
    'src/styles': 'CSS/SCSS stylesheets',
    'src/stores': 'State management stores',
    'src/composables': 'Vue composables',
    'src/views': 'Page-level components',
    'src/routes': 'Route handlers',
    'src/middleware': 'Express/Koa middleware',
    'src/controllers': 'MVC controllers',
    'src/models': 'Data models',
    'src/config': 'Configuration files',
    'src/modules': 'NestJS modules',
    'src/common': 'Shared utilities and types',
    'src/guards': 'Auth guards',
    'src/interceptors': 'Request/response interceptors',
    'src/filters': 'Exception filters',
    'src/pipes': 'Validation pipes',
    'src/decorators': 'Custom decorators',
    'tests': 'Test files',
    'test': 'Test files',
    'public': 'Static assets',
    'app': 'Application code (Next.js/FastAPI)',
    'app/api': 'API routes',
    'app/models': 'Data models',
    'app/schemas': 'Pydantic schemas',
    'app/core': 'Core functionality',
    'app/db': 'Database configuration',
    'cmd': 'Go command entry points',
    'internal': 'Private Go packages',
    'pkg': 'Public Go packages',
    'api': 'API definitions',
    'configs': 'Configuration files',
    'scripts': 'Build/deployment scripts',
    'docs': 'Documentation'
  };
  
  return purposes[dir] || `Standard ${projectType} directory`;
}

/**
 * Get file purpose description
 */
function getFilePurpose(file: string): string {
  const purposes: Record<string, string> = {
    'package.json': 'Node.js project manifest',
    'tsconfig.json': 'TypeScript configuration',
    'next.config.js': 'Next.js configuration',
    'nest-cli.json': 'NestJS CLI configuration',
    '.eslintrc.js': 'ESLint configuration',
    '.eslintrc.json': 'ESLint configuration',
    'eslint.config.js': 'ESLint flat configuration',
    '.prettierrc': 'Prettier configuration',
    '.editorconfig': 'Editor settings',
    '.gitignore': 'Git ignore patterns',
    '.env': 'Environment variables',
    '.env.local': 'Local environment variables',
    'README.md': 'Project documentation',
    'Dockerfile': 'Docker container definition',
    'docker-compose.yml': 'Docker compose configuration',
    'manage.py': 'Django management script',
    'pyproject.toml': 'Python project configuration',
    'requirements.txt': 'Python dependencies',
    'go.mod': 'Go module definition',
    'go.sum': 'Go dependency checksums',
    'Cargo.toml': 'Rust project manifest',
    'Makefile': 'Build automation',
    'main.go': 'Go entry point',
    'main.rs': 'Rust entry point',
    'src/main.ts': 'Application entry point',
    'src/index.ts': 'Module entry point',
    'src/index.tsx': 'React entry point',
    'src/App.tsx': 'Main React component',
    'src/App.vue': 'Main Vue component',
    'src/main.py': 'Python entry point',
    'src/app.module.ts': 'NestJS root module',
    'vite.config.ts': 'Vite configuration'
  };
  
  return purposes[file] || 'Project file';
}

/**
 * Detect structural issues
 */
function detectStructureIssues(
  projectPath: string,
  dirs: string[],
  files: string[],
  projectType: string
): StructureImprovement[] {
  const improvements: StructureImprovement[] = [];
  
  // Check for flat structure (too many files in root)
  const rootFiles = files.filter(f => !f.includes('/') && !f.includes('\\'));
  const sourceFiles = rootFiles.filter(f => 
    f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
  );
  
  if (sourceFiles.length > 3) {
    improvements.push({
      type: 'reorganize',
      description: `Consider moving source files to src/ directory (${sourceFiles.length} files in root)`,
      priority: 'medium'
    });
  }
  
  // Check for missing src directory in JS/TS projects
  const jstsProject = ['react-typescript', 'nextjs', 'nestjs', 'express', 'vue-node'].includes(projectType);
  if (jstsProject && !dirs.includes('src') && !dirs.includes('app')) {
    improvements.push({
      type: 'create',
      description: 'Create src/ directory for source code organization',
      priority: 'high'
    });
  }
  
  // Check for mixed case directory names
  const mixedCaseDirs = dirs.filter(d => {
    const name = path.basename(d);
    return name !== name.toLowerCase() && !name.startsWith('.') && name !== 'README.md';
  });
  
  if (mixedCaseDirs.length > 0) {
    improvements.push({
      type: 'rename',
      description: `Consider using lowercase directory names for consistency: ${mixedCaseDirs.slice(0, 3).join(', ')}`,
      priority: 'low'
    });
  }
  
  // Check for test files outside tests directory
  const testFilesInSrc = files.filter(f => 
    (f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')) &&
    !f.startsWith('tests') && !f.startsWith('test')
  );
  
  if (testFilesInSrc.length > 5) {
    improvements.push({
      type: 'move',
      description: 'Consider moving test files to a dedicated tests/ directory',
      priority: 'low'
    });
  }
  
  return improvements;
}

/**
 * Calculate structure score
 */
function calculateStructureScore(
  missingHighPriorityDirs: number,
  missingHighPriorityFiles: number,
  highPriorityIssues: number
): number {
  let score = 100;
  
  // Deduct for missing high priority items
  score -= missingHighPriorityDirs * 10;
  score -= missingHighPriorityFiles * 5;
  score -= highPriorityIssues * 8;
  
  return Math.max(0, Math.min(100, score));
}

export { scanDirectory, getDirPurpose, getFilePurpose };
