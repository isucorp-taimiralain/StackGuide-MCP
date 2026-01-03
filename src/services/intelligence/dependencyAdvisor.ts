/**
 * Dependency Advisor
 * Analyzes project dependencies and provides recommendations
 * @version 3.3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  DependencyAnalysis,
  DependencyInfo,
  OutdatedPackage,
  VulnerabilityInfo,
  DependencyRecommendation
} from './types.js';
import { getFrameworkTemplate } from './templates.js';

/**
 * Analyze project dependencies
 */
export function analyzeDependencies(projectPath: string, projectType: string): DependencyAnalysis {
  const packageManager = detectPackageManager(projectPath);
  const dependencies = extractDependencies(projectPath, packageManager);
  
  const directDependencies = dependencies.filter(d => d.type === 'production');
  const devDependencies = dependencies.filter(d => d.type === 'dev');
  
  // Get recommended dependencies for this project type
  const template = getFrameworkTemplate(projectType);
  const recommendedAdditions = findMissingRecommendations(
    dependencies,
    template?.recommendedDependencies || [],
    projectType
  );
  
  // Find potentially unnecessary dependencies
  const unnecessaryDependencies = findUnnecessaryDependencies(dependencies, projectType);
  
  // Calculate dependency score
  const dependencyScore = calculateDependencyScore(
    dependencies.length,
    recommendedAdditions.filter(r => r.priority === 'high').length,
    unnecessaryDependencies.length
  );
  
  return {
    packageManager,
    totalDependencies: dependencies.length,
    directDependencies,
    devDependencies,
    outdatedPackages: [], // Would require npm outdated or similar
    vulnerabilities: [], // Would require npm audit or similar
    recommendedAdditions,
    unnecessaryDependencies,
    dependencyScore
  };
}

/**
 * Detect package manager used in project
 */
function detectPackageManager(projectPath: string): DependencyAnalysis['packageManager'] {
  // Check lock files
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
  
  // Python
  if (fs.existsSync(path.join(projectPath, 'poetry.lock'))) return 'poetry';
  if (fs.existsSync(path.join(projectPath, 'Pipfile.lock'))) return 'pip';
  if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) return 'pip';
  
  // Rust
  if (fs.existsSync(path.join(projectPath, 'Cargo.lock'))) return 'cargo';
  
  // Go
  if (fs.existsSync(path.join(projectPath, 'go.sum'))) return 'go';
  
  // Ruby
  if (fs.existsSync(path.join(projectPath, 'Gemfile.lock'))) return 'bundler';
  
  // PHP
  if (fs.existsSync(path.join(projectPath, 'composer.lock'))) return 'composer';
  
  // Default to npm if package.json exists
  if (fs.existsSync(path.join(projectPath, 'package.json'))) return 'npm';
  
  return 'unknown';
}

/**
 * Extract dependencies from project files
 */
function extractDependencies(
  projectPath: string,
  packageManager: DependencyAnalysis['packageManager']
): DependencyInfo[] {
  const dependencies: DependencyInfo[] = [];
  
  if (['npm', 'yarn', 'pnpm'].includes(packageManager)) {
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        
        // Production dependencies
        for (const [name, version] of Object.entries(pkg.dependencies || {})) {
          dependencies.push({
            name,
            version: String(version),
            type: 'production'
          });
        }
        
        // Dev dependencies
        for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
          dependencies.push({
            name,
            version: String(version),
            type: 'dev'
          });
        }
        
        // Peer dependencies
        for (const [name, version] of Object.entries(pkg.peerDependencies || {})) {
          dependencies.push({
            name,
            version: String(version),
            type: 'peer'
          });
        }
        
        // Optional dependencies
        for (const [name, version] of Object.entries(pkg.optionalDependencies || {})) {
          dependencies.push({
            name,
            version: String(version),
            type: 'optional'
          });
        }
      } catch {
        // Invalid package.json
      }
    }
  } else if (packageManager === 'pip' || packageManager === 'poetry') {
    // Try requirements.txt
    const reqPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const content = fs.readFileSync(reqPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
          
          // Parse package==version or package>=version etc.
          const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~]+(.+))?$/);
          if (match) {
            dependencies.push({
              name: match[1],
              version: match[2] || '*',
              type: 'production'
            });
          }
        }
      } catch {
        // Invalid file
      }
    }
    
    // Try pyproject.toml
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        // Simple TOML parsing for dependencies
        const depsMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depsMatch) {
          const depsSection = depsMatch[1];
          const lines = depsSection.split('\n');
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["\']?([^"'\s]+)/);
            if (match && match[1] !== 'python') {
              dependencies.push({
                name: match[1],
                version: match[2],
                type: 'production'
              });
            }
          }
        }
      } catch {
        // Invalid file
      }
    }
  } else if (packageManager === 'cargo') {
    const cargoPath = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        // Simple TOML parsing for dependencies
        const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depsMatch) {
          const depsSection = depsMatch[1];
          const lines = depsSection.split('\n');
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["\']?([^"'\s]+)/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2],
                type: 'production'
              });
            }
          }
        }
        
        // Dev dependencies
        const devDepsMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/);
        if (devDepsMatch) {
          const depsSection = devDepsMatch[1];
          const lines = depsSection.split('\n');
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["\']?([^"'\s]+)/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2],
                type: 'dev'
              });
            }
          }
        }
      } catch {
        // Invalid file
      }
    }
  } else if (packageManager === 'go') {
    const goModPath = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf-8');
        const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
        if (requireMatch) {
          const requires = requireMatch[1];
          const lines = requires.split('\n');
          for (const line of lines) {
            const match = line.trim().match(/^([^\s]+)\s+([^\s]+)/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2],
                type: 'production'
              });
            }
          }
        }
      } catch {
        // Invalid file
      }
    }
  }
  
  return dependencies;
}

/**
 * Find missing recommended dependencies
 */
function findMissingRecommendations(
  existing: DependencyInfo[],
  recommended: DependencyRecommendation[],
  projectType: string
): DependencyRecommendation[] {
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
  const missing: DependencyRecommendation[] = [];
  
  for (const rec of recommended) {
    if (!existingNames.has(rec.name.toLowerCase())) {
      missing.push(rec);
    }
  }
  
  // Add common recommendations based on what's missing
  const jstsProject = ['react-typescript', 'nextjs', 'nestjs', 'express', 'vue-node', 'react-node'].includes(projectType);
  
  if (jstsProject) {
    // Check for linting
    if (!existingNames.has('eslint')) {
      missing.push({
        name: 'eslint',
        reason: 'Code linting and quality',
        category: 'linting',
        priority: 'high'
      });
    }
    
    // Check for formatting
    if (!existingNames.has('prettier')) {
      missing.push({
        name: 'prettier',
        reason: 'Code formatting',
        category: 'dx',
        priority: 'high'
      });
    }
    
    // Check for testing
    const hasVitest = existingNames.has('vitest');
    const hasJest = existingNames.has('jest');
    if (!hasVitest && !hasJest) {
      missing.push({
        name: 'vitest',
        reason: 'Fast unit testing',
        category: 'testing',
        priority: 'high'
      });
    }
    
    // Check for TypeScript
    if (!existingNames.has('typescript')) {
      missing.push({
        name: 'typescript',
        reason: 'Type safety and better IDE support',
        category: 'types',
        priority: 'high'
      });
    }
  }
  
  // Python projects
  const pythonProject = ['python-django', 'python-fastapi', 'python-flask'].includes(projectType);
  if (pythonProject) {
    if (!existingNames.has('pytest')) {
      missing.push({
        name: 'pytest',
        reason: 'Testing framework',
        category: 'testing',
        priority: 'high'
      });
    }
    
    if (!existingNames.has('black') && !existingNames.has('ruff')) {
      missing.push({
        name: 'ruff',
        reason: 'Fast Python linter and formatter',
        category: 'linting',
        priority: 'high'
      });
    }
    
    if (!existingNames.has('mypy')) {
      missing.push({
        name: 'mypy',
        reason: 'Static type checking',
        category: 'types',
        priority: 'medium'
      });
    }
  }
  
  return missing;
}

/**
 * Find potentially unnecessary dependencies
 */
function findUnnecessaryDependencies(
  dependencies: DependencyInfo[],
  projectType: string
): string[] {
  const unnecessary: string[] = [];
  const depNames = new Set(dependencies.map(d => d.name.toLowerCase()));
  
  // Check for deprecated or redundant packages
  const deprecatedPackages: Record<string, string> = {
    'tslint': 'Use ESLint with @typescript-eslint instead',
    'node-sass': 'Use sass (Dart Sass) instead',
    'request': 'Use axios, node-fetch, or undici instead',
    'moment': 'Consider date-fns or dayjs for smaller bundle',
    'lodash': 'Consider using native ES methods or lodash-es',
    'underscore': 'Consider using native ES methods',
    'bluebird': 'Native Promises are now sufficient',
    'left-pad': 'Use String.prototype.padStart',
    'is-odd': 'Use n % 2 !== 0',
    'is-even': 'Use n % 2 === 0'
  };
  
  for (const dep of dependencies) {
    const lowerName = dep.name.toLowerCase();
    if (deprecatedPackages[lowerName]) {
      unnecessary.push(`${dep.name} - ${deprecatedPackages[lowerName]}`);
    }
  }
  
  // Check for duplicate functionality
  if (depNames.has('axios') && depNames.has('node-fetch')) {
    unnecessary.push('Multiple HTTP clients (axios and node-fetch) - consider using just one');
  }
  
  if (depNames.has('moment') && depNames.has('date-fns')) {
    unnecessary.push('Multiple date libraries (moment and date-fns) - consider using just one');
  }
  
  if (depNames.has('jest') && depNames.has('vitest') && depNames.has('mocha')) {
    unnecessary.push('Multiple test runners - consider standardizing on one');
  }
  
  return unnecessary;
}

/**
 * Calculate dependency health score
 */
function calculateDependencyScore(
  totalDeps: number,
  missingHighPriority: number,
  unnecessaryCount: number
): number {
  let score = 100;
  
  // Deduct for missing high priority dependencies
  score -= missingHighPriority * 10;
  
  // Deduct for unnecessary dependencies
  score -= unnecessaryCount * 5;
  
  // Slight deduction for too many dependencies (complexity)
  if (totalDeps > 50) {
    score -= Math.min(15, (totalDeps - 50) * 0.5);
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate install command for missing dependencies
 */
export function generateInstallCommand(
  recommendations: DependencyRecommendation[],
  packageManager: DependencyAnalysis['packageManager'],
  asDev = false
): string {
  if (recommendations.length === 0) return '';
  
  const packages = recommendations.map(r => r.name).join(' ');
  
  switch (packageManager) {
    case 'npm':
      return `npm install ${asDev ? '-D' : ''} ${packages}`;
    case 'yarn':
      return `yarn add ${asDev ? '-D' : ''} ${packages}`;
    case 'pnpm':
      return `pnpm add ${asDev ? '-D' : ''} ${packages}`;
    case 'pip':
    case 'poetry':
      return `pip install ${packages}`;
    case 'cargo':
      return `cargo add ${packages}`;
    case 'go':
      return recommendations.map(r => `go get ${r.name}`).join(' && ');
    default:
      return `# Install: ${packages}`;
  }
}

export { detectPackageManager, extractDependencies };
