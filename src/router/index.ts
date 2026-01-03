/**
 * Router - Handler Registry Pattern for MCP Server
 * Replaces switch statements with clean registry-based routing
 * @version 3.4.0
 */

import { ProjectType, SUPPORTED_PROJECTS } from '../config/types.js';
import { textResponse, ServerState } from '../handlers/index.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
}

export type ToolHandler<TArgs = Record<string, unknown>> = (
  args: TArgs,
  state: ServerState
) => Promise<ToolResponse>;

export type PromptHandler = (
  args: Record<string, unknown>,
  state: ServerState
) => Promise<{
  messages: Array<{
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
  }>;
}>;

export type ResourceReader = (
  uri: string,
  state: ServerState
) => Promise<{
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
} | null>;

// ============================================================================
// Tool Router
// ============================================================================

class ToolRouter {
  private handlers: Map<string, ToolHandler> = new Map();
  
  register(name: string, handler: ToolHandler): this {
    if (this.handlers.has(name)) {
      logger.warn(`Overwriting handler for tool: ${name}`);
    }
    this.handlers.set(name, handler);
    return this;
  }
  
  registerAll(handlers: Record<string, ToolHandler>): this {
    for (const [name, handler] of Object.entries(handlers)) {
      this.register(name, handler);
    }
    return this;
  }
  
  has(name: string): boolean {
    return this.handlers.has(name);
  }
  
  async handle(
    name: string,
    args: Record<string, unknown>,
    state: ServerState
  ): Promise<ToolResponse> {
    const handler = this.handlers.get(name);
    
    if (!handler) {
      logger.warn(`Unknown tool: ${name}`);
      return textResponse(`Unknown tool: ${name}`);
    }
    
    const startTime = Date.now();
    logger.debug(`Tool called: ${name}`, { args });
    
    try {
      const result = await handler(args, state);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Tool error: ${name}`, { error: message });
      return textResponse(`Error executing tool "${name}": ${message}`);
    } finally {
      logger.debug(`Tool completed: ${name}`, { duration: `${Date.now() - startTime}ms` });
    }
  }
  
  listTools(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// Resource Router
// ============================================================================

interface ResourceRoute {
  pattern: RegExp | string;
  reader: ResourceReader;
}

class ResourceRouter {
  private routes: ResourceRoute[] = [];
  
  register(pattern: RegExp | string, reader: ResourceReader): this {
    this.routes.push({ pattern, reader });
    return this;
  }
  
  async read(
    uri: string,
    state: ServerState
  ): Promise<{
    contents: Array<{
      uri: string;
      mimeType: string;
      text: string;
    }>;
  }> {
    for (const route of this.routes) {
      const matches = typeof route.pattern === 'string'
        ? uri === route.pattern
        : route.pattern.test(uri);
      
      if (matches) {
        try {
          const result = await route.reader(uri, state);
          if (result) return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: `Error reading resource: ${message}`
            }]
          };
        }
      }
    }
    
    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: 'Resource not found'
      }]
    };
  }
}

// ============================================================================
// Prompt Router
// ============================================================================

class PromptRouter {
  private handlers: Map<string, PromptHandler> = new Map();
  
  register(name: string, handler: PromptHandler): this {
    this.handlers.set(name, handler);
    return this;
  }
  
  async handle(
    name: string,
    args: Record<string, unknown>,
    state: ServerState
  ): Promise<{
    messages: Array<{
      role: 'user' | 'assistant';
      content: { type: 'text'; text: string };
    }>;
  }> {
    const handler = this.handlers.get(name);
    
    if (!handler) {
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: `Unknown prompt: ${name}` }
        }]
      };
    }
    
    return handler(args, state);
  }
  
  listPrompts(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createToolRouter(): ToolRouter {
  return new ToolRouter();
}

export function createResourceRouter(): ResourceRouter {
  return new ResourceRouter();
}

export function createPromptRouter(): PromptRouter {
  return new PromptRouter();
}

// ============================================================================
// Exports
// ============================================================================

export { ToolRouter, ResourceRouter, PromptRouter };
