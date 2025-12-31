#!/usr/bin/env node

/**
 * StackGuide MCP Server
 * 
 * A Model Context Protocol server for dynamic language and framework context loading.
 * Compatible with Cursor and GitHub Copilot.
 * 
 * Architecture:
 * - src/handlers/       - Tool handlers (setup, rules, review, etc.)
 * - src/tools/          - Tool definitions (JSON schemas)
 * - src/utils/          - Utilities (logger, validation)
 * - src/services/       - External services (cursorDirectory, webDocs)
 * - src/resources/      - Data providers (rules, knowledge)
 * - src/config/         - Configuration and persistence
 */

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

import { ProjectType, SUPPORTED_PROJECTS } from './config/types.js';
import * as persistence from './config/persistence.js';
import * as rulesProvider from './resources/rulesProvider.js';
import * as knowledgeProvider from './resources/knowledgeProvider.js';
import * as ruleManager from './services/ruleManager.js';
import * as webDocs from './services/webDocumentation.js';
import * as autoDetect from './services/autoDetect.js';

import { toolDefinitions } from './tools/definitions.js';
import {
  handleSetup,
  handleContext,
  handleRules,
  handleKnowledge,
  handleReview,
  handleCursor,
  handleDocs,
  handleConfig,
  handleCustomRule,
  handleHelp,
  ServerState,
  textResponse
} from './handlers/index.js';
import { logger } from './utils/logger.js';

// ==================== SERVER STATE ====================

const serverState: ServerState = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: []
};

// ==================== CREATE SERVER ====================

const server = new Server(
  {
    name: 'stackguide-mcp',
    version: '2.1.0',
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
  return { tools: toolDefinitions };
});

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
  const { name, arguments: args = {} } = request.params;
  const startTime = Date.now();

  logger.debug(`Tool called: ${name}`, { args });

  try {
    switch (name) {
      case 'setup':
        return await handleSetup(args as any, serverState);
      case 'context':
        return await handleContext(args as any, serverState);
      case 'rules':
        return await handleRules(args as any, serverState);
      case 'knowledge':
        return await handleKnowledge(args as any, serverState);
      case 'review':
        return await handleReview(args as any, serverState);
      case 'cursor':
        return await handleCursor(args as any, serverState);
      case 'docs':
        return await handleDocs(args as any, serverState);
      case 'config':
        return await handleConfig(args as any, serverState);
      case 'custom_rule':
        return await handleCustomRule(args as any, serverState);
      case 'help':
        return await handleHelp(args as any);
      default:
        logger.warn(`Unknown tool: ${name}`);
        return textResponse(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Tool error: ${name}`, { error: message });
    return textResponse(`Error executing tool "${name}": ${message}`);
  } finally {
    logger.debug(`Tool completed: ${name}`, { duration: `${Date.now() - startTime}ms` });
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

    if (uri.startsWith('web-doc://')) {
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
        contents: [{ uri, mimeType: 'text/markdown', text: content }]
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
        contents: [{ uri, mimeType: 'text/markdown', text: fullContext }]
      };
    }

    return {
      contents: [{ uri, mimeType: 'text/plain', text: 'Resource not found' }]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      contents: [{ uri, mimeType: 'text/plain', text: `Error reading resource: ${message}` }]
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
          { name: 'projectPath', description: 'Path to your project (use "." for current directory)', required: false }
        ]
      },
      {
        name: 'code_review',
        description: 'Review code from file, URL, or pasted code against active rules',
        arguments: [
          { name: 'filePath', description: 'Local file path to review (optional)', required: false },
          { name: 'url', description: 'URL to fetch and review (optional)', required: false },
          { name: 'code', description: 'Code snippet to review (optional)', required: false }
        ]
      },
      {
        name: 'apply_patterns',
        description: 'Apply architecture patterns from knowledge base',
        arguments: [
          { name: 'task', description: 'Task or feature to implement', required: true }
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
Just tell me: "Set up my project" and I'll analyze your codebase and configure everything automatically.

## Supported Project Types
${projectTypes}

## What I Can Do
- 📋 Load coding standards and best practices for your stack
- 🔍 Browse and import rules from cursor.directory
- 📚 Provide architecture patterns and solutions
- 💾 Save configurations for your projects

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
      } catch { /* Path might not exist */ }

      if (detection?.detected && detection.projectType) {
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

I couldn't auto-detect the project type. Tell me about your project or choose from:
${Object.values(SUPPORTED_PROJECTS).map(p => `- **${p.type}**: ${p.name}`).join('\n')}`
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

      if (filePath && !codeToReview) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
          if (fs.existsSync(resolved)) {
            codeToReview = fs.readFileSync(resolved, 'utf-8');
            source = filePath;
          }
        } catch { /* ignore */ }
      }

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
  logger.info('Starting StackGuide MCP Server');

  // Load active configuration if exists
  const activeConfig = persistence.getActiveConfiguration();
  if (activeConfig) {
    serverState.activeConfiguration = activeConfig;
    serverState.activeProjectType = activeConfig.projectType;
    serverState.loadedRules = rulesProvider.getRulesForProject(activeConfig.projectType);
    serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(activeConfig.projectType);
    logger.info('Loaded saved configuration', { projectType: activeConfig.projectType });
  }

  // Start STDIO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('StackGuide MCP Server started');
}

main().catch((error) => {
  logger.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
