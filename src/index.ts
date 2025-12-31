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
      // Smart Setup Tools (NEW!)
      {
        name: 'auto_setup',
        description: 'Automatically detect your project type, configure context, and suggest rules. Just provide your project path and StackGuide will do the rest!',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to your project directory. Use "." for current directory.'
            }
          },
          required: ['projectPath']
        }
      },
      {
        name: 'detect_project',
        description: 'Analyze a project directory to detect the framework, languages, and suggest the best configuration',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to your project directory'
            }
          },
          required: ['projectPath']
        }
      },
      {
        name: 'suggest_rules',
        description: 'Get personalized rule suggestions based on your project type and current setup',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type to get suggestions for',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: []
        }
      },
      {
        name: 'quick_start',
        description: 'Get a quick start guide for your detected or selected project type. Perfect for new users!',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to analyze (optional if project type already selected)'
            }
          },
          required: []
        }
      },
      
      // Project Type Tools
      {
        name: 'list_project_types',
        description: 'List all supported project types (Python/Django, React/Node, etc.)',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'select_project_type',
        description: 'Select and activate a project type to load its context, rules and knowledge',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'The project type to select (e.g., python-django, react-node)',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['projectType']
        }
      },
      {
        name: 'get_current_context',
        description: 'Get the currently active project context with loaded rules and knowledge',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      
      // Rules Tools
      {
        name: 'list_rules',
        description: 'List all available rules for the current or specified project type',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type (uses active project if not specified)',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            category: {
              type: 'string',
              description: 'Filter by category',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing', 'documentation', 'naming-conventions']
            }
          },
          required: []
        }
      },
      {
        name: 'get_rule',
        description: 'Get the full content of a specific rule by ID',
        inputSchema: {
          type: 'object',
          properties: {
            ruleId: {
              type: 'string',
              description: 'The ID of the rule to retrieve'
            }
          },
          required: ['ruleId']
        }
      },
      {
        name: 'select_rules',
        description: 'Select which rules to include in the active context',
        inputSchema: {
          type: 'object',
          properties: {
            ruleIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of rule IDs to select'
            }
          },
          required: ['ruleIds']
        }
      },
      {
        name: 'search_rules',
        description: 'Search rules by keyword or term',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'Term to search for in rules'
            },
            projectType: {
              type: 'string',
              description: 'Project type to search in',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['searchTerm']
        }
      },
      
      // Knowledge Tools
      {
        name: 'list_knowledge',
        description: 'List all knowledge base files for the current or specified project type',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type (uses active project if not specified)',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            category: {
              type: 'string',
              description: 'Filter by category',
              enum: ['patterns', 'common-issues', 'architecture', 'snippets', 'workflows', 'troubleshooting']
            }
          },
          required: []
        }
      },
      {
        name: 'get_knowledge',
        description: 'Get the full content of a specific knowledge file by ID',
        inputSchema: {
          type: 'object',
          properties: {
            knowledgeId: {
              type: 'string',
              description: 'The ID of the knowledge file to retrieve'
            }
          },
          required: ['knowledgeId']
        }
      },
      {
        name: 'select_knowledge',
        description: 'Select which knowledge files to include in the active context',
        inputSchema: {
          type: 'object',
          properties: {
            knowledgeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of knowledge file IDs to select'
            }
          },
          required: ['knowledgeIds']
        }
      },
      {
        name: 'search_knowledge',
        description: 'Search knowledge base by keyword or term',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'Term to search for'
            },
            projectType: {
              type: 'string',
              description: 'Project type to search in',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['searchTerm']
        }
      },
      
      // Configuration Tools
      {
        name: 'save_configuration',
        description: 'Save the current context configuration for future use',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name for this configuration'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'load_configuration',
        description: 'Load a previously saved configuration',
        inputSchema: {
          type: 'object',
          properties: {
            configurationId: {
              type: 'string',
              description: 'ID of the configuration to load'
            }
          },
          required: ['configurationId']
        }
      },
      {
        name: 'list_configurations',
        description: 'List all saved configurations',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'delete_configuration',
        description: 'Delete a saved configuration',
        inputSchema: {
          type: 'object',
          properties: {
            configurationId: {
              type: 'string',
              description: 'ID of the configuration to delete'
            }
          },
          required: ['configurationId']
        }
      },
      {
        name: 'export_configuration',
        description: 'Export a configuration as JSON for sharing',
        inputSchema: {
          type: 'object',
          properties: {
            configurationId: {
              type: 'string',
              description: 'ID of the configuration to export'
            }
          },
          required: ['configurationId']
        }
      },
      {
        name: 'import_configuration',
        description: 'Import a configuration from JSON',
        inputSchema: {
          type: 'object',
          properties: {
            jsonConfig: {
              type: 'string',
              description: 'JSON string of the configuration to import'
            }
          },
          required: ['jsonConfig']
        }
      },
      
      // Context Tools
      {
        name: 'get_full_context',
        description: 'Get the complete active context with all selected rules and knowledge combined',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'add_custom_rule',
        description: 'Add a custom rule to the current configuration',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the custom rule'
            },
            category: {
              type: 'string',
              description: 'Category of the rule',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing', 'documentation', 'naming-conventions']
            },
            content: {
              type: 'string',
              description: 'The rule content in markdown format'
            },
            description: {
              type: 'string',
              description: 'Brief description of the rule'
            }
          },
          required: ['name', 'category', 'content']
        }
      },
      
      // ==================== DYNAMIC RULE MANAGEMENT ====================
      {
        name: 'create_rule',
        description: 'Create a new custom rule for the specified project type. The rule will be persisted and available in future sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type for this rule',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            name: {
              type: 'string',
              description: 'Name of the rule'
            },
            category: {
              type: 'string',
              description: 'Category of the rule',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing', 'documentation', 'naming-conventions']
            },
            content: {
              type: 'string',
              description: 'The rule content in markdown format'
            },
            description: {
              type: 'string',
              description: 'Brief description of the rule'
            }
          },
          required: ['projectType', 'name', 'category', 'content']
        }
      },
      {
        name: 'create_rule_from_template',
        description: 'Create a new rule using a predefined template (coding-standard, best-practice, security, architecture, testing)',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type for this rule',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            templateId: {
              type: 'string',
              description: 'Template to use',
              enum: ['coding-standard', 'best-practice', 'security', 'architecture', 'testing']
            },
            name: {
              type: 'string',
              description: 'Name for the new rule'
            },
            category: {
              type: 'string',
              description: 'Category of the rule',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing', 'documentation', 'naming-conventions']
            },
            description: {
              type: 'string',
              description: 'Description for the rule'
            },
            language: {
              type: 'string',
              description: 'Programming language for code examples (default: typescript)'
            }
          },
          required: ['projectType', 'templateId', 'name', 'category', 'description']
        }
      },
      {
        name: 'list_rule_templates',
        description: 'List all available rule templates',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_rule_template',
        description: 'Get the content of a specific rule template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template ID',
              enum: ['coding-standard', 'best-practice', 'security', 'architecture', 'testing']
            }
          },
          required: ['templateId']
        }
      },
      {
        name: 'update_rule',
        description: 'Update an existing user-created rule',
        inputSchema: {
          type: 'object',
          properties: {
            ruleId: {
              type: 'string',
              description: 'ID of the rule to update (must be a user-created rule starting with "user-")'
            },
            name: {
              type: 'string',
              description: 'New name for the rule'
            },
            content: {
              type: 'string',
              description: 'New content for the rule'
            },
            description: {
              type: 'string',
              description: 'New description'
            },
            enabled: {
              type: 'boolean',
              description: 'Enable or disable the rule'
            }
          },
          required: ['ruleId']
        }
      },
      {
        name: 'delete_rule',
        description: 'Delete a user-created rule',
        inputSchema: {
          type: 'object',
          properties: {
            ruleId: {
              type: 'string',
              description: 'ID of the rule to delete (must be a user-created rule starting with "user-")'
            }
          },
          required: ['ruleId']
        }
      },
      {
        name: 'list_user_rules',
        description: 'List all user-created rules for a project type',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type to list rules for',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['projectType']
        }
      },
      {
        name: 'export_user_rules',
        description: 'Export all user-created rules as JSON for backup or sharing',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'import_user_rules',
        description: 'Import user rules from JSON',
        inputSchema: {
          type: 'object',
          properties: {
            jsonRules: {
              type: 'string',
              description: 'JSON string containing rules to import'
            }
          },
          required: ['jsonRules']
        }
      },
      
      // ==================== WEB DOCUMENTATION ====================
      {
        name: 'fetch_web_docs',
        description: 'Fetch documentation from a web URL and add it to the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the documentation to fetch'
            },
            projectType: {
              type: 'string',
              description: 'Associate with a project type',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            category: {
              type: 'string',
              description: 'Category for the documentation'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for easy searching'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'fetch_multiple_docs',
        description: 'Fetch documentation from multiple URLs at once',
        inputSchema: {
          type: 'object',
          properties: {
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of URLs to fetch'
            },
            projectType: {
              type: 'string',
              description: 'Associate with a project type',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['urls']
        }
      },
      {
        name: 'get_web_doc',
        description: 'Get the content of a previously fetched web document',
        inputSchema: {
          type: 'object',
          properties: {
            idOrUrl: {
              type: 'string',
              description: 'ID or URL of the document'
            }
          },
          required: ['idOrUrl']
        }
      },
      {
        name: 'search_web_docs',
        description: 'Search through fetched web documentation',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'list_web_docs',
        description: 'List all fetched web documentation',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_suggested_docs',
        description: 'Get suggested documentation URLs for a project type',
        inputSchema: {
          type: 'object',
          properties: {
            projectType: {
              type: 'string',
              description: 'Project type',
              enum: Object.keys(SUPPORTED_PROJECTS)
            }
          },
          required: ['projectType']
        }
      },
      {
        name: 'remove_web_doc',
        description: 'Remove a fetched web document from cache',
        inputSchema: {
          type: 'object',
          properties: {
            idOrUrl: {
              type: 'string',
              description: 'ID or URL of the document to remove'
            }
          },
          required: ['idOrUrl']
        }
      },
      
      // ==================== CURSOR DIRECTORY INTEGRATION ====================
      {
        name: 'browse_cursor_directory',
        description: 'Browse rules from cursor.directory by category. Available categories include: typescript, python, react, next.js, vue, django, fastapi, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Category to browse (e.g., typescript, python, react, next.js, vue, django)'
            }
          },
          required: ['category']
        }
      },
      {
        name: 'search_cursor_directory',
        description: 'Search for rules on cursor.directory',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "react hooks", "python fastapi", "typescript best practices")'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_cursor_directory_rule',
        description: 'Get a specific rule from cursor.directory by its slug',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Rule slug from cursor.directory URL (e.g., "nextjs-react-typescript-cursor-rules")'
            },
            category: {
              type: 'string',
              description: 'Category of the rule'
            }
          },
          required: ['slug']
        }
      },
      {
        name: 'list_cursor_directory_categories',
        description: 'List all available categories on cursor.directory',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_popular_cursor_rules',
        description: 'Get popular/featured rules from cursor.directory',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'import_cursor_directory_rule',
        description: 'Import a rule from cursor.directory into your local rules collection',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Rule slug from cursor.directory'
            },
            projectType: {
              type: 'string',
              description: 'Project type to import the rule into',
              enum: Object.keys(SUPPORTED_PROJECTS)
            },
            category: {
              type: 'string',
              description: 'Local category for the imported rule',
              enum: ['coding-standards', 'best-practices', 'security', 'performance', 'architecture', 'testing']
            }
          },
          required: ['slug', 'projectType']
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
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Project type "${project.name}" activated`,
              rulesLoaded: serverState.loadedRules.length,
              knowledgeLoaded: serverState.loadedKnowledge.length
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
          return { content: [{ type: 'text', text: 'Error: No project type selected.' }] };
        }
        
        const selectedRules = serverState.activeConfiguration?.selectedRules || [];
        const selectedKnowledge = serverState.activeConfiguration?.selectedKnowledge || [];
        
        const rulesContent = rulesProvider.getCombinedRulesContent(selectedRules);
        const knowledgeContent = knowledgeProvider.getCombinedKnowledgeContent(selectedKnowledge);
        
        const fullContext = `# Project Context: ${SUPPORTED_PROJECTS[serverState.activeProjectType].name}

## Rules and Guidelines

${rulesContent || 'No rules selected.'}

---

## Knowledge Base

${knowledgeContent || 'No knowledge files selected.'}
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
        description: 'Review code following the active rules and best practices',
        arguments: [
          {
            name: 'code',
            description: 'Code to review',
            required: true
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
      const code = promptArgs?.code || '';
      const projectName = serverState.activeProjectType 
        ? SUPPORTED_PROJECTS[serverState.activeProjectType].name 
        : 'the current project';
      
      const rules = serverState.loadedRules
        .filter(r => serverState.activeConfiguration?.selectedRules.includes(r.id))
        .map(r => `- ${r.name}: ${r.description}`)
        .join('\n');
      
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Review the following code for ${projectName}.

Active Rules:
${rules || 'No specific rules selected. Using general best practices.'}

Code to Review:
\`\`\`
${code}
\`\`\`

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
