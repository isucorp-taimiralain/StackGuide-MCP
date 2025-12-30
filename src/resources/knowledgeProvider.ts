import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeFile, KnowledgeCategory, ProjectType } from '../config/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data base path
const DATA_DIR = join(__dirname, '../../data');
const KNOWLEDGE_DIR = join(DATA_DIR, 'knowledge');

// Knowledge cache
const knowledgeCache: Map<ProjectType, KnowledgeFile[]> = new Map();

// Get knowledge for a project type
export function getKnowledgeForProject(projectType: ProjectType): KnowledgeFile[] {
  // Check cache
  if (knowledgeCache.has(projectType)) {
    return knowledgeCache.get(projectType)!;
  }
  
  const projectKnowledgeDir = join(KNOWLEDGE_DIR, projectType);
  
  if (!existsSync(projectKnowledgeDir)) {
    return [];
  }
  
  const knowledge: KnowledgeFile[] = [];
  
  try {
    const categories = readdirSync(projectKnowledgeDir, { withFileTypes: true });
    
    for (const category of categories) {
      if (category.isDirectory()) {
        const categoryPath = join(projectKnowledgeDir, category.name);
        const files = readdirSync(categoryPath).filter(f => f.endsWith('.md'));
        
        for (const file of files) {
          const filePath = join(categoryPath, file);
          const content = readFileSync(filePath, 'utf-8');
          const parsed = parseKnowledgeFile(
            content,
            file,
            filePath,
            category.name as KnowledgeCategory,
            projectType
          );
          if (parsed) {
            knowledge.push(parsed);
          }
        }
      } else if (category.name.endsWith('.md')) {
        const filePath = join(projectKnowledgeDir, category.name);
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseKnowledgeFile(
          content,
          category.name,
          filePath,
          'patterns',
          projectType
        );
        if (parsed) {
          knowledge.push(parsed);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading knowledge for ${projectType}:`, error);
  }
  
  // Save to cache
  knowledgeCache.set(projectType, knowledge);
  
  return knowledge;
}

// Parse knowledge file
function parseKnowledgeFile(
  content: string,
  filename: string,
  filepath: string,
  category: KnowledgeCategory,
  projectType: ProjectType
): KnowledgeFile | null {
  try {
    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1] : filename.replace('.md', '');
    
    // Extract description from first paragraph after title
    const descMatch = content.match(/^#[^\n]+\n+([^\n#]+)/m);
    const description = descMatch ? descMatch[1].trim() : '';
    
    return {
      id: `${projectType}-${category}-${filename.replace('.md', '')}`,
      name,
      path: filepath,
      projectType,
      category,
      description,
      content
    };
  } catch {
    return null;
  }
}

// Get knowledge file by ID
export function getKnowledgeById(knowledgeId: string): KnowledgeFile | null {
  // Parse the ID to get projectType
  const parts = knowledgeId.split('-');
  if (parts.length < 3) return null;
  
  const projectType = parts.slice(0, 2).join('-') as ProjectType;
  const knowledge = getKnowledgeForProject(projectType);
  
  return knowledge.find(k => k.id === knowledgeId) || null;
}

// Get knowledge by category
export function getKnowledgeByCategory(
  projectType: ProjectType,
  category: KnowledgeCategory
): KnowledgeFile[] {
  const knowledge = getKnowledgeForProject(projectType);
  return knowledge.filter(k => k.category === category);
}

// Get available categories
export function getAvailableKnowledgeCategories(projectType: ProjectType): KnowledgeCategory[] {
  const knowledge = getKnowledgeForProject(projectType);
  const categories = new Set(knowledge.map(k => k.category));
  return Array.from(categories);
}

// Search knowledge base
export function searchKnowledge(projectType: ProjectType, searchTerm: string): KnowledgeFile[] {
  const knowledge = getKnowledgeForProject(projectType);
  const term = searchTerm.toLowerCase();
  
  return knowledge.filter(k =>
    k.name.toLowerCase().includes(term) ||
    k.description.toLowerCase().includes(term) ||
    k.content.toLowerCase().includes(term)
  );
}

// Get combined content of selected knowledge
export function getCombinedKnowledgeContent(knowledgeIds: string[]): string {
  const contents: string[] = [];
  
  for (const knowledgeId of knowledgeIds) {
    const knowledge = getKnowledgeById(knowledgeId);
    if (knowledge) {
      contents.push(`## ${knowledge.name}\n\n${knowledge.content}`);
    }
  }
  
  return contents.join('\n\n---\n\n');
}

// Limpiar cache
export function clearKnowledgeCache(): void {
  knowledgeCache.clear();
}

// Listar todos los tipos de proyecto con conocimiento
export function getProjectTypesWithKnowledge(): ProjectType[] {
  if (!existsSync(KNOWLEDGE_DIR)) {
    return [];
  }
  
  return readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name as ProjectType);
}
