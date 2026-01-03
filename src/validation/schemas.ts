/**
 * Zod Validation Schemas
 * Centralized input validation for all MCP handlers
 * @version 3.6.0
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/** Project type enum */
export const ProjectTypeSchema = z.enum([
  'react-typescript',
  'react-node',
  'vue-node',
  'nextjs',
  'nestjs',
  'express',
  'rails',
  'laravel',
  'golang',
  'rust',
  'python-fastapi',
  'python-django',
  'python-flask',
  'custom'
]);

export type ProjectType = z.infer<typeof ProjectTypeSchema>;

/** Severity level enum */
export const SeveritySchema = z.enum(['error', 'warning', 'info', 'suggestion']);

export type Severity = z.infer<typeof SeveritySchema>;

/** File path validation */
export const FilePathSchema = z.string()
  .min(1, 'File path cannot be empty')
  .max(1024, 'File path too long')
  .refine(
    (path) => !path.includes('\0'),
    'File path contains invalid characters'
  );

/** URL validation */
export const UrlSchema = z.string()
  .url('Invalid URL format')
  .max(2048, 'URL too long');

/** Safe string (no special chars that could cause issues) */
export const SafeStringSchema = z.string()
  .max(1000, 'String too long')
  .transform(s => s.trim());

/** Identifier (alphanumeric + dash/underscore) */
export const IdentifierSchema = z.string()
  .min(1, 'Identifier cannot be empty')
  .max(100, 'Identifier too long')
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Invalid identifier format');

// ============================================================================
// Handler Input Schemas
// ============================================================================

/** setup handler input */
export const SetupInputSchema = z.object({
  projectType: ProjectTypeSchema,
  path: FilePathSchema.optional()
}).strict();

export type SetupInput = z.infer<typeof SetupInputSchema>;

/** rules handler input */
export const RulesInputSchema = z.object({
  projectType: ProjectTypeSchema.optional(),
  category: z.enum(['security', 'performance', 'best-practices', 'maintainability', 'architecture']).optional(),
  severity: SeveritySchema.optional()
}).strict();

export type RulesInput = z.infer<typeof RulesInputSchema>;

/** knowledge handler input */
export const KnowledgeInputSchema = z.object({
  projectType: ProjectTypeSchema.optional(),
  topic: SafeStringSchema.optional()
}).strict();

export type KnowledgeInput = z.infer<typeof KnowledgeInputSchema>;

/** review handler input */
export const ReviewInputSchema = z.object({
  path: FilePathSchema.optional(),
  fix: z.boolean().optional().default(false),
  severity: SeveritySchema.optional()
}).strict();

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

/** context handler input */
export const ContextInputSchema = z.object({
  path: FilePathSchema.optional(),
  depth: z.number().int().min(1).max(10).optional().default(3)
}).strict();

export type ContextInput = z.infer<typeof ContextInputSchema>;

/** docs handler input */
export const DocsInputSchema = z.object({
  url: UrlSchema.optional(),
  query: SafeStringSchema.optional(),
  framework: z.string().max(100).optional()
}).strict();

export type DocsInput = z.infer<typeof DocsInputSchema>;

/** cursor handler input */
export const CursorInputSchema = z.object({
  action: z.enum(['list', 'import', 'search']),
  slug: SafeStringSchema.optional(),
  query: SafeStringSchema.optional()
}).strict();

export type CursorInput = z.infer<typeof CursorInputSchema>;

/** config handler input */
export const ConfigInputSchema = z.object({
  action: z.enum(['get', 'set', 'reset', 'list']),
  key: IdentifierSchema.optional(),
  value: z.unknown().optional()
}).strict();

export type ConfigInput = z.infer<typeof ConfigInputSchema>;

/** custom-rule handler input */
export const CustomRuleInputSchema = z.object({
  action: z.enum(['add', 'remove', 'list', 'enable', 'disable']),
  rule: z.object({
    id: IdentifierSchema,
    name: SafeStringSchema,
    description: SafeStringSchema,
    pattern: z.string().max(2000).optional(),
    message: SafeStringSchema,
    severity: SeveritySchema,
    category: z.enum(['security', 'performance', 'best-practices', 'maintainability', 'architecture']),
    languages: z.array(z.string().max(50)).max(20).optional(),
    enabled: z.boolean().optional().default(true)
  }).optional(),
  ruleId: IdentifierSchema.optional()
}).strict();

export type CustomRuleInput = z.infer<typeof CustomRuleInputSchema>;

/** generate handler input */
export const GenerateInputSchema = z.object({
  type: z.enum(['component', 'service', 'test', 'hook', 'util', 'model', 'controller']),
  name: IdentifierSchema,
  options: z.object({
    typescript: z.boolean().optional().default(true),
    tests: z.boolean().optional().default(false),
    styled: z.boolean().optional().default(false),
    exports: z.boolean().optional().default(true)
  }).optional()
}).strict();

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

/** health handler input */
export const HealthInputSchema = z.object({
  path: FilePathSchema.optional(),
  detailed: z.boolean().optional().default(false)
}).strict();

export type HealthInput = z.infer<typeof HealthInputSchema>;

// ============================================================================
// Tool Argument Schemas
// ============================================================================

/** analyze_code tool input */
export const AnalyzeCodeInputSchema = z.object({
  code: z.string().min(1, 'Code cannot be empty').max(100000, 'Code too large'),
  language: z.string().max(50).optional(),
  filePath: FilePathSchema.optional(),
  categories: z.array(z.enum(['security', 'performance', 'best-practices', 'maintainability', 'architecture'])).optional()
}).strict();

export type AnalyzeCodeInput = z.infer<typeof AnalyzeCodeInputSchema>;

/** get_rules tool input */
export const GetRulesInputSchema = z.object({
  language: z.string().max(50).optional(),
  category: z.enum(['security', 'performance', 'best-practices', 'maintainability', 'architecture']).optional(),
  enabled: z.boolean().optional()
}).strict();

export type GetRulesInput = z.infer<typeof GetRulesInputSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/** Result type for validation */
export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; details?: z.ZodIssue[] };

/**
 * Validate input against a schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errorMessages = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  
  return {
    success: false,
    error: errorMessages.join('; '),
    details: result.error.issues
  };
}

/**
 * Validate and throw on failure
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context?: string
): T {
  const result = validate(schema, input);
  
  if (!result.success) {
    const prefix = context ? `${context}: ` : '';
    throw new Error(`${prefix}${result.error}`);
  }
  
  return result.data;
}

/**
 * Create a validated handler wrapper
 */
export function withValidation<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: (input: TInput) => Promise<TOutput>
): (input: unknown) => Promise<TOutput> {
  return async (input: unknown) => {
    const validated = validateOrThrow(schema, input);
    return handler(validated);
  };
}

// ============================================================================
// Sanitization Utilities
// ============================================================================

/**
 * Sanitize string for safe display
 */
export function sanitizeForDisplay(input: string, maxLength = 1000): string {
  return input
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Sanitize file path
 */
export function sanitizePath(input: string): string {
  return input
    .replace(/\.\./g, '') // Remove directory traversal
    .replace(/^\/+/, '/') // Normalize leading slashes
    .replace(/\\/g, '/'); // Normalize backslashes
}

/**
 * Sanitize identifier
 */
export function sanitizeIdentifier(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ============================================================================
// Schema Registry (for dynamic validation)
// ============================================================================

export const HANDLER_SCHEMAS: Record<string, z.ZodSchema> = {
  'setup': SetupInputSchema,
  'rules': RulesInputSchema,
  'knowledge': KnowledgeInputSchema,
  'review': ReviewInputSchema,
  'context': ContextInputSchema,
  'docs': DocsInputSchema,
  'cursor': CursorInputSchema,
  'config': ConfigInputSchema,
  'custom-rule': CustomRuleInputSchema,
  'generate': GenerateInputSchema,
  'health': HealthInputSchema
};

/**
 * Validate handler input by handler name
 */
export function validateHandlerInput(
  handlerName: string,
  input: unknown
): ValidationResult<unknown> {
  const schema = HANDLER_SCHEMAS[handlerName];
  
  if (!schema) {
    return { success: true, data: input }; // No schema, pass through
  }
  
  return validate(schema, input);
}
