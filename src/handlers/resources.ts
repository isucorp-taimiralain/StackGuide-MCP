/**
 * Resource Handlers - MCP Resource Readers
 * @version 3.4.0
 */

import { ProjectType, SUPPORTED_PROJECTS } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import * as ruleManager from '../services/ruleManager.js';
import * as webDocs from '../services/webDocumentation.js';
import { ServerState } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface ResourceContents {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

export interface ResourceInfo {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// ============================================================================
// Resource Readers
// ============================================================================

export function readRulesResource(uri: string): ResourceContents {
  const parts = uri.replace('rules://', '').split('/');
  const projectType = parts[0] as ProjectType;
  const rules = rulesProvider.getRulesForProject(projectType);
  const content = rules.map(r => `# ${r.name}\n\n${r.content}`).join('\n\n---\n\n');
  
  return {
    contents: [{
      uri,
      mimeType: 'text/markdown',
      text: content || 'No rules available for this project type.'
    }]
  };
}

export function readUserRulesResource(uri: string): ResourceContents {
  const parts = uri.replace('user-rules://', '').split('/');
  const projectType = parts[0] as ProjectType;
  const rules = ruleManager.getUserRules(projectType);
  const content = rules.map(r => 
    `# ${r.name}\n\n**Category:** ${r.category}\n**Description:** ${r.description}\n\n${r.content}`
  ).join('\n\n---\n\n');
  
  return {
    contents: [{
      uri,
      mimeType: 'text/markdown',
      text: content || 'No user rules available for this project type.'
    }]
  };
}

export function readKnowledgeResource(uri: string): ResourceContents {
  const parts = uri.replace('knowledge://', '').split('/');
  const projectType = parts[0] as ProjectType;
  const knowledge = knowledgeProvider.getKnowledgeForProject(projectType);
  const content = knowledge.map(k => `# ${k.name}\n\n${k.content}`).join('\n\n---\n\n');
  
  return {
    contents: [{
      uri,
      mimeType: 'text/markdown',
      text: content || 'No knowledge available for this project type.'
    }]
  };
}

export function readWebDocResource(uri: string): ResourceContents {
  const docId = uri.replace('web-doc://', '');
  const doc = webDocs.getWebDocumentById(docId);
  
  if (!doc) {
    return {
      contents: [{ uri, mimeType: 'text/plain', text: 'Web document not found in cache.' }]
    };
  }
  
  return {
    contents: [{
      uri,
      mimeType: 'text/markdown',
      text: `# ${doc.title}\n\n**Source:** ${doc.url}\n**Fetched:** ${doc.fetchedAt}\n\n---\n\n${doc.content}`
    }]
  };
}

export function readTemplatesResource(uri: string): ResourceContents {
  const templates = ruleManager.listTemplates();
  let content = '# Available Rule Templates\n\n';
  
  for (const t of templates) {
    content += `## ${t.name}\n\nTemplate ID: \`${t.id}\`\n\n`;
    const templateContent = ruleManager.getTemplateContent(t.id);
    if (templateContent) {
      content += '```markdown\n' + templateContent + '\n```\n\n---\n\n';
    }
  }
  
  return {
    contents: [{ uri, mimeType: 'text/markdown', text: content }]
  };
}

export function readActiveContextResource(uri: string, state: ServerState): ResourceContents {
  if (!state.activeProjectType) {
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: 'No active context. Use select_project_type tool to activate a project type.'
      }]
    };
  }
  
  const selectedRules = state.activeConfiguration?.selectedRules || [];
  const selectedKnowledge = state.activeConfiguration?.selectedKnowledge || [];
  const rulesContent = rulesProvider.getCombinedRulesContent(selectedRules);
  const knowledgeContent = knowledgeProvider.getCombinedKnowledgeContent(selectedKnowledge);
  
  const userRules = ruleManager.getUserRules(state.activeProjectType);
  const userRulesContent = userRules.length > 0
    ? userRules.map(r => `### ${r.name}\n\n${r.content}`).join('\n\n')
    : '';
  
  const webDocsList = webDocs.listCachedDocuments().filter(d => d.projectType === state.activeProjectType);
  const webDocsContent = webDocsList.length > 0
    ? webDocsList.map(d => {
        const fullDoc = webDocs.getWebDocumentById(d.id);
        return `### ${d.title}\n\n${fullDoc?.content || d.summary}`;
      }).join('\n\n')
    : '';
  
  const fullContext = `# Active Context: ${SUPPORTED_PROJECTS[state.activeProjectType].name}

## Selected Rules
${rulesContent || 'No rules selected.'}

## User Rules
${userRulesContent || 'No user rules.'}

## Selected Knowledge
${knowledgeContent || 'No knowledge selected.'}

## Web Documentation
${webDocsContent || 'No web documentation loaded.'}
`;
  
  return {
    contents: [{ uri, mimeType: 'text/markdown', text: fullContext }]
  };
}

// ============================================================================
// Resource Listing
// ============================================================================

export function listAllResources(): ResourceInfo[] {
  const resources: ResourceInfo[] = [];
  
  // Add resources for each project type with data
  const projectsWithRules = rulesProvider.getProjectTypesWithRules();
  const projectsWithKnowledge = knowledgeProvider.getProjectTypesWithKnowledge();
  
  for (const pt of projectsWithRules) {
    resources.push({
      uri: `rules://${pt}/all`,
      name: `${SUPPORTED_PROJECTS[pt]?.name || pt} - All Rules`,
      description: `All coding rules for ${pt} projects`,
      mimeType: 'text/markdown'
    });
    
    const userRules = ruleManager.getUserRules(pt as ProjectType);
    if (userRules.length > 0) {
      resources.push({
        uri: `user-rules://${pt}/all`,
        name: `${SUPPORTED_PROJECTS[pt]?.name || pt} - User Rules`,
        description: `User-created rules for ${pt} projects`,
        mimeType: 'text/markdown'
      });
    }
  }
  
  for (const pt of projectsWithKnowledge) {
    resources.push({
      uri: `knowledge://${pt}/all`,
      name: `${SUPPORTED_PROJECTS[pt]?.name || pt} - Knowledge Base`,
      description: `Knowledge base for ${pt} projects`,
      mimeType: 'text/markdown'
    });
  }
  
  // Web documents
  const webDocsList = webDocs.listCachedDocuments();
  for (const doc of webDocsList) {
    resources.push({
      uri: `web-doc://${doc.id}`,
      name: `Web: ${doc.title}`,
      description: `Fetched from ${doc.url}`,
      mimeType: 'text/markdown'
    });
  }
  
  // Active context
  resources.push({
    uri: 'context://active',
    name: 'Active Context',
    description: 'The currently active project context with selected rules and knowledge',
    mimeType: 'text/markdown'
  });
  
  // Templates
  resources.push({
    uri: 'templates://rules',
    name: 'Rule Templates',
    description: 'Available templates for creating new rules',
    mimeType: 'text/markdown'
  });
  
  return resources;
}

// ============================================================================
// Router-based Resource Handler
// ============================================================================

export function handleResourceRead(uri: string, state: ServerState): ResourceContents {
  if (uri.startsWith('rules://')) {
    return readRulesResource(uri);
  }
  
  if (uri.startsWith('user-rules://')) {
    return readUserRulesResource(uri);
  }
  
  if (uri.startsWith('knowledge://')) {
    return readKnowledgeResource(uri);
  }
  
  if (uri.startsWith('web-doc://')) {
    return readWebDocResource(uri);
  }
  
  if (uri === 'templates://rules') {
    return readTemplatesResource(uri);
  }
  
  if (uri === 'context://active') {
    return readActiveContextResource(uri, state);
  }
  
  return {
    contents: [{ uri, mimeType: 'text/plain', text: 'Resource not found' }]
  };
}
