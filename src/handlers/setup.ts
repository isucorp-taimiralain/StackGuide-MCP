/**
 * Setup handler - configures StackGuide for a project
 */

import { ProjectType as ConfigProjectType, SUPPORTED_PROJECTS } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import * as autoDetect from '../services/autoDetect.js';
import { ServerState, ToolResponse, jsonResponse, errorResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { SetupInputSchema, validate } from '../utils/validation.js';

export async function handleSetup(
  args: unknown,
  state: ServerState
): Promise<ToolResponse> {
  const startTime = Date.now();
  
  // Validate input
  const validation = validate(SetupInputSchema, args);
  if (!validation.success) {
    return errorResponse('Invalid input', validation.error);
  }
  
  const { path: projectPath = '.', type: projectType } = validation.data!;
  const resolvedPath = projectPath === '.' ? process.cwd() : projectPath;

  logger.debug('Setup started', { projectPath: resolvedPath, projectType });

  // If type is specified, use it directly
  if (projectType && SUPPORTED_PROJECTS[projectType]) {
    const project = SUPPORTED_PROJECTS[projectType];
    state.activeProjectType = projectType;
    state.loadedRules = rulesProvider.getRulesForProject(projectType);
    state.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(projectType);
    state.activeConfiguration = {
      id: `setup-${projectType}-${Date.now()}`,
      name: `${project.name} Configuration`,
      projectType,
      selectedRules: state.loadedRules.map(r => r.id),
      selectedKnowledge: state.loadedKnowledge.map(k => k.id),
      customRules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    logger.tool('setup', args as Record<string, unknown>, startTime);

    return jsonResponse({
      success: true,
      message: `✅ Configured for ${project.name}`,
      projectType,
      rulesLoaded: state.loadedRules.length,
      knowledgeLoaded: state.loadedKnowledge.length,
      nextSteps: ['Use "context" to see loaded rules', 'Use "review" to analyze your code']
    });
  }

  // Auto-detect project type
  const detection = autoDetect.detectProjectType(resolvedPath);

  if (!detection.detected || !detection.projectType) {
    logger.warn('Auto-detection failed', { path: resolvedPath });
    return jsonResponse({
      success: false,
      message: 'Could not auto-detect project type',
      hint: 'Use setup with type parameter: setup type:"react-typescript"',
      availableTypes: Object.keys(SUPPORTED_PROJECTS)
    });
  }

  const detectedType = detection.projectType as ConfigProjectType;
  const project = SUPPORTED_PROJECTS[detectedType];

  state.activeProjectType = detectedType;
  state.loadedRules = rulesProvider.getRulesForProject(detectedType);
  state.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(detectedType);
  state.activeConfiguration = {
    id: `auto-${detectedType}-${Date.now()}`,
    name: `Auto - ${project.name}`,
    projectType: detectedType,
    selectedRules: state.loadedRules.map(r => r.id),
    selectedKnowledge: state.loadedKnowledge.map(k => k.id),
    customRules: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  logger.tool('setup', { path: projectPath, type: projectType, detected: detectedType }, startTime);

  return jsonResponse({
    success: true,
    message: `✅ Auto-configured for ${project.name}`,
    detection: {
      projectType: detectedType,
      confidence: detection.confidence,
      languages: detection.languages,
      frameworks: detection.frameworks
    },
    rulesLoaded: state.loadedRules.length,
    knowledgeLoaded: state.loadedKnowledge.length,
    nextSteps: ['Use "context" to see loaded rules', 'Use "review" to analyze your code']
  });
}
