import { describe, it, expect } from 'vitest';
import { handleWorkflow } from '../src/handlers/workflow.js';

const mockState = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: [],
};

function parseResponse(result: { content: Array<{ text: string }> }): unknown {
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

describe('workflow handler', () => {
  describe('list action', () => {
    it('should list all categories when no filter', async () => {
      const result = await handleWorkflow({ action: 'list' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('workflow', 'tdd');
      expect(data).toHaveProperty('categories');
      const categories = data.categories as Record<string, string[]>;
      expect(categories).toHaveProperty('agents');
      expect(categories).toHaveProperty('skills');
      expect(categories).toHaveProperty('hooks');
      expect(categories).toHaveProperty('commands');
    });

    it('should list a specific category', async () => {
      const result = await handleWorkflow({ action: 'list', category: 'agents' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('category', 'agents');
      expect((data.items as string[]).length).toBeGreaterThanOrEqual(5);
    });

    it('should list skills', async () => {
      const result = await handleWorkflow({ action: 'list', category: 'skills' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('category', 'skills');
      expect((data.items as string[]).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('agent action', () => {
    it('should load the tdd-planner agent', async () => {
      const result = await handleWorkflow({ action: 'agent', name: 'tdd-planner' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('TDD Planner');
      expect(text).toContain('vertical slice');
    });

    it('should load the task-intake agent', async () => {
      const result = await handleWorkflow({ action: 'agent', name: 'task-intake' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Task Intake');
    });

    it('should load the verifier agent', async () => {
      const result = await handleWorkflow({ action: 'agent', name: 'verifier' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Verifier');
    });

    it('should return error for unknown agent', async () => {
      const result = await handleWorkflow({ action: 'agent', name: 'nonexistent' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('error');
    });

    it('should return error when name is missing', async () => {
      const result = await handleWorkflow({ action: 'agent' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('error');
    });
  });

  describe('skill action', () => {
    it('should load tdd-core skill', async () => {
      const result = await handleWorkflow({ action: 'skill', name: 'tdd-core' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Core TDD Workflow');
      expect(text).toContain('Red');
      expect(text).toContain('Green');
      expect(text).toContain('Refactor');
    });

    it('should load stack-laravel skill', async () => {
      const result = await handleWorkflow({ action: 'skill', name: 'stack-laravel' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Laravel');
    });

    it('should load mr-conventions skill', async () => {
      const result = await handleWorkflow({ action: 'skill', name: 'mr-conventions' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('MR');
    });
  });

  describe('command action', () => {
    it('should load plan command', async () => {
      const result = await handleWorkflow({ action: 'command', name: 'plan' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Plan');
      expect(text).toContain('TDD');
    });

    it('should load verify command', async () => {
      const result = await handleWorkflow({ action: 'command', name: 'verify' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Verify');
    });
  });

  describe('hook action', () => {
    it('should load check-branch-name hook', async () => {
      const result = await handleWorkflow({ action: 'hook', name: 'check-branch-name' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('#!/usr/bin/env bash');
      expect(text).toContain('BRANCH');
    });

    it('should load check-commit-msg hook', async () => {
      const result = await handleWorkflow({ action: 'hook', name: 'check-commit-msg' }, mockState);
      const text = result.content[0].text;
      expect(text).toContain('Conventional Commits');
    });
  });

  describe('invalid action', () => {
    it('should return error for unknown action', async () => {
      const result = await handleWorkflow({ action: 'foobar' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('error');
    });
  });

  describe('default action', () => {
    it('should default to list', async () => {
      const result = await handleWorkflow({}, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('workflow', 'tdd');
    });
  });
});
