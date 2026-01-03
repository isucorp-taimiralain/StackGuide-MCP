/**
 * Knowledge handler - list, search, and get knowledge items
 */

import { KnowledgeCategory } from '../config/types.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { KnowledgeInputSchema, validate } from '../validation/schemas.js';

export async function handleKnowledge(
  args: unknown,
  state: ServerState
): Promise<ToolResponse> {
  // Validate input
  const validation = validate(KnowledgeInputSchema, args || {});
  if (!validation.success) {
    return textResponse(`Validation error: ${validation.error}`);
  }
  
  const { action = 'list', query, category } = validation.data;
  const pt = state.activeProjectType;

  logger.debug('Knowledge action', { action, query, category });

  switch (action) {
    case 'list': {
      let items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
      if (category) {
        items = items.filter(k => k.category === category);
      }
      return jsonResponse({
        projectType: pt,
        count: items.length,
        knowledge: items.map(k => ({
          id: k.id,
          name: k.name,
          category: k.category
        }))
      });
    }

    case 'search': {
      if (!query) {
        return textResponse('Error: query required');
      }
      const items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
      const term = query.toLowerCase();
      const matches = items.filter(k =>
        k.name.toLowerCase().includes(term) ||
        k.content.toLowerCase().includes(term)
      );
      return jsonResponse({
        query,
        matches: matches.length,
        knowledge: matches.map(k => ({
          id: k.id,
          name: k.name
        }))
      });
    }

    case 'get': {
      if (!query) {
        return textResponse('Error: query (knowledge ID) required');
      }
      const items = pt ? knowledgeProvider.getKnowledgeForProject(pt) : [];
      const item = items.find(k => k.id === query);
      if (!item) {
        return textResponse(`Knowledge not found: ${query}`);
      }
      return textResponse(`# ${item.name}\n\n${item.content}`);
    }

    default:
      return textResponse('Actions: list, search, get');
  }
}
