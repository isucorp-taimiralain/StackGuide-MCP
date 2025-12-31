/**
 * Cursor Directory handler - browse and import community rules
 */

import * as cursorDirectory from '../services/cursorDirectory.js';
import * as ruleManager from '../services/ruleManager.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface CursorArgs {
  action?: 'browse' | 'search' | 'popular' | 'import' | 'categories';
  query?: string;
  slug?: string;
}

export async function handleCursor(
  args: CursorArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { action = 'categories', query, slug } = args;

  logger.debug('Cursor action', { action, query, slug });

  switch (action) {
    case 'categories': {
      const categories = cursorDirectory.getCursorDirectoryCategories();
      return jsonResponse({ categories });
    }

    case 'popular': {
      const popular = await cursorDirectory.getPopularCursorDirectoryRules();
      return jsonResponse({ rules: popular });
    }

    case 'browse': {
      if (!query) {
        return textResponse('Error: query (category) required');
      }
      const browseRules = await cursorDirectory.browseCursorDirectoryCategory(query);
      return jsonResponse({
        category: query,
        rules: browseRules
      });
    }

    case 'search': {
      if (!query) {
        return textResponse('Error: query required');
      }
      const searchResults = await cursorDirectory.searchCursorDirectory(query);
      return jsonResponse({
        query,
        results: searchResults
      });
    }

    case 'import': {
      if (!slug) {
        return textResponse('Error: slug required');
      }
      const pt = state.activeProjectType || 'react-typescript';
      const rule = await cursorDirectory.fetchCursorDirectoryRule(slug, 'best-practices');
      if (!rule) {
        return textResponse(`Rule not found: ${slug}`);
      }
      const formatted = cursorDirectory.formatRuleForImport(rule);
      const userRule = ruleManager.createUserRule(pt, 'best-practices', `cursor-${slug}`, formatted, rule.description);
      
      logger.info('Imported rule from cursor.directory', { slug, ruleId: userRule.id });
      
      return jsonResponse({
        success: true,
        imported: userRule.name,
        id: userRule.id
      });
    }

    default:
      return textResponse('Actions: categories, popular, browse, search, import');
  }
}
