/**
 * Tool definitions for StackGuide MCP Server
 * These are the JSON schemas exposed to the MCP client
 */

import { SUPPORTED_PROJECTS } from '../config/types.js';

export const toolDefinitions = [
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
    description: 'Analyze code for issues using pattern matching. Detects security vulnerabilities, performance problems, coding standard violations, and architecture issues. Returns a score (0-100) and detailed report with suggestions. Works on files, URLs, or entire projects.',
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

  // ==================== CURSOR DIRECTORY (1) ====================
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
          enum: ['setup', 'rules', 'review', 'cursor', 'docs', 'config', 'generate', 'health', 'all']
        }
      },
      required: []
    }
  },

  // ==================== ADVANCED FEATURES (2) ====================
  {
    name: 'generate',
    description: 'Generate boilerplate code from templates. Create components, hooks, services, tests, API routes, models, and utilities with best practices built in.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of code to generate',
          enum: ['component', 'hook', 'service', 'test', 'api', 'model', 'util']
        },
        name: {
          type: 'string',
          description: 'Name for the generated code (e.g., UserCard, useAuth, ApiService)'
        },
        options: {
          type: 'object',
          description: 'Generation options',
          properties: {
            typescript: {
              type: 'boolean',
              description: 'Generate TypeScript code (default: auto-detect from project)'
            },
            withTests: {
              type: 'boolean',
              description: 'Include test file template'
            },
            withStyles: {
              type: 'boolean',
              description: 'Include CSS module import (for components)'
            },
            framework: {
              type: 'string',
              description: 'Target framework (nextjs, express, vitest, jest)',
              enum: ['nextjs', 'express', 'vitest', 'jest']
            }
          }
        }
      },
      required: ['type', 'name']
    }
  },
  {
    name: 'health',
    description: 'Get a comprehensive health score for your project. Analyzes configuration, code quality, structure, documentation, and testing readiness. Returns a grade (A-F) with detailed recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Project path to analyze (default: current project)'
        },
        detailed: {
          type: 'boolean',
          description: 'Include detailed breakdown by category (default: true)'
        }
      },
      required: []
    }
  },

  // ==================== WORKFLOW (1) - NEW in v4.0.0 ====================
  {
    name: 'workflow',
    description: 'TDD agentic workflow with lazy loading. Load agents, skills, hooks and commands on demand to save tokens. Five roles: Intake → Planner → Implementer → Verifier → Releaser.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['list', 'agent', 'skill', 'command', 'hook']
        },
        name: {
          type: 'string',
          description: 'Name of the item to load (e.g. "tdd-planner", "tdd-core", "verify")'
        },
        category: {
          type: 'string',
          description: 'Filter list by category',
          enum: ['agents', 'skills', 'hooks', 'commands']
        }
      },
      required: []
    }
  },

  // ==================== INIT (1) - NEW in v4.0.0 ====================
  {
    name: 'init',
    description: 'Initialize a project with the StackGuide TDD workflow. Auto-detects your stack and scaffolds a .stackguide/ directory with only the relevant agents, skills and hooks.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['detect', 'full', 'status']
        },
        path: {
          type: 'string',
          description: 'Project path (default: current directory)'
        },
        type: {
          type: 'string',
          description: 'Force a project type instead of auto-detecting',
          enum: Object.keys(SUPPORTED_PROJECTS)
        }
      },
      required: []
    }
  },

  // ==================== AGENT (1) - NEW in v4.1.0 ====================
  {
    name: 'agent',
    description: 'Active agent workflow actions that execute real work: intake (ticket read), plan (TDD plan), verify (run tests/lint/build + checks), release (CI + release notes/tag/PR).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Active workflow action',
          enum: ['status', 'intake', 'plan', 'verify', 'release']
        },
        path: {
          type: 'string',
          description: 'Project path (default: current directory)'
        },
        ticket: {
          type: 'string',
          description: 'Ticket key for intake/plan actions (e.g. PROJ-123)'
        },
        brief: {
          type: 'string',
          description: 'Structured or plain brief text for planning'
        },
        version: {
          type: 'string',
          description: 'Target release version for release action (e.g. v1.2.0)'
        },
        createTag: {
          type: 'boolean',
          description: 'If true, release action creates annotated git tag when CI is green'
        },
        createPullRequest: {
          type: 'boolean',
          description: 'If true, release action opens PR/MR when provider is configured'
        }
      },
      required: []
    }
  },

  // ==================== PROJECT INTELLIGENCE (1) - NEW in v3.3.0 ====================
  {
    name: 'analyze',
    description: 'Project Intelligence: Comprehensive analysis of project structure, configuration, and dependencies. Provides smart recommendations, generates optimal configs, and suggests improvements based on framework best practices.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Type of analysis to perform',
          enum: ['full', 'structure', 'config', 'dependencies', 'generate', 'apply']
        },
        path: {
          type: 'string',
          description: 'Project path to analyze (default: current directory)'
        },
        configType: {
          type: 'string',
          description: 'Config type to generate (for action:"generate")',
          enum: ['eslint', 'prettier', 'tsconfig', 'editorconfig', 'gitignore', 'vitest', 'jest']
        },
        autoFix: {
          type: 'boolean',
          description: 'Automatically apply safe fixes (default: false)'
        },
        format: {
          type: 'string',
          description: 'Output format',
          enum: ['json', 'markdown']
        }
      },
      required: []
    }
  }
];
