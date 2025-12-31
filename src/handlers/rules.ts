/**
 * Rules handler - list, search, get, and select rules
 */

import { RuleCategory } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface RulesArgs {
  action?: 'list' | 'search' | 'get' | 'select';
  query?: string;
  ids?: string[];
  category?: RuleCategory;
}

export async function handleRules(
  args: RulesArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { action = 'list', query, ids, category } = args;
  const pt = state.activeProjectType;

  logger.debug('Rules action', { action, query, category });

  switch (action) {
    case 'list': {
      let rules = pt ? rulesProvider.getRulesForProject(pt) : [];
      if (category) {
        rules = rules.filter(r => r.category === category);
      }
      return jsonResponse({
        projectType: pt,
        count: rules.length,
        rules: rules.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description
        }))
      });
    }

    case 'search': {
      if (!query) {
        return textResponse('Error: query required for search');
      }
      const rules = pt ? rulesProvider.getRulesForProject(pt) : [];
      const term = query.toLowerCase();
      const matches = rules.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.content.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term)
      );
      return jsonResponse({
        query,
        matches: matches.length,
        rules: matches.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category
        }))
      });
    }

    case 'get': {
      if (!query) {
        return textResponse('Error: query (rule ID) required');
      }
      const rules = pt ? rulesProvider.getRulesForProject(pt) : [];
      const rule = rules.find(r => r.id === query);
      if (!rule) {
        return textResponse(`Rule not found: ${query}`);
      }
      return textResponse(`# ${rule.name}\n\n${rule.content}`);
    }

    case 'select': {
      if (!ids || ids.length === 0) {
        return textResponse('Error: ids required for select');
      }
      if (state.activeConfiguration) {
        state.activeConfiguration.selectedRules = ids;
        state.activeConfiguration.updatedAt = new Date().toISOString();
      }
      return jsonResponse({
        success: true,
        selectedRules: ids.length
      });
    }

    default:
      return textResponse('Actions: list, search, get, select');
  }
}
