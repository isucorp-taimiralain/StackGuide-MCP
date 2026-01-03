import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { UserConfiguration, ProjectType, Rule } from './types.js';

// Configuration directory
const CONFIG_DIR = join(homedir(), '.stackguide');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CONFIGURATIONS_FILE = join(CONFIG_DIR, 'configurations.json');

// Storage interface
interface ConfigurationStorage {
  activeConfigurationId: string | null;
  configurations: UserConfiguration[];
}

// Ensure configuration directory exists
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Get storage
function getStorage(): ConfigurationStorage {
  ensureConfigDir();
  
  if (!existsSync(CONFIGURATIONS_FILE)) {
    const defaultStorage: ConfigurationStorage = {
      activeConfigurationId: null,
      configurations: []
    };
    writeFileSync(CONFIGURATIONS_FILE, JSON.stringify(defaultStorage, null, 2));
    return defaultStorage;
  }
  
  try {
    const data = readFileSync(CONFIGURATIONS_FILE, 'utf-8');
    return JSON.parse(data) as ConfigurationStorage;
  } catch {
    return { activeConfigurationId: null, configurations: [] };
  }
}

// Save storage
function saveStorage(storage: ConfigurationStorage): void {
  ensureConfigDir();
  writeFileSync(CONFIGURATIONS_FILE, JSON.stringify(storage, null, 2));
}

// Create new configuration
export function createConfiguration(
  name: string,
  projectType: ProjectType,
  selectedRules: string[] = [],
  selectedKnowledge: string[] = []
): UserConfiguration {
  const storage = getStorage();
  
  const newConfig: UserConfiguration = {
    id: generateId(),
    name,
    projectType,
    selectedRules,
    selectedKnowledge,
    customRules: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  storage.configurations.push(newConfig);
  storage.activeConfigurationId = newConfig.id;
  saveStorage(storage);
  
  return newConfig;
}

// Get all configurations
export function getAllConfigurations(): UserConfiguration[] {
  const storage = getStorage();
  return storage.configurations;
}

// Get configuration by ID
export function getConfigurationById(id: string): UserConfiguration | null {
  const storage = getStorage();
  return storage.configurations.find(c => c.id === id) || null;
}

// Get active configuration
export function getActiveConfiguration(): UserConfiguration | null {
  const storage = getStorage();
  if (!storage.activeConfigurationId) return null;
  return storage.configurations.find(c => c.id === storage.activeConfigurationId) || null;
}

// Set active configuration
export function setActiveConfiguration(id: string): UserConfiguration | null {
  const storage = getStorage();
  const config = storage.configurations.find(c => c.id === id);
  
  if (config) {
    storage.activeConfigurationId = id;
    saveStorage(storage);
    return config;
  }
  
  return null;
}

// Update configuration
export function updateConfiguration(
  id: string,
  updates: Partial<Omit<UserConfiguration, 'id' | 'createdAt'>>
): UserConfiguration | null {
  const storage = getStorage();
  const index = storage.configurations.findIndex(c => c.id === id);
  
  if (index === -1) return null;
  
  storage.configurations[index] = {
    ...storage.configurations[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  saveStorage(storage);
  return storage.configurations[index];
}

// Delete configuration
export function deleteConfiguration(id: string): boolean {
  const storage = getStorage();
  const index = storage.configurations.findIndex(c => c.id === id);
  
  if (index === -1) return false;
  
  storage.configurations.splice(index, 1);
  
  if (storage.activeConfigurationId === id) {
    storage.activeConfigurationId = storage.configurations[0]?.id || null;
  }
  
  saveStorage(storage);
  return true;
}

// Add custom rule
export function addCustomRule(configId: string, rule: Omit<Rule, 'id'>): Rule | null {
  const storage = getStorage();
  const config = storage.configurations.find(c => c.id === configId);
  
  if (!config) return null;
  
  const newRule: Rule = {
    ...rule,
    id: generateId()
  };
  
  config.customRules.push(newRule);
  config.updatedAt = new Date().toISOString();
  saveStorage(storage);
  
  return newRule;
}

// Update selected rules
export function updateSelectedRules(configId: string, ruleIds: string[]): boolean {
  const config = updateConfiguration(configId, { selectedRules: ruleIds });
  return config !== null;
}

// Update selected knowledge
export function updateSelectedKnowledge(configId: string, knowledgeIds: string[]): boolean {
  const config = updateConfiguration(configId, { selectedKnowledge: knowledgeIds });
  return config !== null;
}

// Export configuration
export function exportConfiguration(id: string): string | null {
  const config = getConfigurationById(id);
  if (!config) return null;
  return JSON.stringify(config, null, 2);
}

// Import configuration
export function importConfiguration(jsonString: string): UserConfiguration | null {
  try {
    const imported = JSON.parse(jsonString) as UserConfiguration;
    
    const newConfig: UserConfiguration = {
      ...imported,
      id: generateId(),
      name: `${imported.name} (imported)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const storage = getStorage();
    storage.configurations.push(newConfig);
    saveStorage(storage);
    
    return newConfig;
  } catch {
    return null;
  }
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get configuration path
export function getConfigPath(): string {
  return CONFIG_DIR;
}

// ============================================================================
// Generic Storage Functions
// ============================================================================

const GENERIC_STORAGE_FILE = join(CONFIG_DIR, 'storage.json');

interface GenericStorage {
  [key: string]: unknown;
}

function getGenericStorage(): GenericStorage {
  ensureConfigDir();
  
  if (!existsSync(GENERIC_STORAGE_FILE)) {
    return {};
  }
  
  try {
    const data = readFileSync(GENERIC_STORAGE_FILE, 'utf-8');
    return JSON.parse(data) as GenericStorage;
  } catch {
    return {};
  }
}

function saveGenericStorage(storage: GenericStorage): void {
  ensureConfigDir();
  writeFileSync(GENERIC_STORAGE_FILE, JSON.stringify(storage, null, 2));
}

/**
 * Get a value from generic storage
 */
export function getStorageValue<T>(key: string): T | null {
  const storage = getGenericStorage();
  return (storage[key] as T) ?? null;
}

/**
 * Set a value in generic storage
 */
export function setStorageValue<T>(key: string, value: T): void {
  const storage = getGenericStorage();
  storage[key] = value;
  saveGenericStorage(storage);
}

/**
 * Delete a value from generic storage
 */
export function deleteStorageValue(key: string): boolean {
  const storage = getGenericStorage();
  const exists = key in storage;
  delete storage[key];
  saveGenericStorage(storage);
  return exists;
}

/**
 * Check if a key exists in storage
 */
export function hasStorageValue(key: string): boolean {
  const storage = getGenericStorage();
  return key in storage;
}
