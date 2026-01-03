/**
 * Context handler - shows current configuration and loaded rules/knowledge
 */

import { SUPPORTED_PROJECTS } from '../config/types.js';
import { ServerState, ToolResponse, jsonResponse, textResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { ContextInputSchema, validate } from '../validation/schemas.js';

export async function handleContext(
  args: unknown,
  state: ServerState
): Promise<ToolResponse> {
  // Validate input
  const validation = validate(ContextInputSchema, args || {});
  if (!validation.success) {
    return textResponse(`Validation error: ${validation.error}`);
  }
  
  const { full = false } = validation.data;

  logger.debug('Context requested', { full });

  if (!state.activeProjectType) {
    return jsonResponse({
      configured: false,
      hint: 'Use "setup" to configure your project first'
    });
  }

  const project = SUPPORTED_PROJECTS[state.activeProjectType];

  if (full) {
    // Return full content
    const rulesContent = state.loadedRules
      .map(r => `## ${r.name}\n${r.content}`)
      .join('\n\n---\n\n');

    const knowledgeContent = state.loadedKnowledge
      .map(k => `## ${k.name}\n${k.content}`)
      .join('\n\n---\n\n');

    return textResponse(
      `# ${project.name} Context\n\n## Rules\n${rulesContent}\n\n## Knowledge\n${knowledgeContent}`
    );
  }

  return jsonResponse({
    projectType: state.activeProjectType,
    projectName: project.name,
    languages: project.languages,
    frameworks: project.frameworks,
    rules: state.loadedRules.map(r => ({ id: r.id, name: r.name, category: r.category })),
    knowledge: state.loadedKnowledge.map(k => ({ id: k.id, name: k.name, category: k.category })),
    totalRules: state.loadedRules.length,
    totalKnowledge: state.loadedKnowledge.length
  });
}
