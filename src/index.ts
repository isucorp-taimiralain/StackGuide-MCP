#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ProjectType, SUPPORTED_PROJECTS, ServerState, RuleCategory } from './config/types.js';
import * as persistence from './config/persistence.js';
import * as rulesProvider from './resources/rulesProvider.js';
import * as knowledgeProvider from './resources/knowledgeProvider.js';
import * as ruleManager from './services/ruleManager.js';
import * as webDocs from './services/webDocumentation.js';
import * as cursorDirectory from './services/cursorDirectory.js';
import * as autoDetect from './services/autoDetect.js';

// Server state
const serverState: ServerState = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: []
};

// Create MCP server
const server = new Server(
  {
    name: 'stackguide-mcp',
    version: '1.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ==================== TOOLS ====================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ==================== CORE TOOLS (5) ====================
      {
        name: 'setup',
        description: 'Configure StackGuide for your project. Auto-detects project type or lets you specify one manually.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Project path (default: current directory)'
            },
            type: {
              type: 'string',
              description: 'Project type to use (auto-detected if not specified)',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: []
        }
      },
      {
        name: 'context',
        description: 'Get current context with all loaded rules and knowledge. Use this to see what StackGuide has configured.',
        inputSchema: {
          type: 'object',
          properties: {
            full: {
              type: 'boolean',
              description: 'Include full rule/knowledge content (default: false, shows summary)'
            }
          },
          required: []
        }
      },
      {
        name: 'rules',
        description: 'Manage rules: list, search, get, or select rules for your project.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['list', 'search', 'get', 'select']
            },
            query: {
              type: 'string',
              description: 'Search term or rule ID (for search/get actions)'
            },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Rule IDs to select (for select action)'
            },
            category: {
              type: 'string',
              description: 'Filter by category',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing']
            }
          },
          required: []
        }
      },
      {
        name: 'knowledge',
        description: 'Manage knowledge base: list, search, or get architecture patterns and solutions.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['list', 'search', 'get']
            },
            query: {
              type: 'string',
              description: 'Search term or knowledge ID'
            },
            category: {
              type: 'string',
              description: 'Filter by category',
              enum: ['patterns', 'common-issues', 'architecture', 'workflows']
            }
          },
          required: []
        }
      },
      {
        name: 'review',
        description: 'Review code against active rules. Reviews local files, URLs, or your entire project.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path to review'
            },
            url: {
              type: 'string',
              description: 'URL to fetch and review'
            },
            project: {
              type: 'boolean',
              description: 'Review entire project structure'
            },
            focus: {
              type: 'string',
              description: 'Focus area for review',
              enum: ['all', 'security', 'performance', 'architecture', 'coding-standards']
            }
          },
          required: []
        }
      },
      
      // ==================== CURSOR DIRECTORY (2) ====================
      {
        name: 'cursor',
        description: 'Browse, search, and import rules from cursor.directory community.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['browse', 'search', 'popular', 'import', 'categories']
            },
            query: {
              type: 'string',
              description: 'Category to browse or search term'
            },
            slug: {
              type: 'string',
              description: 'Rule slug for import'
            }
          },
          required: []
        }
      },
      
      // ==================== DOCS (1) ====================
      {
        name: 'docs',
        description: 'Fetch and manage web documentation. Fetch URLs, search cached docs, or list available.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['fetch', 'search', 'list', 'get', 'remove', 'suggest']
            },
            url: {
              type: 'string',
              description: 'URL to fetch or document ID'
            },
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Multiple URLs to fetch'
            },
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: []
        }
      },
      
      // ==================== CONFIG (1) ====================
      {
        name: 'config',
        description: 'Manage saved configurations: save, load, list, delete, export, or import.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['save', 'load', 'list', 'delete', 'export', 'import']
            },
            name: {
              type: 'string',
              description: 'Configuration name (for save)'
            },
            id: {
              type: 'string',
              description: 'Configuration ID (for load/delete/export)'
            },
            json: {
              type: 'string',
              description: 'JSON string (for import)'
            }
          },
          required: []
        }
      },
      
      // ==================== CUSTOM RULES (1) ====================
      {
        name: 'custom_rule',
        description: 'Create, update, delete, or list custom rules for your project.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['create', 'update', 'delete', 'list', 'export', 'import']
            },
            name: {
              type: 'string',
              description: 'Rule name'
            },
            content: {
              type: 'string',
              description: 'Rule content in markdown'
            },
            category: {
              type: 'string',
              description: 'Rule category',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing']
            },
            id: {
              type: 'string',
              description: 'Rule ID (for update/delete)'
            },
            json: {
              type: 'string',
              description: 'JSON string (for import)'
            }
          },
          required: []
        }
      },
      
      // ==================== HELP (1) ====================
      {
        name: 'help',
        description: 'Get help about StackGuide tools and how to use them.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Help topic',
              enum: ['setup', 'rules', 'review', 'cursor', 'docs', 'config', 'all']
            }
          },
          required: []
        }
      }
    ]
  };
});

// Handler para ejecutar tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      // ==================== UNIFIED TOOLS ====================
      
      case 'setup': {
        const { path: projectPath = '.', type: projectType } = args as { path?: string; type?: ProjectType };
        const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;
        
        // If type is specified, use it directly
        if (projectType && SUPPORTED_PROJECTS[projectType]) {
          const project = SUPPORTED_PROJECTS[projectType];
          serverState.activeProjectType = projectType;
          serverState.loadedRules = rulesProvider.getRulesForProject(projectType);
          serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(projectType);
          serverState.activeConfiguration = {
            id: `setup-${projectType}-${Date.now()}`,
            name: `${project.name} Configuration`,
            projectType,
            selectedRules: serverState.loadedRules.map(r => r.id),
            selectedKnowledge: serverState.loadedKnowledge.map(k => k.id),
            customRules: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `✅ Configured for ${project.name}`,
                projectType,
                rulesLoaded: serverState.loadedRules.length,
                knowledgeLoaded: serverState.loadedKnowledge.length,
                nextSteps: ['Use "context" to see loaded rules', 'Use "review" to analyze your code']
              }, null, 2)
            }]
          };
        }
        
        // Auto-detect project type
        const detection = autoDetect.detectProjectType(resolvedPath);
        
        if (!detection.detected || !detection.projectType) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Could not auto-detect project type',
                hint: 'Use setup with type parameter: setup type:"react-typescript"',
                availableTypes: Object.keys(SUPPORTED_PROJECTS)
              }, null, 2)
            }]
          };
        }
        
        const detectedType = detection.projectType as ProjectType;
        const project = SUPPORTED_PROJECTS[detectedType];
        
        serverState.activeProjectType = detectedType;
        serverState.loadedRules = rulesProvider.getRulesForProject(detectedType);
        serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(detectedType);
        serverState.activeConfiguration = {
          id: `auto-${detectedType}-${Date.now()}`,
          name: `Auto - ${project.name}`,
          projectType: detectedType,
          selectedRules: serverState.loadedRules.map(r => r.id),
          selectedKnowledge: serverState.loadedKnowledge.map(k => k.id),
          customRules: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `✅ Auto-configured for ${project.name}`,
              detection: {
                projectType: detectedType,
                confidence: detection.confidence,
                languages: detection.languages,
                frameworks: detection.frameworks
              },
              rulesLoaded: serverState.loadedRules.length,
              knowledgeLoaded: serverState.loadedKnowledge.length,
              nextSteps: ['Use "context" to see loaded rules', 'Use "review" to analyze your code']
            }, null, 2)
          }]
        };
      }
      
      case 'context': {
        const { full = false } = args as { full?: boolean };
        
        if (!serverState.activeProjectType) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                configured: false,
                hint: 'Use "setup" to configure your project first'
              }, null, 2)
            }]
          };
        }
        
        const project = SUPPORTED_PROJECTS[serverState.activeProjectType];
        
        if (full) {
          // Return full content
          const rulesContent = serverState.loadedRules
            .map(r => `## ${r.name}\n${r.content}`)
            .join('\n\n---\n\n');
          
          const knowledgeContent = serverState.loadedKnowledge
            .map(k => `## ${k.name}\n${k.content}`)
            .join('\n\n---\n\n');
          
          return {
            content: [{
              type: 'text',
              text: `# ${project.name} Context\n\n## Rules\n${rulesContent}\n\n## Knowledge\n${knowledgeContent}`
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectType: serverState.activeProjectType,
              projectName: project.name,
              languages: project.languages,
              frameworks: project.frameworks,
              rules: serverState.loadedRules.map(r => ({ id: r.id, name: r.name, category: r.category })),
              knowledge: serverState.loadedKnowledge.map(k => ({ id: k.id, name: k.name, category: k.category })),
              totalRules: serverState.loadedRules.length,
              totalKnowledge: serverState.loadedKnowledge.length
            }, null, 2)
          }]
        };
      }
      
      case 'rules': {
        const { action = 'list', query, ids, category } = args as { 
          action?: string; query?: string; ids?: string[]; category?: string 
        };
        const pt = serverState.activeProjectType;
        
        switch (action) {
          case 'list': {
            let rules = pt ? rulesProvider.getRulesForProject(pt) : [];
            if (category) {
              rules = rules.filter(r => r.category === category);
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  projectType: pt,
                  count: rules.length,
                  rules: rules.map(r => ({ id: r.id, name: r.name, category: r.category, description: r.description }))
                }, null, 2)
              }]
            };
          }
          case 'search': {
            if (!query) return { content: [{ type: 'text', text: 'Error: query required for search' }] };
            const rules = pt ? rulesProvider.getRulesForProject(pt) : [];
            const term = query.toLowerCase();
            const matches = rules.filter(r => 
              r.name.toLowerCase().includes(term) || 
              r.content.toLowerCase().includes(term) ||
              r.description?.toLowerCase().includes(term)
            );
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ query, matches: matches.length, rules: matches.map(r => ({ id: r.id, name: r.name, category: r.category })) }, null, 2)
              }]
            };
          }
          case 'get': {
            if (!query) return { content: [{ type: 'text', text: 'Error: query (rule ID) required' }] };
            const rules = pt ? rulesProvider.getRulesForProject(pt) : [];
            const rule = rules.find(r => r.id === query);
            if (!rule) return { content: [{ type: 'text', text: `Rule not found: ${query}` }] };
            return { content: [{ type: 'text', text: `# ${rule.name}\n\n${rule.content}` }] };
          }
          case 'select': {
            if (!ids || ids.length === 0) return { content: [{ type: 'text', text: 'Error: ids required for select' }] };
            if (serverState.activeConfiguration) {
              serverState.activeConfiguration.selectedRules = ids;
              serverState.activeConfiguration.updatedAt = new Date().toISOString();
            }
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, selectedRules: ids.length }, null, 2) }] };
          }
          default:
            return { content: [{ type: 'text', text: 'Actions: list, search, get, select' }] };
        }
      }
      
      case 'knowledge': {
        const { action = 'list', query, category } = args as { action?: string; query?: string; category?: string };
        const pt = serverState.activeProjectType;
        
        switch (action) {
          case 'list': {
            let items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
            if (category) items = items.filter(k => k.category === category);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  projectType: pt,
                  count: items.length,
                  knowledge: items.map(k => ({ id: k.id, name: k.name, category: k.category }))
                }, null, 2)
              }]
            };
          }
          case 'search': {
            if (!query) return { content: [{ type: 'text', text: 'Error: query required' }] };
            const items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
            const term = query.toLowerCase();
            const matches = items.filter(k => k.name.toLowerCase().includes(term) || k.content.toLowerCase().includes(term));
            return { content: [{ type: 'text', text: JSON.stringify({ query, matches: matches.length, knowledge: matches.map(k => ({ id: k.id, name: k.name })) }, null, 2) }] };
          }
          case 'get': {
            if (!query) return { content: [{ type: 'text', text: 'Error: query (knowledge ID) required' }] };
            const items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
            const item = items.find(k => k.id === query);
            if (!item) return { content: [{ type: 'text', text: `Knowledge not found: ${query}` }] };
            return { content: [{ type: 'text', text: `# ${item.name}\n\n${item.content}` }] };
          }
          default:
            return { content: [{ type: 'text', text: 'Actions: list, search, get' }] };
        }
      }
      
      case 'review': {
        const { file, url, project: reviewProject, focus = 'all' } = args as { 
          file?: string; url?: string; project?: boolean; focus?: string 
        };
        
        if (!serverState.activeProjectType) {
          const detection = autoDetect.detectProjectType(process.cwd());
          if (detection.detected && detection.projectType) {
            const pt = detection.projectType as ProjectType;
            serverState.activeProjectType = pt;
            serverState.loadedRules = rulesProvider.getRulesForProject(pt);
            serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(pt);
          }
        }
        
        const activeRules = serverState.loadedRules.filter(r => 
          focus === 'all' || r.category === focus || r.category?.includes(focus)
        );
        
        // Review project
        if (reviewProject) {
          const fs = await import('fs');
          const path = await import('path');
          const projectPath = process.cwd();
          const keyFiles: string[] = [];
          const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
          
          function scan(dir: string, depth = 0): void {
            if (depth > 3) return;
            try {
              const items = fs.readdirSync(dir);
              for (const item of items) {
                if (item.startsWith('.') || ['node_modules', '__pycache__', 'venv', 'dist'].includes(item)) continue;
                const full = path.join(dir, item);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) scan(full, depth + 1);
                else if (exts.some(e => item.endsWith(e))) keyFiles.push(path.relative(projectPath, full));
              }
            } catch { /* ignore */ }
          }
          scan(projectPath);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                type: 'project-review',
                projectType: serverState.activeProjectType,
                focus,
                filesFound: keyFiles.length,
                keyFiles: keyFiles.slice(0, 25),
                rulesApplied: activeRules.map(r => r.name),
                instructions: `Review this project focusing on ${focus}. Apply the listed rules.`
              }, null, 2)
            }]
          };
        }
        
        // Review file or URL
        let content = '';
        let source = '';
        
        if (url) {
          try {
            const response = await fetch(url);
            content = await response.text();
            source = url;
          } catch (e) {
            return { content: [{ type: 'text', text: `Error fetching URL: ${e}` }] };
          }
        } else if (file) {
          const fs = await import('fs');
          const path = await import('path');
          const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
          if (!fs.existsSync(resolved)) {
            return { content: [{ type: 'text', text: `File not found: ${resolved}` }] };
          }
          content = fs.readFileSync(resolved, 'utf-8');
          source = file;
        } else {
          return { content: [{ type: 'text', text: 'Specify file, url, or project:true' }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              type: 'file-review',
              source,
              projectType: serverState.activeProjectType,
              focus,
              rulesApplied: activeRules.map(r => r.name),
              code: content.substring(0, 12000),
              truncated: content.length > 12000,
              instructions: 'Review this code against the active rules.'
            }, null, 2)
          }]
        };
      }
      
      case 'cursor': {
        const { action = 'categories', query, slug } = args as { action?: string; query?: string; slug?: string };
        
        switch (action) {
          case 'categories':
            const categories = cursorDirectory.getCursorDirectoryCategories();
            return { content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }] };
          case 'popular':
            const popular = await cursorDirectory.getPopularCursorDirectoryRules();
            return { content: [{ type: 'text', text: JSON.stringify({ rules: popular }, null, 2) }] };
          case 'browse':
            if (!query) return { content: [{ type: 'text', text: 'Error: query (category) required' }] };
            const browseRules = await cursorDirectory.browseCursorDirectoryCategory(query);
            return { content: [{ type: 'text', text: JSON.stringify({ category: query, rules: browseRules }, null, 2) }] };
          case 'search':
            if (!query) return { content: [{ type: 'text', text: 'Error: query required' }] };
            const searchResults = await cursorDirectory.searchCursorDirectory(query);
            return { content: [{ type: 'text', text: JSON.stringify({ query, results: searchResults }, null, 2) }] };
          case 'import':
            if (!slug) return { content: [{ type: 'text', text: 'Error: slug required' }] };
            const pt = serverState.activeProjectType || 'react-typescript';
            const rule = await cursorDirectory.fetchCursorDirectoryRule(slug, 'best-practices');
            if (!rule) return { content: [{ type: 'text', text: `Rule not found: ${slug}` }] };
            const formatted = cursorDirectory.formatRuleForImport(rule);
            const userRule = ruleManager.createUserRule(pt, 'best-practices', `cursor-${slug}`, formatted, rule.description);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, imported: userRule.name, id: userRule.id }, null, 2) }] };
          default:
            return { content: [{ type: 'text', text: 'Actions: categories, popular, browse, search, import' }] };
        }
      }
      
      case 'docs': {
        const { action = 'list', url, urls, query } = args as { action?: string; url?: string; urls?: string[]; query?: string };
        const pt = serverState.activeProjectType;
        
        switch (action) {
          case 'fetch':
            if (!url) return { content: [{ type: 'text', text: 'Error: url required' }] };
            const doc = await webDocs.fetchWebDocumentation(url, pt ? { projectType: pt } : undefined);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: doc.id, title: doc.title }, null, 2) }] };
          case 'list':
            const allDocs = webDocs.listCachedDocuments();
            return { content: [{ type: 'text', text: JSON.stringify({ count: allDocs.length, docs: allDocs.map(d => ({ id: d.id, title: d.title, url: d.url })) }, null, 2) }] };
          case 'search':
            if (!query) return { content: [{ type: 'text', text: 'Error: query required' }] };
            const matches = webDocs.searchWebDocuments(query);
            return { content: [{ type: 'text', text: JSON.stringify({ query, matches }, null, 2) }] };
          case 'get':
            if (!url) return { content: [{ type: 'text', text: 'Error: url/id required' }] };
            const fetched = webDocs.getWebDocumentById(url) || webDocs.getWebDocumentByUrl(url);
            if (!fetched) return { content: [{ type: 'text', text: 'Document not found' }] };
            return { content: [{ type: 'text', text: `# ${fetched.title}\n\n${fetched.content}` }] };
          case 'remove':
            if (!url) return { content: [{ type: 'text', text: 'Error: url/id required' }] };
            webDocs.removeFromCache(url);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, removed: url }, null, 2) }] };
          case 'suggest':
            const suggestions = webDocs.getSuggestedDocs(pt || 'react-typescript');
            return { content: [{ type: 'text', text: JSON.stringify({ suggestions }, null, 2) }] };
          default:
            return { content: [{ type: 'text', text: 'Actions: fetch, list, search, get, remove, suggest' }] };
        }
      }
      
      case 'config': {
        const { action = 'list', name, id, json } = args as { action?: string; name?: string; id?: string; json?: string };
        
        switch (action) {
          case 'save':
            if (!name) return { content: [{ type: 'text', text: 'Error: name required' }] };
            if (!serverState.activeConfiguration || !serverState.activeProjectType) return { content: [{ type: 'text', text: 'No active configuration to save' }] };
            const saved = persistence.createConfiguration(name, serverState.activeProjectType, serverState.activeConfiguration.selectedRules, serverState.activeConfiguration.selectedKnowledge);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: saved.id, name: saved.name }, null, 2) }] };
          case 'load':
            if (!id) return { content: [{ type: 'text', text: 'Error: id required' }] };
            const loaded = persistence.getConfigurationById(id);
            if (!loaded) return { content: [{ type: 'text', text: 'Configuration not found' }] };
            serverState.activeConfiguration = loaded;
            serverState.activeProjectType = loaded.projectType;
            serverState.loadedRules = rulesProvider.getRulesForProject(loaded.projectType);
            serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(loaded.projectType);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, loaded: loaded.name }, null, 2) }] };
          case 'list':
            const configs = persistence.getAllConfigurations();
            return { content: [{ type: 'text', text: JSON.stringify({ configurations: configs }, null, 2) }] };
          case 'delete':
            if (!id) return { content: [{ type: 'text', text: 'Error: id required' }] };
            persistence.deleteConfiguration(id);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: id }, null, 2) }] };
          case 'export':
            if (!id) return { content: [{ type: 'text', text: 'Error: id required' }] };
            const toExport = persistence.exportConfiguration(id);
            return { content: [{ type: 'text', text: toExport || 'Configuration not found' }] };
          case 'import':
            if (!json) return { content: [{ type: 'text', text: 'Error: json required' }] };
            const imported = persistence.importConfiguration(json);
            if (!imported) return { content: [{ type: 'text', text: 'Error: Invalid configuration JSON' }] };
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, imported: imported.id }, null, 2) }] };
          default:
            return { content: [{ type: 'text', text: 'Actions: save, load, list, delete, export, import' }] };
        }
      }
      
      case 'custom_rule': {
        const { action = 'list', name, content, category, id, json } = args as { 
          action?: string; name?: string; content?: string; category?: RuleCategory; id?: string; json?: string 
        };
        const pt = serverState.activeProjectType || 'react-typescript';
        
        switch (action) {
          case 'create':
            if (!name || !content || !category) return { content: [{ type: 'text', text: 'Error: name, content, category required' }] };
            const created = ruleManager.createUserRule(pt, category, name, content);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: created.id, name: created.name }, null, 2) }] };
          case 'list':
            const rules = ruleManager.getUserRules(pt);
            return { content: [{ type: 'text', text: JSON.stringify({ projectType: pt, rules: rules.map(r => ({ id: r.id, name: r.name, category: r.category })) }, null, 2) }] };
          case 'update':
            if (!id) return { content: [{ type: 'text', text: 'Error: id required' }] };
            const updated = ruleManager.updateUserRule(id, { name, content });
            return { content: [{ type: 'text', text: JSON.stringify({ success: !!updated, rule: updated }, null, 2) }] };
          case 'delete':
            if (!id) return { content: [{ type: 'text', text: 'Error: id required' }] };
            ruleManager.deleteUserRule(id);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: id }, null, 2) }] };
          case 'export':
            const allRules = ruleManager.exportAllUserRules();
            return { content: [{ type: 'text', text: allRules }] };
          case 'import':
            if (!json) return { content: [{ type: 'text', text: 'Error: json required' }] };
            const importedCount = ruleManager.importUserRules(json);
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, imported: importedCount }, null, 2) }] };
          default:
            return { content: [{ type: 'text', text: 'Actions: create, list, update, delete, export, import' }] };
        }
      }
      
      case 'help': {
        const { topic = 'all' } = args as { topic?: string };
        
        const helpContent: Record<string, string> = {
          setup: `## setup
Configure StackGuide for your project.

**Auto-detect:** \`setup\` or \`setup path:"."\`
**Manual:** \`setup type:"react-typescript"\`

Available types: ${Object.keys(SUPPORTED_PROJECTS).join(', ')}`,
          
          rules: `## rules
Manage coding rules.

**List:** \`rules\` or \`rules action:"list"\`
**Search:** \`rules action:"search" query:"security"\`
**Get:** \`rules action:"get" query:"rule-id"\`
**Select:** \`rules action:"select" ids:["id1","id2"]\``,
          
          review: `## review
Review code against active rules.

**File:** \`review file:"src/index.ts"\`
**URL:** \`review url:"https://..."\`
**Project:** \`review project:true\`
**Focus:** \`review project:true focus:"security"\``,
          
          cursor: `## cursor
Browse cursor.directory community rules.

**Categories:** \`cursor\` or \`cursor action:"categories"\`
**Popular:** \`cursor action:"popular"\`
**Browse:** \`cursor action:"browse" query:"react"\`
**Search:** \`cursor action:"search" query:"typescript"\`
**Import:** \`cursor action:"import" slug:"rule-slug"\``,
          
          docs: `## docs
Fetch and manage web documentation.

**Fetch:** \`docs action:"fetch" url:"https://..."\`
**List:** \`docs action:"list"\`
**Search:** \`docs action:"search" query:"hooks"\``,
          
          config: `## config
Save and load configurations.

**Save:** \`config action:"save" name:"my-config"\`
**Load:** \`config action:"load" id:"config-id"\`
**List:** \`config action:"list"\``
        };
        
        if (topic === 'all') {
          return {
            content: [{
              type: 'text',
              text: `# StackGuide Help

## Quick Start
1. \`setup\` - Auto-configure for your project
2. \`context\` - See loaded rules
3. \`review file:"src/index.ts"\` - Review your code

## Available Tools
- **setup** - Configure project
- **context** - View current context  
- **rules** - Manage rules
- **knowledge** - Access knowledge base
- **review** - Code review
- **cursor** - Browse cursor.directory
- **docs** - Web documentation
- **config** - Save/load configurations
- **custom_rule** - Create custom rules

Use \`help topic:"setup"\` for details on a specific tool.`
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: helpContent[topic] || `Unknown topic: ${topic}. Available: setup, rules, review, cursor, docs, config, all`
          }]
        };
      }
      
      // ==================== LEGACY TOOLS (kept for backwards compatibility) ====================
      
      // Smart Setup Tools
      case 'auto_setup': {
        const { projectPath } = args as { projectPath: string };
        const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;
        
        // Detect project
        const detection = autoDetect.detectProjectType(resolvedPath);
        
        if (!detection.detected || !detection.projectType) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Could not auto-detect project type',
                hint: 'Please use select_project_type to manually choose your project type',
                availableTypes: Object.keys(SUPPORTED_PROJECTS)
              }, null, 2)
            }]
          };
        }
        
        // Auto-configure
        const projectType = detection.projectType as ProjectType;
        const project = SUPPORTED_PROJECTS[projectType];
        
        serverState.activeProjectType = projectType;
        serverState.loadedRules = rulesProvider.getRulesForProject(projectType);
        serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(projectType);
        
        // Create an active configuration with all rules/knowledge selected
        serverState.activeConfiguration = {
          id: `auto-${projectType}-${Date.now()}`,
          name: `Auto Setup - ${project.name}`,
          projectType: projectType,
          selectedRules: serverState.loadedRules.map(r => r.id),
          selectedKnowledge: serverState.loadedKnowledge.map(k => k.id),
          customRules: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        const setupInstructions = autoDetect.getSetupInstructions(projectType);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `✅ Auto-configured for ${project.name}`,
              detection: {
                projectType: detection.projectType,
                confidence: detection.confidence,
                languages: detection.languages,
                frameworks: detection.frameworks,
                indicators: detection.indicators
              },
              configured: {
                rulesLoaded: serverState.loadedRules.length,
                knowledgeLoaded: serverState.loadedKnowledge.length,
                rules: serverState.loadedRules.map(r => r.name)
              },
              suggestions: detection.suggestions.slice(0, 5),
              nextSteps: [
                'Use get_full_context to see all loaded rules',
                'Use browse_cursor_directory to find community rules',
                'Use save_configuration to save this setup'
              ],
              setupGuide: setupInstructions
            }, null, 2)
          }]
        };
      }
      
      case 'detect_project': {
        const { projectPath } = args as { projectPath: string };
        const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;
        
        const detection = autoDetect.detectProjectType(resolvedPath);
        const quickStart = autoDetect.generateQuickStart(detection);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...detection,
              quickStart
            }, null, 2)
          }]
        };
      }
      
      case 'suggest_rules': {
        const { projectType } = args as { projectType?: ProjectType };
        const pt = projectType || serverState.activeProjectType;
        
        if (!pt) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No project type specified or selected',
                hint: 'Use auto_setup or select_project_type first, or provide projectType parameter'
              }, null, 2)
            }]
          };
        }
        
        const suggestions = autoDetect.getSuggestions(pt);
        const builtInRules = rulesProvider.getRulesForProject(pt);
        const cursorCategories = cursorDirectory.getCursorDirectoryCategories()
          .filter(cat => pt.toLowerCase().includes(cat) || cat.includes(pt.split('-')[0]));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectType: pt,
              suggestions: suggestions,
              builtInRules: builtInRules.map(r => ({ id: r.id, name: r.name, category: r.category })),
              recommendedCursorCategories: cursorCategories.length > 0 ? cursorCategories : ['Check browse_cursor_directory for all categories'],
              tips: [
                'Use browse_cursor_directory to import community rules',
                'Use create_rule to add your own custom rules',
                'Use save_configuration to persist your setup'
              ]
            }, null, 2)
          }]
        };
      }
      
      case 'quick_start': {
        const { projectPath } = args as { projectPath?: string };
        
        let detection: autoDetect.DetectionResult | null = null;
        
        if (projectPath) {
          const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;
          detection = autoDetect.detectProjectType(resolvedPath);
        } else if (serverState.activeProjectType) {
          // Create a pseudo-detection from active state
          detection = {
            detected: true,
            projectType: serverState.activeProjectType,
            confidence: 'high',
            indicators: ['Already configured'],
            suggestions: autoDetect.getSuggestions(serverState.activeProjectType),
            frameworks: SUPPORTED_PROJECTS[serverState.activeProjectType]?.frameworks || [],
            languages: SUPPORTED_PROJECTS[serverState.activeProjectType]?.languages || []
          };
        }
        
        if (!detection) {
          return {
            content: [{
              type: 'text',
              text: `# StackGuide Quick Start

Welcome! Let's get you set up.

## Option 1: Auto-detect (Recommended)
\`\`\`
auto_setup projectPath:"."
\`\`\`

## Option 2: Manual selection
\`\`\`
select_project_type projectType:"react-node"
\`\`\`

## Available project types:
${Object.values(SUPPORTED_PROJECTS).map(p => `- **${p.type}**: ${p.name}`).join('\n')}

Just tell me about your project and I'll help you configure!`
            }]
          };
        }
        
        const quickStart = autoDetect.generateQuickStart(detection);
        return {
          content: [{
            type: 'text',
            text: quickStart
          }]
        };
      }
      
      // Project Type Tools
      case 'list_project_types': {
        const projects = Object.values(SUPPORTED_PROJECTS).map(p => ({
          type: p.type,
          name: p.name,
          description: p.description,
          languages: p.languages,
          frameworks: p.frameworks
        }));
        return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
      }
      
      case 'select_project_type': {
        const projectType = (args as { projectType: ProjectType }).projectType;
        const project = SUPPORTED_PROJECTS[projectType];
        
        if (!project) {
          return { content: [{ type: 'text', text: `Error: Unknown project type "${projectType}"` }] };
        }
        
        serverState.activeProjectType = projectType;
        serverState.loadedRules = rulesProvider.getRulesForProject(projectType);
        serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(projectType);
        
        // Create an active configuration with all rules/knowledge selected
        serverState.activeConfiguration = {
          id: `manual-${projectType}-${Date.now()}`,
          name: `Manual Setup - ${project.name}`,
          projectType: projectType,
          selectedRules: serverState.loadedRules.map(r => r.id),
          selectedKnowledge: serverState.loadedKnowledge.map(k => k.id),
          customRules: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Project type "${project.name}" activated`,
              rulesLoaded: serverState.loadedRules.length,
              knowledgeLoaded: serverState.loadedKnowledge.length,
              rules: serverState.loadedRules.map(r => r.name)
            }, null, 2)
          }]
        };
      }
      
      case 'get_current_context': {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              activeProjectType: serverState.activeProjectType,
              activeConfiguration: serverState.activeConfiguration,
              loadedRulesCount: serverState.loadedRules.length,
              loadedKnowledgeCount: serverState.loadedKnowledge.length,
              rules: serverState.loadedRules.map(r => ({ id: r.id, name: r.name, category: r.category })),
              knowledge: serverState.loadedKnowledge.map(k => ({ id: k.id, name: k.name, category: k.category }))
            }, null, 2)
          }]
        };
      }
      
      // Rules Tools
      case 'list_rules': {
        const { projectType, category } = args as { projectType?: ProjectType; category?: string };
        const pt = projectType || serverState.activeProjectType;
        
        if (!pt) {
          return { content: [{ type: 'text', text: 'Error: No project type selected. Use select_project_type first.' }] };
        }
        
        let rules = rulesProvider.getRulesForProject(pt);
        if (category) {
          rules = rules.filter(r => r.category === category);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(rules.map(r => ({
              id: r.id,
              name: r.name,
              category: r.category,
              description: r.description,
              enabled: r.enabled
            })), null, 2)
          }]
        };
      }
      
      case 'get_rule': {
        const { ruleId } = args as { ruleId: string };
        const rule = rulesProvider.getRuleById(ruleId);
        
        if (!rule) {
          return { content: [{ type: 'text', text: `Error: Rule "${ruleId}" not found` }] };
        }
        
        return { content: [{ type: 'text', text: rule.content }] };
      }
      
      case 'select_rules': {
        const { ruleIds } = args as { ruleIds: string[] };
        
        if (serverState.activeConfiguration) {
          persistence.updateSelectedRules(serverState.activeConfiguration.id, ruleIds);
          serverState.activeConfiguration.selectedRules = ruleIds;
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, selectedRules: ruleIds }, null, 2)
          }]
        };
      }
      
      case 'search_rules': {
        const { searchTerm, projectType } = args as { searchTerm: string; projectType?: ProjectType };
        const pt = projectType || serverState.activeProjectType;
        
        if (!pt) {
          return { content: [{ type: 'text', text: 'Error: No project type selected.' }] };
        }
        
        const results = rulesProvider.searchRules(pt, searchTerm);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.map(r => ({
              id: r.id,
              name: r.name,
              category: r.category,
              description: r.description
            })), null, 2)
          }]
        };
      }
      
      // Knowledge Tools
      case 'list_knowledge': {
        const { projectType, category } = args as { projectType?: ProjectType; category?: string };
        const pt = projectType || serverState.activeProjectType;
        
        if (!pt) {
          return { content: [{ type: 'text', text: 'Error: No project type selected.' }] };
        }
        
        let knowledge = knowledgeProvider.getKnowledgeForProject(pt);
        if (category) {
          knowledge = knowledge.filter(k => k.category === category);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(knowledge.map(k => ({
              id: k.id,
              name: k.name,
              category: k.category,
              description: k.description
            })), null, 2)
          }]
        };
      }
      
      case 'get_knowledge': {
        const { knowledgeId } = args as { knowledgeId: string };
        const knowledge = knowledgeProvider.getKnowledgeById(knowledgeId);
        
        if (!knowledge) {
          return { content: [{ type: 'text', text: `Error: Knowledge "${knowledgeId}" not found` }] };
        }
        
        return { content: [{ type: 'text', text: knowledge.content }] };
      }
      
      case 'select_knowledge': {
        const { knowledgeIds } = args as { knowledgeIds: string[] };
        
        if (serverState.activeConfiguration) {
          persistence.updateSelectedKnowledge(serverState.activeConfiguration.id, knowledgeIds);
          serverState.activeConfiguration.selectedKnowledge = knowledgeIds;
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, selectedKnowledge: knowledgeIds }, null, 2)
          }]
        };
      }
      
      case 'search_knowledge': {
        const { searchTerm, projectType } = args as { searchTerm: string; projectType?: ProjectType };
        const pt = projectType || serverState.activeProjectType;
        
        if (!pt) {
          return { content: [{ type: 'text', text: 'Error: No project type selected.' }] };
        }
        
        const results = knowledgeProvider.searchKnowledge(pt, searchTerm);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.map(k => ({
              id: k.id,
              name: k.name,
              category: k.category,
              description: k.description
            })), null, 2)
          }]
        };
      }
      
      // Configuration Tools
      case 'save_configuration': {
        const { name: configName } = args as { name: string };
        
        if (!serverState.activeProjectType) {
          return { content: [{ type: 'text', text: 'Error: No project type selected.' }] };
        }
        
        const selectedRules = serverState.activeConfiguration?.selectedRules || [];
        const selectedKnowledge = serverState.activeConfiguration?.selectedKnowledge || [];
        
        const config = persistence.createConfiguration(
          configName,
          serverState.activeProjectType,
          selectedRules,
          selectedKnowledge
        );
        
        serverState.activeConfiguration = config;
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Configuration "${configName}" saved`,
              configurationId: config.id
            }, null, 2)
          }]
        };
      }
      
      case 'load_configuration': {
        const { configurationId } = args as { configurationId: string };
        const config = persistence.setActiveConfiguration(configurationId);
        
        if (!config) {
          return { content: [{ type: 'text', text: `Error: Configuration "${configurationId}" not found` }] };
        }
        
        serverState.activeConfiguration = config;
        serverState.activeProjectType = config.projectType;
        serverState.loadedRules = rulesProvider.getRulesForProject(config.projectType);
        serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(config.projectType);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Configuration "${config.name}" loaded`,
              projectType: config.projectType,
              selectedRules: config.selectedRules.length,
              selectedKnowledge: config.selectedKnowledge.length
            }, null, 2)
          }]
        };
      }
      
      case 'list_configurations': {
        const configs = persistence.getAllConfigurations();
        const active = persistence.getActiveConfiguration();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              activeConfigurationId: active?.id || null,
              configurations: configs.map(c => ({
                id: c.id,
                name: c.name,
                projectType: c.projectType,
                selectedRules: c.selectedRules.length,
                selectedKnowledge: c.selectedKnowledge.length,
                updatedAt: c.updatedAt
              }))
            }, null, 2)
          }]
        };
      }
      
      case 'delete_configuration': {
        const { configurationId } = args as { configurationId: string };
        const deleted = persistence.deleteConfiguration(configurationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: deleted,
              message: deleted ? 'Configuration deleted' : 'Configuration not found'
            }, null, 2)
          }]
        };
      }
      
      case 'export_configuration': {
        const { configurationId } = args as { configurationId: string };
        const exported = persistence.exportConfiguration(configurationId);
        
        if (!exported) {
          return { content: [{ type: 'text', text: 'Error: Configuration not found' }] };
        }
        
        return { content: [{ type: 'text', text: exported }] };
      }
      
      case 'import_configuration': {
        const { jsonConfig } = args as { jsonConfig: string };
        const imported = persistence.importConfiguration(jsonConfig);
        
        if (!imported) {
          return { content: [{ type: 'text', text: 'Error: Invalid configuration JSON' }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Configuration imported successfully',
              configurationId: imported.id,
              name: imported.name
            }, null, 2)
          }]
        };
      }
      
      // Context Tools
      case 'get_full_context': {
        if (!serverState.activeProjectType) {
          return { content: [{ type: 'text', text: 'Error: No project type selected. Use auto_setup or select_project_type first.' }] };
        }
        
        // Use configuration selection if available, otherwise use all loaded rules/knowledge
        const selectedRules = serverState.activeConfiguration?.selectedRules || 
          serverState.loadedRules.map(r => r.id);
        const selectedKnowledge = serverState.activeConfiguration?.selectedKnowledge || 
          serverState.loadedKnowledge.map(k => k.id);
        
        // Also get user-created rules for this project type
        const userRules = ruleManager.getUserRules(serverState.activeProjectType);
        const userRulesContent = userRules.map((r: { name: string; content: string }) => `### ${r.name}\n\n${r.content}`).join('\n\n---\n\n');
        
        const rulesContent = rulesProvider.getCombinedRulesContent(selectedRules);
        const knowledgeContent = knowledgeProvider.getCombinedKnowledgeContent(selectedKnowledge);
        
        const fullContext = `# Project Context: ${SUPPORTED_PROJECTS[serverState.activeProjectType].name}

## Rules and Guidelines (${selectedRules.length} loaded)

${rulesContent || 'No rules available.'}

${userRulesContent ? `---\n\n## Custom Rules\n\n${userRulesContent}` : ''}

---

## Knowledge Base (${selectedKnowledge.length} loaded)

${knowledgeContent || 'No knowledge files available.'}
`;
        
        return { content: [{ type: 'text', text: fullContext }] };
      }
      
      case 'add_custom_rule': {
        const { name: ruleName, category, content, description } = args as {
          name: string;
          category: string;
          content: string;
          description?: string;
        };
        
        if (!serverState.activeConfiguration) {
          return { content: [{ type: 'text', text: 'Error: No active configuration. Save a configuration first.' }] };
        }
        
        const rule = persistence.addCustomRule(serverState.activeConfiguration.id, {
          name: ruleName,
          category: category as any,
          content,
          description: description || '',
          enabled: true,
          priority: 50
        });
        
        if (!rule) {
          return { content: [{ type: 'text', text: 'Error: Could not add custom rule' }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Custom rule added',
              ruleId: rule.id
            }, null, 2)
          }]
        };
      }
      
      // ==================== DYNAMIC RULE MANAGEMENT ====================
      
      case 'create_rule': {
        const { projectType, name: ruleName, category, content, description } = args as {
          projectType: ProjectType;
          name: string;
          category: RuleCategory;
          content: string;
          description?: string;
        };
        
        const rule = ruleManager.createUserRule(
          projectType,
          category,
          ruleName,
          content,
          description || ''
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Rule "${ruleName}" created successfully`,
              ruleId: rule.id,
              projectType,
              category
            }, null, 2)
          }]
        };
      }
      
      case 'create_rule_from_template': {
        const { projectType, templateId, name: ruleName, category, description, language } = args as {
          projectType: ProjectType;
          templateId: string;
          name: string;
          category: RuleCategory;
          description: string;
          language?: string;
        };
        
        const rule = ruleManager.createRuleFromTemplate(
          projectType,
          category,
          templateId,
          ruleName,
          description,
          language || 'typescript'
        );
        
        if (!rule) {
          return { content: [{ type: 'text', text: `Error: Template "${templateId}" not found` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Rule "${ruleName}" created from template "${templateId}"`,
              ruleId: rule.id,
              hint: 'Use get_rule to view and customize the generated content'
            }, null, 2)
          }]
        };
      }
      
      case 'list_rule_templates': {
        const templates = ruleManager.listTemplates();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              templates,
              usage: 'Use create_rule_from_template with templateId to create a new rule'
            }, null, 2)
          }]
        };
      }
      
      case 'get_rule_template': {
        const { templateId } = args as { templateId: string };
        const content = ruleManager.getTemplateContent(templateId);
        
        if (!content) {
          return { content: [{ type: 'text', text: `Error: Template "${templateId}" not found` }] };
        }
        
        return { content: [{ type: 'text', text: content }] };
      }
      
      case 'update_rule': {
        const { ruleId, ...updates } = args as {
          ruleId: string;
          name?: string;
          content?: string;
          description?: string;
          enabled?: boolean;
        };
        
        const updated = ruleManager.updateUserRule(ruleId, updates);
        
        if (!updated) {
          return { content: [{ type: 'text', text: `Error: Rule "${ruleId}" not found or is not a user-created rule` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Rule updated successfully',
              rule: {
                id: updated.id,
                name: updated.name,
                enabled: updated.enabled
              }
            }, null, 2)
          }]
        };
      }
      
      case 'delete_rule': {
        const { ruleId } = args as { ruleId: string };
        const deleted = ruleManager.deleteUserRule(ruleId);
        
        if (!deleted) {
          return { content: [{ type: 'text', text: `Error: Rule "${ruleId}" not found or is not a user-created rule` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Rule deleted successfully'
            }, null, 2)
          }]
        };
      }
      
      case 'list_user_rules': {
        const { projectType } = args as { projectType: ProjectType };
        const rules = ruleManager.getUserRules(projectType);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectType,
              count: rules.length,
              rules: rules.map(r => ({
                id: r.id,
                name: r.name,
                category: r.category,
                description: r.description,
                enabled: r.enabled
              }))
            }, null, 2)
          }]
        };
      }
      
      case 'export_user_rules': {
        const exported = ruleManager.exportAllUserRules();
        return { content: [{ type: 'text', text: exported }] };
      }
      
      case 'import_user_rules': {
        const { jsonRules } = args as { jsonRules: string };
        const count = ruleManager.importUserRules(jsonRules);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: count > 0,
              message: count > 0 ? `${count} rules imported successfully` : 'No rules imported (invalid JSON or empty)',
              importedCount: count
            }, null, 2)
          }]
        };
      }
      
      // ==================== WEB DOCUMENTATION ====================
      
      case 'fetch_web_docs': {
        const { url, projectType, category, tags } = args as {
          url: string;
          projectType?: string;
          category?: string;
          tags?: string[];
        };
        
        try {
          const doc = await webDocs.fetchWebDocumentation(url, { projectType, category, tags });
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Documentation fetched successfully',
                document: {
                  id: doc.id,
                  title: doc.title,
                  url: doc.url,
                  summary: doc.summary,
                  contentLength: doc.content.length,
                  fetchedAt: doc.fetchedAt
                },
                hint: 'Use get_web_doc to retrieve the full content'
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error fetching documentation: ${error instanceof Error ? error.message : String(error)}`
            }]
          };
        }
      }
      
      case 'fetch_multiple_docs': {
        const { urls, projectType } = args as { urls: string[]; projectType?: string };
        
        const results = await webDocs.fetchMultipleDocuments(urls, { projectType });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: results.successful.length > 0,
              fetched: results.successful.length,
              failed: results.failed.length,
              documents: results.successful.map(d => ({
                id: d.id,
                title: d.title,
                url: d.url
              })),
              errors: results.failed
            }, null, 2)
          }]
        };
      }
      
      case 'get_web_doc': {
        const { idOrUrl } = args as { idOrUrl: string };
        
        let doc = webDocs.getWebDocumentByUrl(idOrUrl) || webDocs.getWebDocumentById(idOrUrl);
        
        if (!doc) {
          return { content: [{ type: 'text', text: `Error: Document "${idOrUrl}" not found. Use fetch_web_docs first.` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: `# ${doc.title}\n\n**Source:** ${doc.url}\n**Fetched:** ${doc.fetchedAt}\n\n---\n\n${doc.content}`
          }]
        };
      }
      
      case 'search_web_docs': {
        const { query } = args as { query: string };
        const results = webDocs.searchWebDocuments(query);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              resultsCount: results.length,
              results: results.map(d => ({
                id: d.id,
                title: d.title,
                url: d.url,
                summary: d.summary.substring(0, 200) + '...'
              }))
            }, null, 2)
          }]
        };
      }
      
      case 'list_web_docs': {
        const docs = webDocs.listCachedDocuments();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: docs.length,
              documents: docs.map(d => ({
                id: d.id,
                title: d.title,
                url: d.url,
                projectType: d.projectType,
                fetchedAt: d.fetchedAt
              }))
            }, null, 2)
          }]
        };
      }
      
      case 'get_suggested_docs': {
        const { projectType } = args as { projectType: string };
        const suggestions = webDocs.getSuggestedDocs(projectType);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectType,
              suggestions,
              hint: 'Use fetch_web_docs or fetch_multiple_docs to load these documents'
            }, null, 2)
          }]
        };
      }
      
      case 'remove_web_doc': {
        const { idOrUrl } = args as { idOrUrl: string };
        const removed = webDocs.removeFromCache(idOrUrl);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: removed,
              message: removed ? 'Document removed from cache' : 'Document not found'
            }, null, 2)
          }]
        };
      }
      
      // ==================== CURSOR DIRECTORY TOOLS ====================
      
      case 'browse_cursor_directory': {
        const { category } = args as { category: string };
        const rules = await cursorDirectory.browseCursorDirectoryCategory(category);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              category,
              count: rules.length,
              rules: rules.map(r => ({
                slug: r.slug,
                title: r.title,
                description: r.description,
                tags: r.tags,
                url: r.url
              })),
              hint: 'Use get_cursor_directory_rule with a slug to see the full content'
            }, null, 2)
          }]
        };
      }
      
      case 'search_cursor_directory': {
        const { query } = args as { query: string };
        const results = await cursorDirectory.searchCursorDirectory(query);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              count: results.length,
              results: results.map(r => ({
                slug: r.slug,
                title: r.title,
                description: r.description,
                category: r.category,
                tags: r.tags,
                url: r.url
              }))
            }, null, 2)
          }]
        };
      }
      
      case 'get_cursor_directory_rule': {
        const { slug, category = 'general' } = args as { slug: string; category?: string };
        const rule = await cursorDirectory.fetchCursorDirectoryRule(slug, category);
        
        if (!rule) {
          return { content: [{ type: 'text', text: `Error: Could not fetch rule "${slug}" from cursor.directory` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: `# ${rule.title}\n\n**Source:** ${rule.url}\n**Category:** ${rule.category}\n**Tags:** ${rule.tags.join(', ')}\n\n---\n\n${rule.content}`
          }]
        };
      }
      
      case 'list_cursor_directory_categories': {
        const categories = cursorDirectory.getCursorDirectoryCategories();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: categories.length,
              categories,
              hint: 'Use browse_cursor_directory with a category to see available rules'
            }, null, 2)
          }]
        };
      }
      
      case 'get_popular_cursor_rules': {
        const rules = await cursorDirectory.getPopularCursorDirectoryRules();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: rules.length,
              rules: rules.map(r => ({
                slug: r.slug,
                title: r.title,
                description: r.description,
                category: r.category,
                tags: r.tags,
                url: r.url
              })),
              hint: 'Use get_cursor_directory_rule with a slug to see full content, or import_cursor_directory_rule to import'
            }, null, 2)
          }]
        };
      }
      
      case 'import_cursor_directory_rule': {
        const { slug, projectType, category = 'best-practices' } = args as { 
          slug: string; 
          projectType: ProjectType; 
          category?: RuleCategory 
        };
        
        // Fetch the rule from cursor.directory
        const cursorRule = await cursorDirectory.fetchCursorDirectoryRule(slug, category);
        
        if (!cursorRule) {
          return { content: [{ type: 'text', text: `Error: Could not fetch rule "${slug}" from cursor.directory` }] };
        }
        
        // Format the content for import
        const formattedContent = cursorDirectory.formatRuleForImport(cursorRule);
        
        // Create a local user rule
        const userRule = ruleManager.createUserRule(
          projectType,
          category,
          `cursor-${slug}`,
          formattedContent,
          cursorRule.description
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Rule "${cursorRule.title}" imported successfully`,
              rule: {
                id: userRule.id,
                name: userRule.name,
                category: userRule.category,
                source: cursorRule.url
              },
              hint: 'The rule is now available in your local rules. Use list_user_rules to see all imported rules.'
            }, null, 2)
          }]
        };
      }
      
      // ==================== CODE REVIEW HANDLERS ====================
      case 'review_file': {
        const { filePath, url } = args as { filePath?: string; url?: string };
        
        if (!serverState.activeProjectType) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No project configured',
                hint: 'Use auto_setup or select_project_type first'
              }, null, 2)
            }]
          };
        }
        
        let fileContent = '';
        let fileName = '';
        
        if (url) {
          // Fetch from URL
          try {
            const response = await fetch(url);
            fileContent = await response.text();
            fileName = url.split('/').pop() || 'remote-file';
          } catch (e) {
            return { content: [{ type: 'text', text: `Error fetching URL: ${e}` }] };
          }
        } else if (filePath) {
          // Read local file
          const fs = await import('fs');
          const path = await import('path');
          const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
          
          if (!fs.existsSync(resolvedPath)) {
            return { content: [{ type: 'text', text: `File not found: ${resolvedPath}` }] };
          }
          
          fileContent = fs.readFileSync(resolvedPath, 'utf-8');
          fileName = path.basename(resolvedPath);
        } else {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No file specified',
                hint: 'Provide filePath for local files or url for remote files'
              }, null, 2)
            }]
          };
        }
        
        const activeRules = serverState.loadedRules
          .filter(r => !serverState.activeConfiguration || serverState.activeConfiguration.selectedRules.includes(r.id));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              file: fileName,
              projectType: serverState.activeProjectType,
              rulesApplied: activeRules.map(r => r.name),
              codeToReview: fileContent.substring(0, 10000),
              truncated: fileContent.length > 10000,
              instructions: 'Review this code against the active rules for: coding standards, security, performance, and best practices.'
            }, null, 2)
          }]
        };
      }
      
      case 'review_project': {
        const { projectPath = '.', focus = 'all' } = args as { projectPath?: string; focus?: string };
        const fs = await import('fs');
        const path = await import('path');
        
        const resolvedPath = projectPath === '.' ? process.cwd() : 
          (path.isAbsolute(projectPath) ? projectPath : path.join(process.cwd(), projectPath));
        
        if (!fs.existsSync(resolvedPath)) {
          return { content: [{ type: 'text', text: `Project path not found: ${resolvedPath}` }] };
        }
        
        // Detect project if not configured
        if (!serverState.activeProjectType) {
          const detection = autoDetect.detectProjectType(resolvedPath);
          if (detection.detected && detection.projectType) {
            const projectType = detection.projectType as ProjectType;
            serverState.activeProjectType = projectType;
            serverState.loadedRules = rulesProvider.getRulesForProject(projectType);
            serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(projectType);
          }
        }
        
        // Get key files based on project type
        const keyFiles: string[] = [];
        const scanExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.php', '.rb'];
        
        function scanDir(dir: string, depth = 0): void {
          if (depth > 3) return;
          const items = fs.readdirSync(dir);
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === '__pycache__' || item === 'venv') continue;
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scanDir(fullPath, depth + 1);
            } else if (scanExtensions.some(ext => item.endsWith(ext))) {
              keyFiles.push(path.relative(resolvedPath, fullPath));
            }
          }
        }
        
        scanDir(resolvedPath);
        
        // Filter rules by focus area
        let filteredRules = serverState.loadedRules;
        if (focus !== 'all') {
          filteredRules = serverState.loadedRules.filter(r => 
            r.category === focus || r.category === focus.replace('-', '')
          );
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project: resolvedPath,
              projectType: serverState.activeProjectType,
              focus,
              filesFound: keyFiles.length,
              keyFiles: keyFiles.slice(0, 20),
              rulesApplied: filteredRules.map(r => ({ name: r.name, category: r.category })),
              instructions: `Review this ${serverState.activeProjectType || 'unknown'} project focusing on ${focus}. Key files listed above.`
            }, null, 2)
          }]
        };
      }
      
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error executing tool "${name}": ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
});

// ==================== RESOURCES ====================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources: any[] = [];
  
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
    
    // Add user rules as resources
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
  
  // Add cached web documents
  const webDocsList = webDocs.listCachedDocuments();
  for (const doc of webDocsList) {
    resources.push({
      uri: `web-doc://${doc.id}`,
      name: `Web: ${doc.title}`,
      description: `Fetched from ${doc.url}`,
      mimeType: 'text/markdown'
    });
  }
  
  // Active context resource
  resources.push({
    uri: 'context://active',
    name: 'Active Context',
    description: 'The currently active project context with selected rules and knowledge',
    mimeType: 'text/markdown'
  });
  
  // Recurso de templates
  resources.push({
    uri: 'templates://rules',
    name: 'Rule Templates',
    description: 'Available templates for creating new rules',
    mimeType: 'text/markdown'
  });
  
  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  try {
    if (uri.startsWith('rules://')) {
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
    
    if (uri.startsWith('user-rules://')) {
      const parts = uri.replace('user-rules://', '').split('/');
      const projectType = parts[0] as ProjectType;
      
      const rules = ruleManager.getUserRules(projectType);
      const content = rules.map(r => `# ${r.name}\n\n**Category:** ${r.category}\n**Description:** ${r.description}\n\n${r.content}`).join('\n\n---\n\n');
      
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: content || 'No user rules available for this project type.'
        }]
      };
    }
    
    if (uri.startsWith('web-doc://')) {
      const docId = uri.replace('web-doc://', '');
      const doc = webDocs.getWebDocumentById(docId);
      
      if (!doc) {
        return {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: 'Web document not found in cache.'
          }]
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
    
    if (uri === 'templates://rules') {
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
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: content
        }]
      };
    }
    
    if (uri.startsWith('knowledge://')) {
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
    
    if (uri === 'context://active') {
      if (!serverState.activeProjectType) {
        return {
          contents: [{
            uri,
            mimeType: 'text/markdown',
            text: 'No active context. Use select_project_type tool to activate a project type.'
          }]
        };
      }
      
      const selectedRules = serverState.activeConfiguration?.selectedRules || [];
      const selectedKnowledge = serverState.activeConfiguration?.selectedKnowledge || [];
      
      const rulesContent = rulesProvider.getCombinedRulesContent(selectedRules);
      const knowledgeContent = knowledgeProvider.getCombinedKnowledgeContent(selectedKnowledge);
      
      // Also include web docs and user rules
      const userRules = ruleManager.getUserRules(serverState.activeProjectType);
      const userRulesContent = userRules.length > 0 
        ? userRules.map(r => `### ${r.name}\n\n${r.content}`).join('\n\n')
        : '';
      
      const webDocsList = webDocs.listCachedDocuments().filter(d => d.projectType === serverState.activeProjectType);
      const webDocsContent = webDocsList.length > 0
        ? webDocsList.map(d => {
            const fullDoc = webDocs.getWebDocumentById(d.id);
            return `### ${d.title}\n\n${fullDoc?.content || d.summary}`;
          }).join('\n\n')
        : '';
      
      const fullContext = `# Active Context: ${SUPPORTED_PROJECTS[serverState.activeProjectType].name}

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
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: fullContext
        }]
      };
    }
    
    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: 'Resource not found'
      }]
    };
  } catch (error) {
    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
});

// ==================== PROMPTS ====================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'welcome',
        description: 'Get started with StackGuide - interactive setup wizard',
        arguments: []
      },
      {
        name: 'configure_project',
        description: 'Smart project configuration with auto-detection and suggestions',
        arguments: [
          {
            name: 'projectPath',
            description: 'Path to your project (use "." for current directory)',
            required: false
          }
        ]
      },
      {
        name: 'setup_project',
        description: 'Initialize context for a new project',
        arguments: [
          {
            name: 'projectType',
            description: 'Type of project to set up',
            required: true
          }
        ]
      },
      {
        name: 'code_review',
        description: 'Review code from file, URL, or pasted code against active rules',
        arguments: [
          {
            name: 'filePath',
            description: 'Local file path to review (optional)',
            required: false
          },
          {
            name: 'url',
            description: 'URL to fetch and review (optional)',
            required: false
          },
          {
            name: 'code',
            description: 'Code snippet to review (optional)',
            required: false
          }
        ]
      },
      {
        name: 'apply_patterns',
        description: 'Apply architecture patterns from knowledge base',
        arguments: [
          {
            name: 'task',
            description: 'Task or feature to implement',
            required: true
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;
  
  switch (name) {
    case 'welcome': {
      const projectTypes = Object.values(SUPPORTED_PROJECTS)
        .map(p => `- **${p.type}**: ${p.name} (${p.languages.join(', ')})`)
        .join('\n');
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `# Welcome to StackGuide! 👋

I'm your AI coding context manager. I help you load the right rules, standards, and knowledge for your project.

## Quick Start

**Option 1: Auto-detect (Recommended)**
Just tell me: "Set up my project" and I'll analyze your codebase and configure everything automatically.

**Option 2: Tell me about your project**
Say something like:
- "I'm working on a React app with Node.js backend"
- "This is a Django REST API project"
- "Configure for Next.js with TypeScript"

## Supported Project Types
${projectTypes}

## What I Can Do
- 📋 Load coding standards and best practices for your stack
- 🔍 Browse and import rules from cursor.directory
- 📚 Provide architecture patterns and solutions
- 💾 Save configurations for your projects
- 🌐 Fetch and cache documentation from any URL

## Ready?
Just describe your project and I'll configure everything for you!`
          }
        }]
      };
    }
    
    case 'configure_project': {
      const projectPath = promptArgs?.projectPath || '.';
      const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;
      
      let detection: autoDetect.DetectionResult | null = null;
      try {
        detection = autoDetect.detectProjectType(resolvedPath);
      } catch {
        // Path might not exist or not accessible
      }
      
      if (detection?.detected && detection.projectType) {
        const suggestions = detection.suggestions.slice(0, 5);
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `# Project Detected! 🎯

**Type**: ${detection.projectType}
**Confidence**: ${detection.confidence}
**Languages**: ${detection.languages.join(', ')}
**Frameworks**: ${detection.frameworks.join(', ')}

## How I detected this:
${detection.indicators.map(i => `- ${i}`).join('\n')}

## Recommended Setup

### Suggested Rules:
${suggestions.map(s => `- ${s}`).join('\n')}

### Next Steps:
1. Run \`auto_setup projectPath:"${projectPath}"\` to configure automatically
2. Or run \`select_project_type projectType:"${detection.projectType}"\` to activate manually
3. Browse community rules: \`browse_cursor_directory category:"${detection.projectType.split('-')[0]}"\`

Would you like me to set this up for you?`
            }
          }]
        };
      }
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `# Let's Configure Your Project 🔧

I couldn't auto-detect the project type from the path provided.

## Tell me about your project:
- What framework are you using? (React, Django, Next.js, etc.)
- What language? (TypeScript, Python, etc.)
- Is it a full-stack app, API, or frontend-only?

## Or choose from available types:
${Object.values(SUPPORTED_PROJECTS).map(p => `- **${p.type}**: ${p.name}`).join('\n')}

Just tell me and I'll set everything up!`
          }
        }]
      };
    }
    
    case 'setup_project': {
      const projectType = promptArgs?.projectType as ProjectType;
      const project = SUPPORTED_PROJECTS[projectType];
      
      if (!project) {
        return {
          messages: [{
            role: 'user',
            content: { type: 'text', text: 'Unknown project type. Use list_project_types to see available options.' }
          }]
        };
      }
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Set up development context for a ${project.name} project.

Project Details:
- Languages: ${project.languages.join(', ')}
- Frameworks: ${project.frameworks.join(', ')}

Please:
1. Use select_project_type tool with "${projectType}"
2. List available rules with list_rules
3. List knowledge base with list_knowledge
4. Select relevant rules and knowledge
5. Save the configuration for future use`
          }
        }]
      };
    }
    
    case 'code_review': {
      const { filePath, url, code } = promptArgs as { filePath?: string; url?: string; code?: string } || {};
      const projectName = serverState.activeProjectType 
        ? SUPPORTED_PROJECTS[serverState.activeProjectType].name 
        : 'the current project';
      
      let codeToReview = code || '';
      let source = 'provided code';
      
      // Try to read from file if specified
      if (filePath && !codeToReview) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
          if (fs.existsSync(resolvedPath)) {
            codeToReview = fs.readFileSync(resolvedPath, 'utf-8');
            source = filePath;
          }
        } catch { /* ignore */ }
      }
      
      // Try to fetch from URL if specified
      if (url && !codeToReview) {
        try {
          const response = await fetch(url);
          codeToReview = await response.text();
          source = url;
        } catch { /* ignore */ }
      }
      
      const rules = serverState.loadedRules
        .filter(r => !serverState.activeConfiguration || serverState.activeConfiguration.selectedRules.includes(r.id))
        .map(r => `- ${r.name}: ${r.description}`)
        .join('\n');
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Review the following code for ${projectName}.

Source: ${source}

Active Rules:
${rules || 'No specific rules selected. Using general best practices.'}

Code to Review:
\`\`\`
${codeToReview.substring(0, 15000)}
\`\`\`
${codeToReview.length > 15000 ? '\n(Code truncated for length)' : ''}

Please analyze for:
1. Compliance with coding standards
2. Security issues
3. Performance concerns
4. Best practices
5. Suggested improvements`
          }
        }]
      };
    }
    
    case 'apply_patterns': {
      const task = promptArgs?.task || '';
      const projectName = serverState.activeProjectType
        ? SUPPORTED_PROJECTS[serverState.activeProjectType].name
        : 'the current project';
      
      const knowledge = serverState.loadedKnowledge
        .filter(k => serverState.activeConfiguration?.selectedKnowledge.includes(k.id))
        .map(k => `### ${k.name}\n${k.description}`)
        .join('\n\n');
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Implement the following task for ${projectName} using established patterns.

Task: ${task}

Available Patterns and Knowledge:
${knowledge || 'No specific knowledge selected. Using general patterns.'}

Please:
1. Analyze the task requirements
2. Suggest appropriate patterns
3. Provide implementation guidance
4. Include code examples where helpful`
          }
        }]
      };
    }
    
    default:
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: `Unknown prompt: ${name}` }
        }]
      };
  }
});

// ==================== MAIN ====================

async function main() {
  // Load active configuration if exists
  const activeConfig = persistence.getActiveConfiguration();
  if (activeConfig) {
    serverState.activeConfiguration = activeConfig;
    serverState.activeProjectType = activeConfig.projectType;
    serverState.loadedRules = rulesProvider.getRulesForProject(activeConfig.projectType);
    serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(activeConfig.projectType);
  }
  
  // Start STDIO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('StackGuide MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
