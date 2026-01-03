/**
 * Validation Module
 * Centralized input validation for MCP handlers
 * @version 3.6.0
 */

export {
  // Common schemas
  ProjectTypeSchema,
  SeveritySchema,
  FilePathSchema,
  UrlSchema,
  SafeStringSchema,
  IdentifierSchema,
  
  // Handler input schemas
  SetupInputSchema,
  RulesInputSchema,
  KnowledgeInputSchema,
  ReviewInputSchema,
  ContextInputSchema,
  DocsInputSchema,
  CursorInputSchema,
  ConfigInputSchema,
  CustomRuleInputSchema,
  GenerateInputSchema,
  HealthInputSchema,
  
  // Tool input schemas
  AnalyzeCodeInputSchema,
  GetRulesInputSchema,
  
  // Validation utilities
  validate,
  validateOrThrow,
  withValidation,
  validateHandlerInput,
  
  // Sanitization utilities
  sanitizeForDisplay,
  sanitizePath,
  sanitizeIdentifier,
  
  // Schema registry
  HANDLER_SCHEMAS
} from './schemas.js';

export type {
  // Types
  ProjectType,
  Severity,
  SetupInput,
  RulesInput,
  KnowledgeInput,
  ReviewInput,
  ContextInput,
  DocsInput,
  CursorInput,
  ConfigInput,
  CustomRuleInput,
  GenerateInput,
  HealthInput,
  AnalyzeCodeInput,
  GetRulesInput,
  ValidationResult
} from './schemas.js';
