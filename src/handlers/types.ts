/**
 * Shared types for handlers
 */

import { ProjectType, UserConfiguration, Rule, KnowledgeFile } from '../config/types.js';

export interface ServerState {
  activeProjectType: ProjectType | null;
  activeConfiguration: UserConfiguration | null;
  loadedRules: Rule[];
  loadedKnowledge: KnowledgeFile[];
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export function jsonResponse(data: unknown): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2)
    }]
  };
}

export function textResponse(text: string): ToolResponse {
  return {
    content: [{
      type: 'text',
      text
    }]
  };
}

export function errorResponse(message: string, hint?: string): ToolResponse {
  return jsonResponse({
    error: message,
    ...(hint && { hint })
  });
}
