/**
 * Project Intelligence Module - Phase 4
 * Auto-Configuration Intelligence
 * @version 3.3.0
 */

// Types
export type {
  StructureAnalysis,
  DirectorySuggestion,
  FileSuggestion,
  StructureImprovement,
  ConfigAnalysis,
  ConfigFile,
  ConfigType,
  ConfigRecommendation,
  ConfigIssue,
  ConfigFix,
  DependencyAnalysis,
  DependencyInfo,
  OutdatedPackage,
  VulnerabilityInfo,
  DependencyRecommendation,
  IntelligenceReport,
  PriorityAction,
  WorkflowStep,
  SmartConfig,
  ConfigCustomization,
  ConfigOption,
  FrameworkTemplate
} from './types.js';

// Main service
export {
  generateIntelligenceReport,
  applyAutoFixes,
  formatIntelligenceReport,
  analyzeStructure,
  analyzeConfigurations,
  analyzeDependencies,
  generateSmartConfig,
  applyConfigFix,
  generateInstallCommand
} from './projectIntelligence.js';

// Templates
export {
  getFrameworkTemplate,
  getAllTemplates,
  getConfigTemplate,
  FRAMEWORK_TEMPLATES
} from './templates.js';

// Structure analyzer
export {
  scanDirectory,
  getDirPurpose,
  getFilePurpose
} from './structureAnalyzer.js';

// Config generator
export {
  parseConfigFile,
  analyzeConfigFile
} from './configGenerator.js';

// Dependency advisor
export {
  detectPackageManager,
  extractDependencies
} from './dependencyAdvisor.js';
