import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Rule, RuleCategory, ProjectType } from '../config/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data base path
const DATA_DIR = join(__dirname, '../../data');
const RULES_DIR = join(DATA_DIR, 'rules');

// Rules cache
const rulesCache: Map<ProjectType, Rule[]> = new Map();

// Get rules for a project type
export function getRulesForProject(projectType: ProjectType): Rule[] {
  // Check cache
  if (rulesCache.has(projectType)) {
    return rulesCache.get(projectType)!;
  }
  
  const projectRulesDir = join(RULES_DIR, projectType);
  
  if (!existsSync(projectRulesDir)) {
    return [];
  }
  
  const rules: Rule[] = [];
  
  try {
    const categories = readdirSync(projectRulesDir, { withFileTypes: true });
    
    for (const category of categories) {
      if (category.isDirectory()) {
        const categoryPath = join(projectRulesDir, category.name);
        const files = readdirSync(categoryPath).filter(f => f.endsWith('.md'));
        
        for (const file of files) {
          const filePath = join(categoryPath, file);
          const content = readFileSync(filePath, 'utf-8');
          const parsed = parseRuleFile(content, file, category.name as RuleCategory, projectType);
          if (parsed) {
            rules.push(parsed);
          }
        }
      } else if (category.name.endsWith('.md')) {
        // Files directly in the project directory
        const filePath = join(projectRulesDir, category.name);
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseRuleFile(content, category.name, 'best-practices', projectType);
        if (parsed) {
          rules.push(parsed);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading rules for ${projectType}:`, error);
  }
  
  // Save to cache
  rulesCache.set(projectType, rules);
  
  return rules;
}

// Parse rule file
function parseRuleFile(
  content: string,
  filename: string,
  category: RuleCategory,
  projectType: ProjectType
): Rule | null {
  try {
    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1] : filename.replace('.md', '');
    
    // Extract description from first paragraph after title
    const descMatch = content.match(/^#[^\n]+\n+([^\n#]+)/m);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Extract priority from frontmatter if present
    const priorityMatch = content.match(/priority:\s*(\d+)/);
    const priority = priorityMatch ? parseInt(priorityMatch[1]) : 50;
    
    return {
      id: `${projectType}-${category}-${filename.replace('.md', '')}`,
      name,
      category,
      description,
      content,
      enabled: true,
      priority
    };
  } catch {
    return null;
  }
}

// Get rule by ID
export function getRuleById(ruleId: string): Rule | null {
  // Parse the ID to get projectType
  const parts = ruleId.split('-');
  if (parts.length < 3) return null;
  
  // Reconstruct projectType (may contain hyphens)
  const projectType = parts.slice(0, 2).join('-') as ProjectType;
  const rules = getRulesForProject(projectType);
  
  return rules.find(r => r.id === ruleId) || null;
}

// Get all rules by category
export function getRulesByCategory(projectType: ProjectType, category: RuleCategory): Rule[] {
  const rules = getRulesForProject(projectType);
  return rules.filter(r => r.category === category);
}

// Get available categories for a project
export function getAvailableCategories(projectType: ProjectType): RuleCategory[] {
  const rules = getRulesForProject(projectType);
  const categories = new Set(rules.map(r => r.category));
  return Array.from(categories);
}

// Search rules by term
export function searchRules(projectType: ProjectType, searchTerm: string): Rule[] {
  const rules = getRulesForProject(projectType);
  const term = searchTerm.toLowerCase();
  
  return rules.filter(r => 
    r.name.toLowerCase().includes(term) ||
    r.description.toLowerCase().includes(term) ||
    r.content.toLowerCase().includes(term)
  );
}

// Get combined content of selected rules
export function getCombinedRulesContent(ruleIds: string[]): string {
  const contents: string[] = [];
  
  for (const ruleId of ruleIds) {
    const rule = getRuleById(ruleId);
    if (rule) {
      contents.push(`## ${rule.name}\n\n${rule.content}`);
    }
  }
  
  return contents.join('\n\n---\n\n');
}

// Clear cache
export function clearRulesCache(): void {
  rulesCache.clear();
}

// List all project types with rules
export function getProjectTypesWithRules(): ProjectType[] {
  if (!existsSync(RULES_DIR)) {
    return [];
  }
  
  return readdirSync(RULES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name as ProjectType);
}
