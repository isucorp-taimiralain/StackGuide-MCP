/**
 * Custom Rule handler - create, update, delete custom rules
 */

import { RuleCategory } from '../config/types.js';
import * as ruleManager from '../services/ruleManager.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface CustomRuleArgs {
  action?: 'create' | 'update' | 'delete' | 'list' | 'export' | 'import';
  name?: string;
  content?: string;
  category?: RuleCategory;
  id?: string;
  json?: string;
}

export async function handleCustomRule(
  args: CustomRuleArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { action = 'list', name, content, category, id, json } = args;
  const pt = state.activeProjectType || 'react-typescript';

  logger.debug('Custom rule action', { action, name, id });

  switch (action) {
    case 'create': {
      if (!name || !content || !category) {
        return textResponse('Error: name, content, category required');
      }
      const created = ruleManager.createUserRule(pt, category, name, content);
      logger.info('Custom rule created', { id: created.id, name: created.name });
      return jsonResponse({
        success: true,
        id: created.id,
        name: created.name
      });
    }

    case 'list': {
      const rules = ruleManager.getUserRules(pt);
      return jsonResponse({
        projectType: pt,
        rules: rules.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category
        }))
      });
    }

    case 'update': {
      if (!id) {
        return textResponse('Error: id required');
      }
      const updated = ruleManager.updateUserRule(id, { name, content });
      logger.info('Custom rule updated', { id });
      return jsonResponse({
        success: !!updated,
        rule: updated
      });
    }

    case 'delete': {
      if (!id) {
        return textResponse('Error: id required');
      }
      ruleManager.deleteUserRule(id);
      logger.info('Custom rule deleted', { id });
      return jsonResponse({
        success: true,
        deleted: id
      });
    }

    case 'export': {
      const allRules = ruleManager.exportAllUserRules();
      return textResponse(allRules);
    }

    case 'import': {
      if (!json) {
        return textResponse('Error: json required');
      }
      const importedCount = ruleManager.importUserRules(json);
      logger.info('Custom rules imported', { count: importedCount });
      return jsonResponse({
        success: true,
        imported: importedCount
      });
    }

    default:
      return textResponse('Actions: create, list, update, delete, export, import');
  }
}
