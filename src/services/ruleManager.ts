import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Rule, RuleCategory, ProjectType } from '../config/types.js';
import { getConfigPath } from '../config/persistence.js';

// User custom rules directory
const USER_RULES_DIR = join(getConfigPath(), 'rules');

// Rule templates
export const RULE_TEMPLATES: Record<string, { name: string; content: string }> = {
  'coding-standard': {
    name: 'Coding Standard Template',
    content: `# {{RULE_NAME}}

{{DESCRIPTION}}

## Main Rules

### 1. Primary Rule

Explanation of the rule...

\`\`\`{{LANGUAGE}}
// Code example
\`\`\`

### 2. Conventions

- Convention 1
- Convention 2

## Examples

### ✅ Correct

\`\`\`{{LANGUAGE}}
// Correct code
\`\`\`

### ❌ Incorrect

\`\`\`{{LANGUAGE}}
// Incorrect code
\`\`\`

## Checklist

- [ ] Verify item 1
- [ ] Verify item 2
`
  },
  'best-practice': {
    name: 'Best Practice Template',
    content: `# {{RULE_NAME}}

{{DESCRIPTION}}

## Why It Matters

Explanation of the importance...

## Implementation

### Step 1: Preparation

Instructions...

### Step 2: Execution

Instructions...

## Before and After

### Before (❌)

\`\`\`{{LANGUAGE}}
// Problematic code
\`\`\`

### After (✅)

\`\`\`{{LANGUAGE}}
// Improved code
\`\`\`

## Benefits

- Benefit 1
- Benefit 2
- Benefit 3
`
  },
  'security': {
    name: 'Security Guideline Template',
    content: `# {{RULE_NAME}}

⚠️ **Risk Level**: High/Medium/Low

{{DESCRIPTION}}

## Vulnerability

Description of the security issue...

## Impact

What can happen if not implemented?

- Impact 1
- Impact 2

## Vulnerable Code

\`\`\`{{LANGUAGE}}
// ❌ Vulnerable code
\`\`\`

## Secure Solution

\`\`\`{{LANGUAGE}}
// ✅ Secure code
\`\`\`

## Verification

- [ ] Verification step 1
- [ ] Verification step 2

## References

- [OWASP](https://owasp.org)
`
  },
  'architecture': {
    name: 'Architecture Pattern Template',
    content: `# {{RULE_NAME}}

{{DESCRIPTION}}

## Diagram

\`\`\`
┌─────────────┐     ┌─────────────┐
│  Component  │────▶│  Component  │
└─────────────┘     └─────────────┘
\`\`\`

## Components

### Component 1

Description and responsibilities...

### Component 2

Description and responsibilities...

## Implementation

\`\`\`{{LANGUAGE}}
// Implementation code
\`\`\`

## When to Use

- Use case 1
- Use case 2

## When NOT to Use

- Anti-pattern 1
- Anti-pattern 2
`
  },
  'testing': {
    name: 'Testing Guideline Template',
    content: `# {{RULE_NAME}}

{{DESCRIPTION}}

## Test Types

### Unit Tests

\`\`\`{{LANGUAGE}}
// Unit test example
\`\`\`

### Integration Tests

\`\`\`{{LANGUAGE}}
// Integration test example
\`\`\`

## Naming Conventions

- Test names: \`should_ExpectedBehavior_When_Condition\`
- Files: \`*.test.ts\` or \`*.spec.ts\`

## Minimum Coverage

| Type | Minimum |
|------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

## Mocking

\`\`\`{{LANGUAGE}}
// Mock example
\`\`\`
`
  }
};

// Ensure user rules directory exists
function ensureUserRulesDir(projectType: ProjectType): string {
  const dir = join(USER_RULES_DIR, projectType);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Create user rule
export function createUserRule(
  projectType: ProjectType,
  category: RuleCategory,
  name: string,
  content: string,
  description: string = ''
): Rule {
  const dir = ensureUserRulesDir(projectType);
  const id = `user-${projectType}-${category}-${slugify(name)}`;
  const filename = `${slugify(name)}.json`;
  const filepath = join(dir, filename);
  
  const rule: Rule & { category: RuleCategory; projectType: ProjectType } = {
    id,
    name,
    category,
    description,
    content,
    enabled: true,
    priority: 100, // High priority for user rules
    projectType
  } as any;
  
  writeFileSync(filepath, JSON.stringify(rule, null, 2));
  
  return rule;
}

// Create rule from template
export function createRuleFromTemplate(
  projectType: ProjectType,
  category: RuleCategory,
  templateId: string,
  name: string,
  description: string,
  language: string = 'typescript'
): Rule | null {
  const template = RULE_TEMPLATES[templateId];
  if (!template) return null;
  
  let content = template.content
    .replace(/\{\{RULE_NAME\}\}/g, name)
    .replace(/\{\{DESCRIPTION\}\}/g, description)
    .replace(/\{\{LANGUAGE\}\}/g, language);
  
  return createUserRule(projectType, category, name, content, description);
}

// Get user rules
export function getUserRules(projectType: ProjectType): Rule[] {
  const dir = join(USER_RULES_DIR, projectType);
  
  if (!existsSync(dir)) {
    return [];
  }
  
  const rules: Rule[] = [];
  
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        const rule = JSON.parse(content) as Rule;
        rules.push(rule);
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist or error reading
  }
  
  return rules;
}

// Update user rule
export function updateUserRule(
  ruleId: string,
  updates: Partial<Pick<Rule, 'name' | 'content' | 'description' | 'enabled' | 'priority'>>
): Rule | null {
  // Parsear el ID para encontrar la regla
  if (!ruleId.startsWith('user-')) return null;
  
  const parts = ruleId.split('-');
  const projectType = parts.slice(1, 3).join('-') as ProjectType;
  const dir = join(USER_RULES_DIR, projectType);
  
  if (!existsSync(dir)) return null;
  
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filepath = join(dir, file);
    try {
      const content = readFileSync(filepath, 'utf-8');
      const rule = JSON.parse(content) as Rule;
      
      if (rule.id === ruleId) {
        const updated = { ...rule, ...updates };
        writeFileSync(filepath, JSON.stringify(updated, null, 2));
        return updated;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// Delete user rule
export function deleteUserRule(ruleId: string): boolean {
  if (!ruleId.startsWith('user-')) return false;
  
  const parts = ruleId.split('-');
  const projectType = parts.slice(1, 3).join('-') as ProjectType;
  const dir = join(USER_RULES_DIR, projectType);
  
  if (!existsSync(dir)) return false;
  
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filepath = join(dir, file);
    try {
      const content = readFileSync(filepath, 'utf-8');
      const rule = JSON.parse(content) as Rule;
      
      if (rule.id === ruleId) {
        unlinkSync(filepath);
        return true;
      }
    } catch {
      continue;
    }
  }
  
  return false;
}

// List available templates
export function listTemplates(): { id: string; name: string }[] {
  return Object.entries(RULE_TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name
  }));
}

// Get template content
export function getTemplateContent(templateId: string): string | null {
  return RULE_TEMPLATES[templateId]?.content || null;
}

// Helper: slugify
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Export all user rules
export function exportAllUserRules(): string {
  const allRules: Record<string, Rule[]> = {};
  
  if (!existsSync(USER_RULES_DIR)) {
    return JSON.stringify(allRules, null, 2);
  }
  
  const projectTypes = readdirSync(USER_RULES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const pt of projectTypes) {
    allRules[pt] = getUserRules(pt as ProjectType);
  }
  
  return JSON.stringify(allRules, null, 2);
}

// Import user rules
export function importUserRules(jsonString: string): number {
  try {
    const data = JSON.parse(jsonString) as Record<string, Rule[]>;
    let count = 0;
    
    for (const [projectType, rules] of Object.entries(data)) {
      for (const rule of rules) {
        createUserRule(
          projectType as ProjectType,
          rule.category,
          rule.name,
          rule.content,
          rule.description
        );
        count++;
      }
    }
    
    return count;
  } catch {
    return 0;
  }
}
