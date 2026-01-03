/**
 * Configurable Rules Engine
 * Dynamic rule loading, validation, and configuration
 * @version 3.7.0
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { getStorageValue, setStorageValue } from '../config/persistence.js';

// ============================================================================
// Rule Schema
// ============================================================================

/** Rule severity levels */
export const RuleSeveritySchema = z.enum(['error', 'warning', 'info', 'suggestion']);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

/** Rule categories */
export const RuleCategorySchema = z.enum([
  'security',
  'performance',
  'best-practices',
  'maintainability',
  'architecture',
  'accessibility',
  'code-style'
]);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;

/** Full rule definition schema */
export const RuleDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  category: RuleCategorySchema,
  severity: RuleSeveritySchema,
  enabled: z.boolean().default(true),
  
  // Matching criteria
  languages: z.array(z.string().max(50)).optional(),
  filePatterns: z.array(z.string().max(200)).optional(),
  
  // Detection
  pattern: z.string().max(5000).optional(), // Regex pattern
  astQuery: z.string().max(5000).optional(), // Tree-sitter query
  
  // Messages
  message: z.string().max(500),
  suggestion: z.string().max(1000).optional(),
  
  // Metadata
  tags: z.array(z.string().max(50)).optional(),
  source: z.enum(['builtin', 'custom', 'plugin']).default('custom'),
  version: z.string().max(20).optional(),
  
  // Fix
  autoFix: z.object({
    replacement: z.string().max(5000),
    description: z.string().max(500)
  }).optional()
});

export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;

/** Rule override (partial update) */
export const RuleOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  severity: RuleSeveritySchema.optional(),
  message: z.string().max(500).optional()
}).strict();

export type RuleOverride = z.infer<typeof RuleOverrideSchema>;

// ============================================================================
// Rule Configuration
// ============================================================================

export interface RuleConfig {
  version: string;
  rules: RuleDefinition[];
  overrides: Record<string, RuleOverride>;
  disabledCategories: RuleCategory[];
  disabledRules: string[];
  settings: RuleEngineSettings;
}

export interface RuleEngineSettings {
  maxIssuesPerFile: number;
  maxIssuesTotal: number;
  failOnError: boolean;
  failOnWarning: boolean;
  autoFix: boolean;
  verboseOutput: boolean;
}

const DEFAULT_SETTINGS: RuleEngineSettings = {
  maxIssuesPerFile: 50,
  maxIssuesTotal: 500,
  failOnError: true,
  failOnWarning: false,
  autoFix: false,
  verboseOutput: false
};

// ============================================================================
// Rules Registry
// ============================================================================

class RulesRegistry {
  private builtinRules: Map<string, RuleDefinition> = new Map();
  private customRules: Map<string, RuleDefinition> = new Map();
  private overrides: Map<string, RuleOverride> = new Map();
  private disabledCategories: Set<RuleCategory> = new Set();
  private disabledRules: Set<string> = new Set();
  private settings: RuleEngineSettings = { ...DEFAULT_SETTINGS };
  
  constructor() {
    this.loadFromStorage();
  }
  
  // ==================== Registration ====================
  
  /**
   * Register a builtin rule
   */
  registerBuiltin(rule: RuleDefinition): this {
    const validated = RuleDefinitionSchema.parse({ ...rule, source: 'builtin' });
    this.builtinRules.set(validated.id, validated);
    return this;
  }
  
  /**
   * Register multiple builtin rules
   */
  registerBuiltinRules(rules: RuleDefinition[]): this {
    for (const rule of rules) {
      this.registerBuiltin(rule);
    }
    return this;
  }
  
  /**
   * Add a custom rule
   */
  addCustomRule(rule: RuleDefinition): { success: boolean; error?: string } {
    try {
      const validated = RuleDefinitionSchema.parse({ ...rule, source: 'custom' });
      
      if (this.builtinRules.has(validated.id)) {
        return { success: false, error: `Cannot override builtin rule: ${validated.id}` };
      }
      
      this.customRules.set(validated.id, validated);
      this.saveToStorage();
      
      logger.info('Added custom rule', { id: validated.id, name: validated.name });
      return { success: true };
    } catch (error) {
      const message = error instanceof z.ZodError 
        ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(error);
      return { success: false, error: message };
    }
  }
  
  /**
   * Remove a custom rule
   */
  removeCustomRule(ruleId: string): boolean {
    const deleted = this.customRules.delete(ruleId);
    if (deleted) {
      this.saveToStorage();
      logger.info('Removed custom rule', { id: ruleId });
    }
    return deleted;
  }
  
  // ==================== Configuration ====================
  
  /**
   * Override a rule's properties
   */
  setOverride(ruleId: string, override: RuleOverride): { success: boolean; error?: string } {
    try {
      const validated = RuleOverrideSchema.parse(override);
      
      // Check if rule exists
      if (!this.builtinRules.has(ruleId) && !this.customRules.has(ruleId)) {
        return { success: false, error: `Rule not found: ${ruleId}` };
      }
      
      this.overrides.set(ruleId, validated);
      this.saveToStorage();
      
      logger.info('Set rule override', { id: ruleId, override: validated });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Remove a rule override
   */
  removeOverride(ruleId: string): boolean {
    const deleted = this.overrides.delete(ruleId);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }
  
  /**
   * Enable/disable a specific rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    if (enabled) {
      this.disabledRules.delete(ruleId);
    } else {
      this.disabledRules.add(ruleId);
    }
    this.saveToStorage();
    return true;
  }
  
  /**
   * Enable/disable a category
   */
  setCategoryEnabled(category: RuleCategory, enabled: boolean): boolean {
    if (enabled) {
      this.disabledCategories.delete(category);
    } else {
      this.disabledCategories.add(category);
    }
    this.saveToStorage();
    return true;
  }
  
  /**
   * Update settings
   */
  updateSettings(settings: Partial<RuleEngineSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.saveToStorage();
  }
  
  // ==================== Retrieval ====================
  
  /**
   * Get a rule by ID (with overrides applied)
   */
  getRule(ruleId: string): RuleDefinition | null {
    const rule = this.builtinRules.get(ruleId) || this.customRules.get(ruleId);
    
    if (!rule) {
      return null;
    }
    
    // Apply override if exists
    const override = this.overrides.get(ruleId);
    if (override) {
      return { ...rule, ...override };
    }
    
    return rule;
  }
  
  /**
   * Get all rules (with filters)
   */
  getRules(options: {
    category?: RuleCategory;
    severity?: RuleSeverity;
    language?: string;
    enabledOnly?: boolean;
    source?: 'builtin' | 'custom' | 'all';
  } = {}): RuleDefinition[] {
    const { category, severity, language, enabledOnly = true, source = 'all' } = options;
    
    let rules: RuleDefinition[] = [];
    
    // Collect from sources
    if (source === 'all' || source === 'builtin') {
      rules.push(...Array.from(this.builtinRules.values()));
    }
    if (source === 'all' || source === 'custom') {
      rules.push(...Array.from(this.customRules.values()));
    }
    
    // Apply overrides
    rules = rules.map(rule => {
      const override = this.overrides.get(rule.id);
      return override ? { ...rule, ...override } : rule;
    });
    
    // Filter
    return rules.filter(rule => {
      // Enabled check
      if (enabledOnly) {
        if (!rule.enabled) return false;
        if (this.disabledRules.has(rule.id)) return false;
        if (this.disabledCategories.has(rule.category)) return false;
      }
      
      // Category filter
      if (category && rule.category !== category) return false;
      
      // Severity filter
      if (severity && rule.severity !== severity) return false;
      
      // Language filter
      if (language && rule.languages && !rule.languages.includes(language)) return false;
      
      return true;
    });
  }
  
  /**
   * Get rules for a specific file
   */
  getRulesForFile(filePath: string, language?: string): RuleDefinition[] {
    const rules = this.getRules({ language, enabledOnly: true });
    
    return rules.filter(rule => {
      // Check file patterns if specified
      if (rule.filePatterns && rule.filePatterns.length > 0) {
        const matches = rule.filePatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(filePath);
          } catch {
            return false;
          }
        });
        if (!matches) return false;
      }
      
      return true;
    });
  }
  
  /**
   * Get settings
   */
  getSettings(): RuleEngineSettings {
    return { ...this.settings };
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    totalBuiltin: number;
    totalCustom: number;
    enabled: number;
    disabled: number;
    overridden: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const allRules = this.getRules({ enabledOnly: false });
    const enabledRules = this.getRules({ enabledOnly: true });
    
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    for (const rule of enabledRules) {
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
    }
    
    return {
      totalBuiltin: this.builtinRules.size,
      totalCustom: this.customRules.size,
      enabled: enabledRules.length,
      disabled: allRules.length - enabledRules.length,
      overridden: this.overrides.size,
      byCategory,
      bySeverity
    };
  }
  
  // ==================== Persistence ====================
  
  private saveToStorage(): void {
    try {
      const config: RuleConfig = {
        version: '1.0.0',
        rules: Array.from(this.customRules.values()),
        overrides: Object.fromEntries(this.overrides),
        disabledCategories: Array.from(this.disabledCategories),
        disabledRules: Array.from(this.disabledRules),
        settings: this.settings
      };
      
      setStorageValue('ruleConfig', config);
    } catch (error) {
      logger.warn('Failed to save rule config', { error: String(error) });
    }
  }
  
  private loadFromStorage(): void {
    try {
      const config = getStorageValue<RuleConfig>('ruleConfig');
      
      if (config) {
        // Load custom rules
        for (const rule of config.rules || []) {
          try {
            const validated = RuleDefinitionSchema.parse(rule);
            this.customRules.set(validated.id, validated);
          } catch {
            // Skip invalid rules
          }
        }
        
        // Load overrides
        for (const [id, override] of Object.entries(config.overrides || {})) {
          try {
            const validated = RuleOverrideSchema.parse(override);
            this.overrides.set(id, validated);
          } catch {
            // Skip invalid overrides
          }
        }
        
        // Load disabled items
        this.disabledCategories = new Set(config.disabledCategories || []);
        this.disabledRules = new Set(config.disabledRules || []);
        
        // Load settings
        if (config.settings) {
          this.settings = { ...DEFAULT_SETTINGS, ...config.settings };
        }
        
        logger.debug('Loaded rule config from storage', {
          customRules: this.customRules.size,
          overrides: this.overrides.size
        });
      }
    } catch (error) {
      logger.warn('Failed to load rule config', { error: String(error) });
    }
  }
  
  /**
   * Reset to defaults
   */
  reset(): void {
    this.customRules.clear();
    this.overrides.clear();
    this.disabledCategories.clear();
    this.disabledRules.clear();
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToStorage();
    logger.info('Reset rules engine to defaults');
  }
  
  /**
   * Full reset including builtin rules (for testing)
   */
  resetAll(): void {
    this.builtinRules.clear();
    this.reset();
  }
  
  /**
   * Export configuration
   */
  exportConfig(): RuleConfig {
    return {
      version: '1.0.0',
      rules: Array.from(this.customRules.values()),
      overrides: Object.fromEntries(this.overrides),
      disabledCategories: Array.from(this.disabledCategories),
      disabledRules: Array.from(this.disabledRules),
      settings: this.settings
    };
  }
  
  /**
   * Import configuration
   */
  importConfig(config: RuleConfig): { success: boolean; imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;
    
    // Import custom rules
    for (const rule of config.rules || []) {
      const result = this.addCustomRule(rule);
      if (result.success) {
        imported++;
      } else {
        errors.push(`Rule ${rule.id}: ${result.error}`);
      }
    }
    
    // Import overrides
    for (const [id, override] of Object.entries(config.overrides || {})) {
      const result = this.setOverride(id, override);
      if (!result.success) {
        errors.push(`Override ${id}: ${result.error}`);
      }
    }
    
    // Import disabled items
    for (const category of config.disabledCategories || []) {
      this.disabledCategories.add(category);
    }
    for (const ruleId of config.disabledRules || []) {
      this.disabledRules.add(ruleId);
    }
    
    // Import settings
    if (config.settings) {
      this.settings = { ...this.settings, ...config.settings };
    }
    
    this.saveToStorage();
    
    return {
      success: errors.length === 0,
      imported,
      errors
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const rulesRegistry = new RulesRegistry();

// ============================================================================
// Convenience Functions
// ============================================================================

export function registerBuiltinRule(rule: RuleDefinition): void {
  rulesRegistry.registerBuiltin(rule);
}

export function registerBuiltinRules(rules: RuleDefinition[]): void {
  rulesRegistry.registerBuiltinRules(rules);
}

export function addCustomRule(rule: RuleDefinition): { success: boolean; error?: string } {
  return rulesRegistry.addCustomRule(rule);
}

export function removeCustomRule(ruleId: string): boolean {
  return rulesRegistry.removeCustomRule(ruleId);
}

export function getRule(ruleId: string): RuleDefinition | null {
  return rulesRegistry.getRule(ruleId);
}

export function getRules(options?: Parameters<RulesRegistry['getRules']>[0]): RuleDefinition[] {
  return rulesRegistry.getRules(options);
}

export function getRulesForFile(filePath: string, language?: string): RuleDefinition[] {
  return rulesRegistry.getRulesForFile(filePath, language);
}

export function setRuleEnabled(ruleId: string, enabled: boolean): boolean {
  return rulesRegistry.setRuleEnabled(ruleId, enabled);
}

export function setRuleOverride(ruleId: string, override: RuleOverride): { success: boolean; error?: string } {
  return rulesRegistry.setOverride(ruleId, override);
}

export function getRuleSettings(): RuleEngineSettings {
  return rulesRegistry.getSettings();
}

export function updateRuleSettings(settings: Partial<RuleEngineSettings>): void {
  rulesRegistry.updateSettings(settings);
}

export function getRuleStats() {
  return rulesRegistry.getStats();
}

export function resetRulesEngine(): void {
  rulesRegistry.resetAll();
}

export function exportRulesConfig(): RuleConfig {
  return rulesRegistry.exportConfig();
}

export function importRulesConfig(config: RuleConfig) {
  return rulesRegistry.importConfig(config);
}
