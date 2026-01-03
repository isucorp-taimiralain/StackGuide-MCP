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
  type: ProjectTypeSchema.optional(),
  path: FilePathSchema.optional()
}).passthrough();

export type SetupInput = z.infer<typeof SetupInputSchema>;

/** rules handler input */
export const RulesInputSchema = z.object({
  action: z.enum(['list', 'search', 'get', 'select']).optional().default('list'),
  query: SafeStringSchema.optional(),
  ids: z.array(z.string().max(200)).optional(),
  category: z.enum(['security', 'performance', 'best-practices', 'coding-standards', 'architecture', 'testing']).optional()
}).passthrough();

export type RulesInput = z.infer<typeof RulesInputSchema>;

/** knowledge handler input */
export const KnowledgeInputSchema = z.object({
  action: z.enum(['list', 'search', 'get']).optional().default('list'),
  query: SafeStringSchema.optional(),
  category: z.enum(['patterns', 'common-issues', 'architecture', 'workflows']).optional()
}).passthrough();

export type KnowledgeInput = z.infer<typeof KnowledgeInputSchema>;

/** review handler input */
export const ReviewInputSchema = z.object({
  file: FilePathSchema.optional(),
  url: UrlSchema.optional(),
  project: z.boolean().optional(),
  focus: z.enum(['all', 'security', 'performance', 'architecture', 'coding-standards']).optional().default('all'),
  incremental: z.boolean().optional(),
  maxDepth: z.number().int().min(1).max(20).optional(),
  maxFiles: z.number().int().min(1).optional(),
  useCache: z.boolean().optional()
}).passthrough();

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

/** context handler input */
export const ContextInputSchema = z.object({
  full: z.boolean().optional()
}).passthrough();

export type ContextInput = z.infer<typeof ContextInputSchema>;

/** docs handler input */
export const DocsInputSchema = z.object({
  action: z.enum(['fetch', 'search', 'list', 'get', 'remove', 'suggest']).optional().default('list'),
  url: z.string().max(2048).optional(), // Can be URL or ID for get/remove
  urls: z.array(UrlSchema).optional(),
  query: SafeStringSchema.optional()
}).passthrough();

export type DocsInput = z.infer<typeof DocsInputSchema>;

/** cursor handler input */
export const CursorInputSchema = z.object({
  action: z.enum(['browse', 'search', 'popular', 'import', 'categories']).optional().default('categories'),
  query: SafeStringSchema.optional(),
  slug: SafeStringSchema.optional()
}).passthrough();

export type CursorInput = z.infer<typeof CursorInputSchema>;

/** config handler input */
export const ConfigInputSchema = z.object({
  action: z.enum(['save', 'load', 'list', 'delete', 'export', 'import']).optional().default('list'),
  name: SafeStringSchema.optional(),
  id: z.string().max(200).optional(),
  json: z.string().max(100000).optional()
}).passthrough();

export type ConfigInput = z.infer<typeof ConfigInputSchema>;

/** custom-rule handler input */
export const CustomRuleInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'list', 'export', 'import']).optional().default('list'),
  name: SafeStringSchema.optional(),
  content: z.string().max(50000).optional(),
  category: z.enum(['security', 'performance', 'best-practices', 'coding-standards', 'architecture']).optional(),
  id: z.string().max(200).optional(),
  json: z.string().max(100000).optional()
}).passthrough();

export type CustomRuleInput = z.infer<typeof CustomRuleInputSchema>;

/** generate handler input */
export const GenerateInputSchema = z.object({
  type: z.enum(['component', 'hook', 'service', 'test', 'api', 'model', 'util']),
  name: z.string().min(1).max(100),
  options: z.object({
    typescript: z.boolean().optional(),
    withTests: z.boolean().optional(),
    withStyles: z.boolean().optional(),
    framework: z.string().max(50).optional(),
    scanProject: z.boolean().optional()
  }).optional()
}).passthrough();

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

/** health handler input */
export const HealthInputSchema = z.object({
  detailed: z.boolean().optional(),
  path: FilePathSchema.optional()
}).passthrough();

export type HealthInput = z.infer<typeof HealthInputSchema>;

/** help handler input */
export const HelpInputSchema = z.object({
  topic: z.enum(['setup', 'rules', 'review', 'cursor', 'docs', 'config', 'generate', 'health', 'all']).optional().default('all')
}).passthrough();

export type HelpInput = z.infer<typeof HelpInputSchema>;

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
  'health': HealthInputSchema,
  'help': HelpInputSchema
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
