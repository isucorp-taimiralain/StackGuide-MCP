/**
 * Tests for Generate Handler - Phase 6
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGenerate } from '../../src/handlers/generate.js';
import { ServerState } from '../../src/handlers/types.js';

describe('handleGenerate', () => {
  let mockState: ServerState;

  beforeEach(() => {
    mockState = {
      activeProjectType: 'react-typescript',
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: []
    };
  });

  describe('component generation', () => {
    it('should generate TypeScript React component', async () => {
      const result = await handleGenerate(
        { type: 'component', name: 'UserCard' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.type).toBe('component');
      expect(data.name).toBe('UserCard');
      expect(data.filename).toBe('UserCard.tsx');
      expect(data.code).toContain('interface UserCardProps');
      expect(data.code).toContain('export const UserCard');
      expect(data.code).toContain('React.FC');
    });

    it('should generate JavaScript component when typescript is false', async () => {
      mockState.activeProjectType = 'react';
      const result = await handleGenerate(
        { type: 'component', name: 'Button', options: { typescript: false } },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.code).not.toContain('interface');
      expect(data.code).toContain('export const Button');
    });

    it('should include styles import when withStyles is true', async () => {
      const result = await handleGenerate(
        { type: 'component', name: 'Card', options: { withStyles: true } },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.code).toContain("import styles from './Card.module.css'");
    });
  });

  describe('hook generation', () => {
    it('should generate TypeScript hook', async () => {
      const result = await handleGenerate(
        { type: 'hook', name: 'useAuth' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.type).toBe('hook');
      expect(data.code).toContain('export function useAuth');
      expect(data.code).toContain('useState');
      expect(data.code).toContain('useEffect');
    });

    it('should add use prefix if missing', async () => {
      const result = await handleGenerate(
        { type: 'hook', name: 'Auth' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.code).toContain('function useAuth');
    });
  });

  describe('service generation', () => {
    it('should generate TypeScript service', async () => {
      const result = await handleGenerate(
        { type: 'service', name: 'Api' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.code).toContain('class ApiService');
      expect(data.code).toContain('async getAll');
      expect(data.code).toContain('async create');
      expect(data.code).toContain('async update');
      expect(data.code).toContain('async delete');
    });
  });

  describe('test generation', () => {
    it('should generate Vitest test file by default', async () => {
      const result = await handleGenerate(
        { type: 'test', name: 'UserCard' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.filename).toBe('UserCard.test.ts');
      expect(data.code).toContain("from 'vitest'");
      expect(data.code).toContain('describe');
      expect(data.code).toContain('vi.restoreAllMocks');
    });

    it('should generate Jest test file when specified', async () => {
      const result = await handleGenerate(
        { type: 'test', name: 'Api', options: { framework: 'jest' } },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.code).not.toContain('vitest');
      expect(data.code).toContain('describe');
      expect(data.code).toContain('beforeEach');
    });
  });

  describe('API route generation', () => {
    it('should generate Next.js API route when specified', async () => {
      const result = await handleGenerate(
        { type: 'api', name: 'Users', options: { framework: 'nextjs' } },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.code).toContain('NextRequest');
      expect(data.code).toContain('NextResponse');
      expect(data.code).toContain('export async function GET');
      expect(data.code).toContain('export async function POST');
    });

    it('should generate Express router by default', async () => {
      const result = await handleGenerate(
        { type: 'api', name: 'Products' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.code).toContain('Router');
      expect(data.code).toContain("router.get('/'");
      expect(data.code).toContain("router.post('/'");
    });
  });

  describe('model generation', () => {
    it('should generate TypeScript model', async () => {
      const result = await handleGenerate(
        { type: 'model', name: 'User' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.code).toContain('export interface User');
      expect(data.code).toContain('createdAt: Date');
      expect(data.code).toContain('function createUser');
      expect(data.code).toContain('function validateUser');
    });
  });

  describe('utility generation', () => {
    it('should generate TypeScript utility module', async () => {
      const result = await handleGenerate(
        { type: 'util', name: 'Format' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.code).toContain('export function formatFormat');
      expect(data.code).toContain('export function parseFormat');
      expect(data.code).toContain('export function isValidFormat');
    });
  });

  describe('error handling', () => {
    it('should return error for missing type', async () => {
      const result = await handleGenerate(
        { type: undefined as any, name: 'Test' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
      expect(data.availableTypes).toBeDefined();
    });

    it('should return error for missing name', async () => {
      const result = await handleGenerate(
        { type: 'component', name: '' },
        mockState
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });

    it('should return validation error for unknown type', async () => {
      const result = await handleGenerate(
        { type: 'unknown' as any, name: 'Test' },
        mockState
      );

      // With Zod validation, invalid types return validation error
      expect(result.content[0].text).toContain('Validation error');
    });
  });
});
