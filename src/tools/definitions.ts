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
          enum: ['setup', 'rules', 'review', 'cursor', 'docs', 'config', 'all']
        }
      },
      required: []
    }
  }
];
