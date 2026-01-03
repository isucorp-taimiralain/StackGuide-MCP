/**
 * Zod Validation Tests
 * @version 3.6.0
 */

import { describe, it, expect } from 'vitest';
import {
  validate,
  validateOrThrow,
  withValidation,
  ProjectTypeSchema,
  SeveritySchema,
  FilePathSchema,
  UrlSchema,
  SafeStringSchema,
  IdentifierSchema,
  SetupInputSchema,
  RulesInputSchema,
  ReviewInputSchema,
  ConfigInputSchema,
  GenerateInputSchema,
  sanitizeForDisplay,
  sanitizePath,
  sanitizeIdentifier,
  validateHandlerInput,
  HANDLER_SCHEMAS
} from '../src/validation/index.js';

describe('Zod Validation Schemas', () => {
  describe('ProjectTypeSchema', () => {
    it('should accept valid project types', () => {
      expect(ProjectTypeSchema.safeParse('react-typescript').success).toBe(true);
      expect(ProjectTypeSchema.safeParse('nextjs').success).toBe(true);
      expect(ProjectTypeSchema.safeParse('python-fastapi').success).toBe(true);
      expect(ProjectTypeSchema.safeParse('golang').success).toBe(true);
      expect(ProjectTypeSchema.safeParse('rust').success).toBe(true);
    });

    it('should reject invalid project types', () => {
      expect(ProjectTypeSchema.safeParse('invalid').success).toBe(false);
      expect(ProjectTypeSchema.safeParse('').success).toBe(false);
      expect(ProjectTypeSchema.safeParse(123).success).toBe(false);
    });
  });

  describe('SeveritySchema', () => {
    it('should accept valid severities', () => {
      expect(SeveritySchema.safeParse('error').success).toBe(true);
      expect(SeveritySchema.safeParse('warning').success).toBe(true);
      expect(SeveritySchema.safeParse('info').success).toBe(true);
      expect(SeveritySchema.safeParse('suggestion').success).toBe(true);
    });

    it('should reject invalid severities', () => {
      expect(SeveritySchema.safeParse('critical').success).toBe(false);
      expect(SeveritySchema.safeParse('').success).toBe(false);
    });
  });

  describe('FilePathSchema', () => {
    it('should accept valid file paths', () => {
      expect(FilePathSchema.safeParse('/path/to/file.ts').success).toBe(true);
      expect(FilePathSchema.safeParse('./relative/path.js').success).toBe(true);
      expect(FilePathSchema.safeParse('file.txt').success).toBe(true);
    });

    it('should reject invalid file paths', () => {
      expect(FilePathSchema.safeParse('').success).toBe(false);
      expect(FilePathSchema.safeParse('path\0with\0nulls').success).toBe(false);
      expect(FilePathSchema.safeParse('a'.repeat(2000)).success).toBe(false);
    });
  });

  describe('UrlSchema', () => {
    it('should accept valid URLs', () => {
      expect(UrlSchema.safeParse('https://example.com').success).toBe(true);
      expect(UrlSchema.safeParse('http://localhost:3000').success).toBe(true);
      expect(UrlSchema.safeParse('https://docs.example.com/path?query=1').success).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(UrlSchema.safeParse('not-a-url').success).toBe(false);
      expect(UrlSchema.safeParse('').success).toBe(false);
      // ftp is actually a valid URL format for z.string().url()
    });
  });

  describe('SafeStringSchema', () => {
    it('should accept and trim strings', () => {
      const result = SafeStringSchema.parse('  hello world  ');
      expect(result).toBe('hello world');
    });

    it('should reject strings that are too long', () => {
      const longString = 'a'.repeat(2000);
      expect(SafeStringSchema.safeParse(longString).success).toBe(false);
    });
  });

  describe('IdentifierSchema', () => {
    it('should accept valid identifiers', () => {
      expect(IdentifierSchema.safeParse('myComponent').success).toBe(true);
      expect(IdentifierSchema.safeParse('my-component').success).toBe(true);
      expect(IdentifierSchema.safeParse('my_component').success).toBe(true);
      expect(IdentifierSchema.safeParse('Component123').success).toBe(true);
    });

    it('should reject invalid identifiers', () => {
      expect(IdentifierSchema.safeParse('123-start').success).toBe(false);
      expect(IdentifierSchema.safeParse('-start').success).toBe(false);
      expect(IdentifierSchema.safeParse('with spaces').success).toBe(false);
      expect(IdentifierSchema.safeParse('').success).toBe(false);
      expect(IdentifierSchema.safeParse('special!chars').success).toBe(false);
    });
  });

  describe('SetupInputSchema', () => {
    it('should accept valid setup input', () => {
      expect(SetupInputSchema.safeParse({ projectType: 'react-typescript' }).success).toBe(true);
      expect(SetupInputSchema.safeParse({ projectType: 'nextjs', path: '/project' }).success).toBe(true);
      // path and type are also valid fields
      expect(SetupInputSchema.safeParse({ path: '/project' }).success).toBe(true);
      expect(SetupInputSchema.safeParse({ type: 'react-typescript' }).success).toBe(true);
    });

    it('should accept empty input for auto-detect', () => {
      // Setup now supports empty input for auto-detection
      expect(SetupInputSchema.safeParse({}).success).toBe(true);
    });

    it('should allow passthrough of extra fields', () => {
      // With .passthrough(), extra fields are allowed
      expect(SetupInputSchema.safeParse({ projectType: 'nextjs', extra: 'field' }).success).toBe(true);
    });
  });

  describe('RulesInputSchema', () => {
    it('should accept valid rules input', () => {
      expect(RulesInputSchema.safeParse({}).success).toBe(true);
      expect(RulesInputSchema.safeParse({ action: 'list' }).success).toBe(true);
      expect(RulesInputSchema.safeParse({ action: 'search', query: 'security' }).success).toBe(true);
      expect(RulesInputSchema.safeParse({ action: 'get', query: 'rule-id' }).success).toBe(true);
      expect(RulesInputSchema.safeParse({ action: 'select', ids: ['id1', 'id2'] }).success).toBe(true);
    });

    it('should accept passthrough fields', () => {
      // With .passthrough(), extra fields are allowed
      expect(RulesInputSchema.safeParse({ extra: 'field' }).success).toBe(true);
    });
  });

  describe('ReviewInputSchema', () => {
    it('should accept valid review input', () => {
      expect(ReviewInputSchema.safeParse({}).success).toBe(true);
      expect(ReviewInputSchema.safeParse({ file: '/src/index.ts' }).success).toBe(true);
      expect(ReviewInputSchema.safeParse({ project: true }).success).toBe(true);
      expect(ReviewInputSchema.safeParse({ focus: 'security' }).success).toBe(true);
    });

    it('should accept passthrough fields', () => {
      expect(ReviewInputSchema.safeParse({ custom: 'field' }).success).toBe(true);
    });
  });

  describe('ConfigInputSchema', () => {
    it('should accept valid config actions', () => {
      expect(ConfigInputSchema.safeParse({ action: 'save', name: 'my-config' }).success).toBe(true);
      expect(ConfigInputSchema.safeParse({ action: 'load', id: 'config-id' }).success).toBe(true);
      expect(ConfigInputSchema.safeParse({ action: 'list' }).success).toBe(true);
      expect(ConfigInputSchema.safeParse({ action: 'delete', id: 'config-id' }).success).toBe(true);
      expect(ConfigInputSchema.safeParse({ action: 'export' }).success).toBe(true);
      expect(ConfigInputSchema.safeParse({ action: 'import', json: '{}' }).success).toBe(true);
    });

    it('should accept empty input with default action', () => {
      // Default action is 'list'
      expect(ConfigInputSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('GenerateInputSchema', () => {
    it('should accept valid generate input', () => {
      expect(GenerateInputSchema.safeParse({ type: 'component', name: 'Button' }).success).toBe(true);
      expect(GenerateInputSchema.safeParse({ 
        type: 'service', 
        name: 'UserService',
        options: { typescript: true, tests: true }
      }).success).toBe(true);
    });

    it('should reject invalid generate input', () => {
      expect(GenerateInputSchema.safeParse({ type: 'invalid', name: 'Test' }).success).toBe(false);
      expect(GenerateInputSchema.safeParse({ type: 'component' }).success).toBe(false);
      // Note: name is validated as a string, not as an identifier
      expect(GenerateInputSchema.safeParse({ type: 'component', name: '' }).success).toBe(false);
    });
  });
});

describe('Validation Utilities', () => {
  describe('validate', () => {
    it('should return success for valid input', () => {
      const result = validate(ProjectTypeSchema, 'react-typescript');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('react-typescript');
      }
    });

    it('should return error for invalid input', () => {
      const result = validate(ProjectTypeSchema, 'invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.details).toBeDefined();
      }
    });
  });

  describe('validateOrThrow', () => {
    it('should return validated data for valid input', () => {
      const result = validateOrThrow(ProjectTypeSchema, 'react-typescript');
      expect(result).toBe('react-typescript');
    });

    it('should throw for invalid input', () => {
      expect(() => validateOrThrow(ProjectTypeSchema, 'invalid')).toThrow();
    });

    it('should include context in error message', () => {
      expect(() => validateOrThrow(ProjectTypeSchema, 'invalid', 'Setup')).toThrow(/Setup/);
    });
  });

  describe('withValidation', () => {
    it('should validate before calling handler', async () => {
      const handler = withValidation(SetupInputSchema, async (input) => {
        return { projectType: input.projectType };
      });

      const result = await handler({ projectType: 'react-typescript' });
      expect(result.projectType).toBe('react-typescript');
    });

    it('should accept empty input when schema allows', async () => {
      const handler = withValidation(SetupInputSchema, async (input) => {
        return { projectType: input.projectType };
      });

      // SetupInputSchema now allows empty input for auto-detection
      const result = await handler({});
      expect(result.projectType).toBeUndefined();
    });
  });

  describe('validateHandlerInput', () => {
    it('should validate known handlers', () => {
      const result = validateHandlerInput('setup', { projectType: 'react-typescript' });
      expect(result.success).toBe(true);
    });

    it('should pass through unknown handlers', () => {
      const result = validateHandlerInput('unknown', { anything: 'goes' });
      expect(result.success).toBe(true);
    });

    it('should accept valid input to known handlers', () => {
      // Setup now allows empty input for auto-detection
      const result = validateHandlerInput('setup', {});
      expect(result.success).toBe(true);
    });
  });
});

describe('Sanitization Utilities', () => {
  describe('sanitizeForDisplay', () => {
    it('should remove control characters', () => {
      expect(sanitizeForDisplay('hello\x00world')).toBe('helloworld');
      expect(sanitizeForDisplay('test\x1F\x7F')).toBe('test');
    });

    it('should trim and limit length', () => {
      expect(sanitizeForDisplay('  hello  ')).toBe('hello');
      expect(sanitizeForDisplay('a'.repeat(2000), 100).length).toBe(100);
    });
  });

  describe('sanitizePath', () => {
    it('should remove directory traversal', () => {
      expect(sanitizePath('../../../etc/passwd')).toBe('/etc/passwd');
      // Note: simple string replacement leaves double slashes
      expect(sanitizePath('path/../file')).toBe('path//file');
    });

    it('should normalize slashes', () => {
      expect(sanitizePath('path\\to\\file')).toBe('path/to/file');
      expect(sanitizePath('///multiple')).toBe('/multiple');
    });
  });

  describe('sanitizeIdentifier', () => {
    it('should replace invalid characters', () => {
      // After replacing and trimming, trailing dashes are removed
      expect(sanitizeIdentifier('my component!')).toBe('my-component');
      expect(sanitizeIdentifier('test@#$%')).toBe('test');
    });

    it('should remove leading/trailing dashes', () => {
      expect(sanitizeIdentifier('---test---')).toBe('test');
    });

    it('should limit length', () => {
      expect(sanitizeIdentifier('a'.repeat(200)).length).toBe(100);
    });
  });
});

describe('Schema Registry', () => {
  it('should have schemas for all main handlers', () => {
    const expectedHandlers = [
      'setup', 'rules', 'knowledge', 'review', 'context',
      'docs', 'cursor', 'config', 'custom-rule', 'generate', 'health'
    ];

    for (const handler of expectedHandlers) {
      expect(HANDLER_SCHEMAS[handler]).toBeDefined();
    }
  });
});
