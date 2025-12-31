/**
 * Tests for Tool Definitions
 */
import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../src/tools/definitions.js';

describe('tool definitions', () => {
  describe('toolDefinitions', () => {
    it('should export an array of tools', () => {
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have required properties for each tool', () => {
      for (const tool of toolDefinitions) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
      }
    });

    it('should have valid inputSchema for each tool', () => {
      for (const tool of toolDefinitions) {
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(tool.inputSchema).toHaveProperty('required');
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      }
    });

    it('should include core tools', () => {
      const toolNames = toolDefinitions.map(t => t.name);
      
      expect(toolNames).toContain('setup');
      expect(toolNames).toContain('rules');
      expect(toolNames).toContain('knowledge');
      expect(toolNames).toContain('review');
      expect(toolNames).toContain('help');
    });

    it('should include context tool', () => {
      const toolNames = toolDefinitions.map(t => t.name);
      expect(toolNames).toContain('context');
    });

    it('should include utility tools', () => {
      const toolNames = toolDefinitions.map(t => t.name);
      
      expect(toolNames).toContain('cursor');
      expect(toolNames).toContain('docs');
      expect(toolNames).toContain('config');
    });

    it('setup tool should have path and type properties', () => {
      const setupTool = toolDefinitions.find(t => t.name === 'setup');
      expect(setupTool).toBeDefined();
      expect(setupTool?.inputSchema.properties).toHaveProperty('path');
      expect(setupTool?.inputSchema.properties).toHaveProperty('type');
    });

    it('review tool should have file, url, project, and focus properties', () => {
      const reviewTool = toolDefinitions.find(t => t.name === 'review');
      expect(reviewTool).toBeDefined();
      expect(reviewTool?.inputSchema.properties).toHaveProperty('file');
      expect(reviewTool?.inputSchema.properties).toHaveProperty('url');
      expect(reviewTool?.inputSchema.properties).toHaveProperty('project');
      expect(reviewTool?.inputSchema.properties).toHaveProperty('focus');
    });

    it('rules tool should have action enum', () => {
      const rulesTool = toolDefinitions.find(t => t.name === 'rules');
      expect(rulesTool).toBeDefined();
      expect(rulesTool?.inputSchema.properties.action).toHaveProperty('enum');
      expect(rulesTool?.inputSchema.properties.action.enum).toContain('list');
      expect(rulesTool?.inputSchema.properties.action.enum).toContain('search');
      expect(rulesTool?.inputSchema.properties.action.enum).toContain('get');
    });

    it('knowledge tool should have category enum', () => {
      const knowledgeTool = toolDefinitions.find(t => t.name === 'knowledge');
      expect(knowledgeTool).toBeDefined();
      expect(knowledgeTool?.inputSchema.properties.category).toHaveProperty('enum');
      expect(knowledgeTool?.inputSchema.properties.category.enum).toContain('patterns');
    });

    it('cursor tool should have all required actions', () => {
      const cursorTool = toolDefinitions.find(t => t.name === 'cursor');
      expect(cursorTool).toBeDefined();
      expect(cursorTool?.inputSchema.properties.action.enum).toContain('browse');
      expect(cursorTool?.inputSchema.properties.action.enum).toContain('search');
      expect(cursorTool?.inputSchema.properties.action.enum).toContain('popular');
      expect(cursorTool?.inputSchema.properties.action.enum).toContain('import');
    });

    it('config tool should have all required actions', () => {
      const configTool = toolDefinitions.find(t => t.name === 'config');
      expect(configTool).toBeDefined();
      expect(configTool?.inputSchema.properties.action.enum).toContain('save');
      expect(configTool?.inputSchema.properties.action.enum).toContain('load');
      expect(configTool?.inputSchema.properties.action.enum).toContain('list');
      expect(configTool?.inputSchema.properties.action.enum).toContain('delete');
    });

    it('should have unique tool names', () => {
      const toolNames = toolDefinitions.map(t => t.name);
      const uniqueNames = new Set(toolNames);
      expect(toolNames.length).toBe(uniqueNames.size);
    });

    it('descriptions should not be empty', () => {
      for (const tool of toolDefinitions) {
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it('should have 12 tools', () => {
      // Core: setup, context, rules, knowledge, review
      // Utility: cursor, docs, config, custom_rule, help
      // Advanced: generate, health
      expect(toolDefinitions.length).toBe(12);
    });
  });
});
