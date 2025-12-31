/**
 * Docs handler - fetch and manage web documentation
 */

import * as webDocs from '../services/webDocumentation.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';

interface DocsArgs {
  action?: 'fetch' | 'search' | 'list' | 'get' | 'remove' | 'suggest';
  url?: string;
  urls?: string[];
  query?: string;
}

export async function handleDocs(
  args: DocsArgs,
  state: ServerState
): Promise<ToolResponse> {
  const { action = 'list', url, urls, query } = args;
  const pt = state.activeProjectType;

  logger.debug('Docs action', { action, url, query });

  switch (action) {
    case 'fetch': {
      if (!url) {
        return textResponse('Error: url required');
      }
      try {
        const doc = await webDocs.fetchWebDocumentation(url, pt ? { projectType: pt } : undefined);
        logger.info('Fetched documentation', { url, docId: doc.id });
        return jsonResponse({
          success: true,
          id: doc.id,
          title: doc.title
        });
      } catch (error) {
        return textResponse(`Error fetching: ${error}`);
      }
    }

    case 'list': {
      const allDocs = webDocs.listCachedDocuments();
      return jsonResponse({
        count: allDocs.length,
        docs: allDocs.map(d => ({
          id: d.id,
          title: d.title,
          url: d.url
        }))
      });
    }

    case 'search': {
      if (!query) {
        return textResponse('Error: query required');
      }
      const matches = webDocs.searchWebDocuments(query);
      return jsonResponse({
        query,
        matches
      });
    }

    case 'get': {
      if (!url) {
        return textResponse('Error: url/id required');
      }
      const fetched = webDocs.getWebDocumentById(url) || webDocs.getWebDocumentByUrl(url);
      if (!fetched) {
        return textResponse('Document not found');
      }
      return textResponse(`# ${fetched.title}\n\n${fetched.content}`);
    }

    case 'remove': {
      if (!url) {
        return textResponse('Error: url/id required');
      }
      webDocs.removeFromCache(url);
      return jsonResponse({
        success: true,
        removed: url
      });
    }

    case 'suggest': {
      const suggestions = webDocs.getSuggestedDocs(pt || 'react-typescript');
      return jsonResponse({ suggestions });
    }

    default:
      return textResponse('Actions: fetch, list, search, get, remove, suggest');
  }
}
