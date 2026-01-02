/**
 * Health Weights Configuration
 * 
 * Externalized scoring weights for project health analysis.
 * Can be overridden per-project via stackguide.config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface CategoryWeight {
  name: string;
  maxScore: number;
  description: string;
}

export interface IssueWeights {
  critical: number;
  error: number;
  warning: number;
  info: number;
  suggestion: number;
}

export interface HealthWeightsConfig {
  version: string;
  
  // Category weights (must sum to 100)
  categories: {
    configuration: CategoryWeight;
    codeQuality: CategoryWeight;
    structure: CategoryWeight;
    documentation: CategoryWeight;
    testing: CategoryWeight;
  };
  
  // Issue deductions within categories
  issueWeights: IssueWeights;
  
  // Grade thresholds
  gradeThresholds: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
  
  // Category-specific bonuses
  bonuses: {
    hasTypeScript: number;
    hasLinter: number;
    hasPrettier: number;
    hasCI: number;
    hasTests: number;
    hasReadme: number;
    hasLicense: number;
    hasContributing: number;
  };
  
  // Penalties
  penalties: {
    noPackageLock: number;
    hasSecurityIssues: number;
    outdatedDependencies: number;
  };
}

/**
 * Default health weights configuration
 */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeightsConfig = {
  version: '1.0.0',
  
  categories: {
    configuration: {
      name: 'Configuration',
      maxScore: 20,
      description: 'Project setup, dependencies, and tooling configuration'
    },
    codeQuality: {
      name: 'Code Quality',
      maxScore: 30,
      description: 'Code analysis results, patterns, and best practices'
    },
    structure: {
      name: 'Structure',
      maxScore: 20,
      description: 'Project organization, file structure, and architecture'
    },
    documentation: {
      name: 'Documentation',
      maxScore: 15,
      description: 'README, inline docs, and API documentation'
    },
    testing: {
      name: 'Testing',
      maxScore: 15,
      description: 'Test coverage, test structure, and test quality'
    }
  },
  
  issueWeights: {
    critical: 10,
    error: 5,
    warning: 2,
    info: 0.5,
    suggestion: 0.25
  },
  
  gradeThresholds: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0
  },
  
  bonuses: {
    hasTypeScript: 5,
    hasLinter: 3,
    hasPrettier: 2,
    hasCI: 3,
    hasTests: 5,
    hasReadme: 2,
    hasLicense: 1,
    hasContributing: 1
  },
  
  penalties: {
    noPackageLock: 2,
    hasSecurityIssues: 10,
    outdatedDependencies: 3
  }
};

const CONFIG_FILE_NAME = 'stackguide.config.json';

/**
 * Read project-specific weight overrides
 */
export function loadProjectWeights(projectPath: string): Partial<HealthWeightsConfig> | null {
  const configPath = path.join(projectPath, CONFIG_FILE_NAME);
  
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      if (config.healthWeights) {
        logger.debug('Loaded project health weights', { projectPath });
        return config.healthWeights;
      }
    }
  } catch (error) {
    logger.debug('Failed to load project health weights', { error });
  }
  
  return null;
}

/**
 * Merge default weights with project overrides
 */
export function getHealthWeights(projectPath: string): HealthWeightsConfig {
  const projectWeights = loadProjectWeights(projectPath);
  
  if (!projectWeights) {
    return DEFAULT_HEALTH_WEIGHTS;
  }
  
  // Deep merge with defaults
  return {
    ...DEFAULT_HEALTH_WEIGHTS,
    ...projectWeights,
    categories: {
      ...DEFAULT_HEALTH_WEIGHTS.categories,
      ...projectWeights.categories
    },
    issueWeights: {
      ...DEFAULT_HEALTH_WEIGHTS.issueWeights,
      ...projectWeights.issueWeights
    },
    gradeThresholds: {
      ...DEFAULT_HEALTH_WEIGHTS.gradeThresholds,
      ...projectWeights.gradeThresholds
    },
    bonuses: {
      ...DEFAULT_HEALTH_WEIGHTS.bonuses,
      ...projectWeights.bonuses
    },
    penalties: {
      ...DEFAULT_HEALTH_WEIGHTS.penalties,
      ...projectWeights.penalties
    }
  };
}

/**
 * Validate that category weights sum to 100
 */
export function validateWeights(weights: HealthWeightsConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check category sum
  const categorySum = Object.values(weights.categories).reduce(
    (sum, cat) => sum + cat.maxScore, 
    0
  );
  
  if (categorySum !== 100) {
    errors.push(`Category weights must sum to 100, got ${categorySum}`);
  }
  
  // Check grade thresholds are in descending order
  const thresholds = weights.gradeThresholds;
  if (thresholds.A <= thresholds.B || 
      thresholds.B <= thresholds.C || 
      thresholds.C <= thresholds.D) {
    errors.push('Grade thresholds must be in descending order (A > B > C > D > F)');
  }
  
  // Check for negative values
  for (const [key, value] of Object.entries(weights.issueWeights)) {
    if (value < 0) {
      errors.push(`Issue weight "${key}" cannot be negative`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get grade from score using weights config
 */
export function getGradeFromScore(score: number, weights: HealthWeightsConfig): string {
  const { gradeThresholds } = weights;
  
  if (score >= gradeThresholds.A) return 'A';
  if (score >= gradeThresholds.B) return 'B';
  if (score >= gradeThresholds.C) return 'C';
  if (score >= gradeThresholds.D) return 'D';
  return 'F';
}

/**
 * Calculate issue deduction based on weights
 */
export function calculateIssueDeduction(
  issueType: keyof IssueWeights,
  count: number,
  weights: HealthWeightsConfig
): number {
  return weights.issueWeights[issueType] * count;
}

/**
 * Generate sample config file content
 */
export function generateSampleConfig(): string {
  const sample = {
    "$schema": "https://stackguide.dev/schema/config.json",
    "healthWeights": {
      "categories": {
        "testing": {
          "maxScore": 20,
          "description": "Increased testing weight for this project"
        }
      },
      "issueWeights": {
        "critical": 15,
        "error": 7
      },
      "gradeThresholds": {
        "A": 95
      }
    }
  };
  
  return JSON.stringify(sample, null, 2);
}

/**
 * Get weights documentation as markdown
 */
export function getWeightsDocumentation(weights: HealthWeightsConfig): string {
  const lines = [
    '# Health Score Weights',
    '',
    '## Categories',
    ''
  ];
  
  for (const [key, cat] of Object.entries(weights.categories)) {
    lines.push(`### ${cat.name} (${cat.maxScore} points)`);
    lines.push(cat.description);
    lines.push('');
  }
  
  lines.push('## Issue Deductions');
  lines.push('');
  lines.push('| Severity | Points Deducted |');
  lines.push('|----------|-----------------|');
  for (const [key, value] of Object.entries(weights.issueWeights)) {
    lines.push(`| ${key} | -${value} |`);
  }
  lines.push('');
  
  lines.push('## Grade Thresholds');
  lines.push('');
  lines.push('| Grade | Minimum Score |');
  lines.push('|-------|---------------|');
  for (const [grade, threshold] of Object.entries(weights.gradeThresholds)) {
    lines.push(`| ${grade} | ${threshold}+ |`);
  }
  lines.push('');
  
  lines.push('## Bonuses');
  lines.push('');
  for (const [key, value] of Object.entries(weights.bonuses)) {
    lines.push(`- ${key}: +${value} points`);
  }
  
  return lines.join('\n');
}
