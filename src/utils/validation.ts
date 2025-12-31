/**
 * Input validation utilities using Zod
 */

import { z } from 'zod';

// ==================== COMMON SCHEMAS ====================

export const ProjectTypeSchema = z.enum([
  'python-django',
  'python-fastapi',
  'python-flask',
  'react-node',
  'react-typescript',
  'vue-node',
  'nextjs',
  'express',
  'nestjs',
  'laravel',
  'rails',
  'golang',
  'rust',
  'custom'
]);

export const RuleCategorySchema = z.enum([
  'coding-standards',
  'best-practices',
  'security',
  'performance',
  'architecture',
  'testing'
]);

export const KnowledgeCategorySchema = z.enum([
  'patterns',
  'common-issues',
  'architecture',
  'workflows'
]);

// ==================== TOOL INPUT SCHEMAS ====================

export const SetupInputSchema = z.object({
  path: z.string().optional().default('.'),
  type: ProjectTypeSchema.optional()
});

export const ContextInputSchema = z.object({
  full: z.boolean().optional().default(false)
});

export const RulesInputSchema = z.object({
  action: z.enum(['list', 'search', 'get', 'select']).optional().default('list'),
  query: z.string().optional(),
  ids: z.array(z.string()).optional(),
  category: RuleCategorySchema.optional()
});

export const KnowledgeInputSchema = z.object({
  action: z.enum(['list', 'search', 'get']).optional().default('list'),
  query: z.string().optional(),
  category: KnowledgeCategorySchema.optional()
});

export const ReviewInputSchema = z.object({
  file: z.string().optional(),
  url: z.string().url().optional(),
  project: z.boolean().optional(),
  focus: z.enum(['all', 'security', 'performance', 'architecture', 'coding-standards']).optional().default('all')
});

export const CursorInputSchema = z.object({
  action: z.enum(['browse', 'search', 'popular', 'import', 'categories']).optional().default('categories'),
  query: z.string().optional(),
  slug: z.string().optional()
});

export const DocsInputSchema = z.object({
  action: z.enum(['fetch', 'search', 'list', 'get', 'remove', 'suggest']).optional().default('list'),
  url: z.string().optional(),
  urls: z.array(z.string()).optional(),
  query: z.string().optional()
});

export const ConfigInputSchema = z.object({
  action: z.enum(['save', 'load', 'list', 'delete', 'export', 'import']).optional().default('list'),
  name: z.string().optional(),
  id: z.string().optional(),
  json: z.string().optional()
});

export const CustomRuleInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'list', 'export', 'import']).optional().default('list'),
  name: z.string().optional(),
  content: z.string().optional(),
  category: RuleCategorySchema.optional(),
  id: z.string().optional(),
  json: z.string().optional()
});

export const HelpInputSchema = z.object({
  topic: z.enum(['setup', 'rules', 'review', 'cursor', 'docs', 'config', 'all']).optional().default('all')
});

// ==================== VALIDATION HELPER ====================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function validate<T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T> {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, error: messages.join(', ') };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}

// ==================== TYPE EXPORTS ====================

export type ProjectType = z.infer<typeof ProjectTypeSchema>;
export type RuleCategory = z.infer<typeof RuleCategorySchema>;
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;
export type SetupInput = z.infer<typeof SetupInputSchema>;
export type ContextInput = z.infer<typeof ContextInputSchema>;
export type RulesInput = z.infer<typeof RulesInputSchema>;
export type KnowledgeInput = z.infer<typeof KnowledgeInputSchema>;
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
export type CursorInput = z.infer<typeof CursorInputSchema>;
export type DocsInput = z.infer<typeof DocsInputSchema>;
export type ConfigInput = z.infer<typeof ConfigInputSchema>;
export type CustomRuleInput = z.infer<typeof CustomRuleInputSchema>;
export type HelpInput = z.infer<typeof HelpInputSchema>;
