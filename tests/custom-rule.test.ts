/**
 * Tests for Custom Rule Handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCustomRule } from '../src/handlers/custom-rule.js';
import { ServerState } from '../src/handlers/types.js';
import * as ruleManager from '../src/services/ruleManager.js';

// Mock the ruleManager service
vi.mock('../src/services/ruleManager.js', () => ({
  createUserRule: vi.fn((pt, cat, name, content, desc) => ({
    id: `user-${pt}-${cat}-${name}`,
    name,
    category: cat,
    content,
    description: desc || '',
    enabled: true
  })),
  getUserRules: vi.fn((pt) => [
    { id: `user-${pt}-coding-rule1`, name: 'Rule 1', category: 'coding', content: 'Rule 1 content' },
    { id: `user-${pt}-security-rule2`, name: 'Rule 2', category: 'security', content: 'Rule 2 content' }
  ]),
  updateUserRule: vi.fn((id, updates) => ({
    id,
    name: updates.name || 'Updated Rule',
    content: updates.content || 'Updated content',
    category: 'coding'
  })),
  deleteUserRule: vi.fn(() => true),
  exportAllUserRules: vi.fn(() => JSON.stringify({
    'react-typescript': [{ id: 'rule-1', name: 'Rule 1', content: 'Content' }]
  }, null, 2)),
  importUserRules: vi.fn(() => 2)
}));

describe('custom-rule handler', () => {
  let state: ServerState;

  beforeEach(() => {
    state = {
      activeProjectType: 'react-typescript',
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
    vi.clearAllMocks();
  });

  describe('handleCustomRule', () => {
    describe('create action', () => {
      it('should require name, content, and category', async () => {
        const response = await handleCustomRule({ action: 'create' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('name');
        expect(response.content[0].text).toContain('content');
        expect(response.content[0].text).toContain('category');
      });

      it('should require content when only name provided', async () => {
        const response = await handleCustomRule({ action: 'create', name: 'My Rule' }, state);
        
        expect(response.content[0].text).toContain('Error');
      });

      it('should create rule with all required fields', async () => {
        const response = await handleCustomRule({
          action: 'create',
          name: 'My Custom Rule',
          content: '# Rule content\nFollow these guidelines',
          category: 'coding-standards'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.id).toBeDefined();
        expect(data.name).toBe('My Custom Rule');
        expect(ruleManager.createUserRule).toHaveBeenCalledWith(
          'react-typescript',
          'coding-standards',
          'My Custom Rule',
          '# Rule content\nFollow these guidelines'
        );
      });

      it('should use default project type when not configured', async () => {
        state.activeProjectType = null;
        
        await handleCustomRule({
          action: 'create',
          name: 'Rule',
          content: 'Content',
          category: 'coding-standards'
        }, state);
        
        expect(ruleManager.createUserRule).toHaveBeenCalledWith(
          'react-typescript',
          expect.any(String),
          expect.any(String),
          expect.any(String)
        );
      });
    });

    describe('list action', () => {
      it('should list user rules by default', async () => {
        const response = await handleCustomRule({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.projectType).toBe('react-typescript');
        expect(data.rules).toBeDefined();
        expect(Array.isArray(data.rules)).toBe(true);
        expect(ruleManager.getUserRules).toHaveBeenCalledWith('react-typescript');
      });

      it('should list rules with explicit action', async () => {
        const response = await handleCustomRule({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.rules).toBeDefined();
        expect(data.rules.length).toBeGreaterThan(0);
      });

      it('should return rule id, name, and category', async () => {
        const response = await handleCustomRule({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        const rule = data.rules[0];
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('category');
      });
    });

    describe('update action', () => {
      it('should require id for update', async () => {
        const response = await handleCustomRule({ action: 'update' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('id');
      });

      it('should update rule with id', async () => {
        const response = await handleCustomRule({
          action: 'update',
          id: 'user-react-typescript-coding-rule1',
          name: 'Updated Rule Name',
          content: 'Updated content'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.rule).toBeDefined();
        expect(ruleManager.updateUserRule).toHaveBeenCalledWith(
          'user-react-typescript-coding-rule1',
          { name: 'Updated Rule Name', content: 'Updated content' }
        );
      });

      it('should handle update failure', async () => {
        vi.mocked(ruleManager.updateUserRule).mockReturnValueOnce(null);
        
        const response = await handleCustomRule({
          action: 'update',
          id: 'nonexistent-rule'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(false);
      });
    });

    describe('delete action', () => {
      it('should require id for delete', async () => {
        const response = await handleCustomRule({ action: 'delete' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('id');
      });

      it('should delete rule with id', async () => {
        const response = await handleCustomRule({
          action: 'delete',
          id: 'user-react-typescript-coding-rule1'
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.deleted).toBe('user-react-typescript-coding-rule1');
        expect(ruleManager.deleteUserRule).toHaveBeenCalledWith('user-react-typescript-coding-rule1');
      });
    });

    describe('export action', () => {
      it('should export all user rules', async () => {
        const response = await handleCustomRule({ action: 'export' }, state);
        
        expect(response.content[0].text).toBeDefined();
        expect(ruleManager.exportAllUserRules).toHaveBeenCalled();
        
        // Should be valid JSON
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('react-typescript');
      });
    });

    describe('import action', () => {
      it('should require json for import', async () => {
        const response = await handleCustomRule({ action: 'import' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('json');
      });

      it('should import rules from json', async () => {
        const jsonData = JSON.stringify({
          'react-typescript': [
            { name: 'Imported Rule', content: 'Content', category: 'coding' }
          ]
        });
        
        const response = await handleCustomRule({
          action: 'import',
          json: jsonData
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.imported).toBe(2);
        expect(ruleManager.importUserRules).toHaveBeenCalledWith(jsonData);
      });
    });

    describe('default action', () => {
      it('should return validation error for invalid action', async () => {
        const response = await handleCustomRule({ action: 'unknown' as any }, state);
        
        // With Zod validation, invalid actions return validation error
        expect(response.content[0].text).toContain('Validation error');
      });
    });
  });
});
