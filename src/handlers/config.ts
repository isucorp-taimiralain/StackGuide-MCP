/**
 * Config handler - save, load, and manage configurations
 */

import * as persistence from '../config/persistence.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface ConfigArgs {
  action?: 'save' | 'load' | 'list' | 'delete' | 'export' | 'import';
  name?: string;
  id?: string;
  json?: string;
}

export async function handleConfig(
  args: ConfigArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { action = 'list', name, id, json } = args;

  logger.debug('Config action', { action, name, id });

  switch (action) {
    case 'save': {
      if (!name) {
        return textResponse('Error: name required');
      }
      if (!state.activeConfiguration || !state.activeProjectType) {
        return textResponse('No active configuration to save');
      }
      const saved = persistence.createConfiguration(
        name,
        state.activeProjectType,
        state.activeConfiguration.selectedRules,
        state.activeConfiguration.selectedKnowledge
      );
      logger.info('Configuration saved', { id: saved.id, name: saved.name });
      return jsonResponse({
        success: true,
        id: saved.id,
        name: saved.name
      });
    }

    case 'load': {
      if (!id) {
        return textResponse('Error: id required');
      }
      const loaded = persistence.getConfigurationById(id);
      if (!loaded) {
        return textResponse('Configuration not found');
      }
      state.activeConfiguration = loaded;
      state.activeProjectType = loaded.projectType;
      state.loadedRules = rulesProvider.getRulesForProject(loaded.projectType);
      state.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(loaded.projectType);
      
      logger.info('Configuration loaded', { id: loaded.id, name: loaded.name });
      return jsonResponse({
        success: true,
        loaded: loaded.name
      });
    }

    case 'list': {
      const configs = persistence.getAllConfigurations();
      return jsonResponse({ configurations: configs });
    }

    case 'delete': {
      if (!id) {
        return textResponse('Error: id required');
      }
      persistence.deleteConfiguration(id);
      logger.info('Configuration deleted', { id });
      return jsonResponse({
        success: true,
        deleted: id
      });
    }

    case 'export': {
      if (!id) {
        return textResponse('Error: id required');
      }
      const toExport = persistence.exportConfiguration(id);
      return textResponse(toExport || 'Configuration not found');
    }

    case 'import': {
      if (!json) {
        return textResponse('Error: json required');
      }
      const imported = persistence.importConfiguration(json);
      if (!imported) {
        return textResponse('Error: Invalid configuration JSON');
      }
      logger.info('Configuration imported', { id: imported.id });
      return jsonResponse({
        success: true,
        imported: imported.id
      });
    }

    default:
      return textResponse('Actions: save, load, list, delete, export, import');
  }
}
