/**
 * Setup handler - configures StackGuide for a project
 * Includes interactive wizard with recommendations
 */

import { ProjectType as ConfigProjectType, SUPPORTED_PROJECTS } from '../config/types.js';
import * as rulesProvider from '../resources/rulesProvider.js';
import * as knowledgeProvider from '../resources/knowledgeProvider.js';
import * as autoDetect from '../services/autoDetect.js';
import { ServerState, ToolResponse, jsonResponse, errorResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { SetupInputSchema, validate } from '../utils/validation.js';

// Recommendations based on project type
const PROJECT_RECOMMENDATIONS: Record<string, {
  tools: string[];
  extensions: string[];
  commands: string[];
  tips: string[];
}> = {
  'react-typescript': {
    tools: ['ESLint', 'Prettier', 'TypeScript strict mode'],
    extensions: ['ES7+ React/Redux/React-Native snippets', 'Auto Import', 'Error Lens'],
    commands: ['review focus:"performance"', 'generate type:"component" name:"MyComponent"'],
    tips: [
      'Use functional components with hooks',
      'Memoize expensive computations with useMemo',
      'Keep components small and focused'
    ]
  },
  'nextjs': {
    tools: ['ESLint Next.js config', 'Prettier', 'TypeScript'],
    extensions: ['Next.js snippets', 'Tailwind CSS IntelliSense'],
    commands: ['review focus:"performance"', 'docs url:"https://nextjs.org/docs"'],
    tips: [
      'Use Server Components by default',
      'Leverage ISR for dynamic content',
      'Optimize images with next/image'
    ]
  },
  'node-typescript': {
    tools: ['ESLint', 'Prettier', 'ts-node-dev'],
    extensions: ['REST Client', 'Thunder Client', 'Error Lens'],
    commands: ['review focus:"security"', 'generate type:"api" name:"Users"'],
    tips: [
      'Use dependency injection for testability',
      'Validate all inputs with Zod',
      'Structure with clean architecture'
    ]
  },
  'python': {
    tools: ['Black', 'Ruff', 'mypy'],
    extensions: ['Pylance', 'Python Debugger', 'autoDocstring'],
    commands: ['review focus:"security"', 'generate type:"test" name:"api_tests"'],
    tips: [
      'Use type hints everywhere',
      'Follow PEP 8 conventions',
      'Use virtual environments'
    ]
  },
  'default': {
    tools: ['ESLint/appropriate linter', 'Prettier/formatter'],
    extensions: ['Error Lens', 'GitLens'],
    commands: ['review', 'context', 'health'],
    tips: [
      'Run review regularly',
      'Keep dependencies updated',
      'Write tests for critical paths'
    ]
  }
};

function getRecommendations(projectType: string) {
  return PROJECT_RECOMMENDATIONS[projectType] || PROJECT_RECOMMENDATIONS['default'];
}

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

    const recommendations = getRecommendations(projectType);
    logger.tool('setup', args as Record<string, unknown>, startTime);

    return jsonResponse({
      success: true,
      message: `✅ Configured for ${project.name}`,
      projectType,
      rulesLoaded: state.loadedRules.length,
      knowledgeLoaded: state.loadedKnowledge.length,
      wizard: {
        step: '1/3 - Setup Complete ✓',
        recommendations: {
          suggestedTools: recommendations.tools,
          vsCodeExtensions: recommendations.extensions,
          tips: recommendations.tips
        },
        nextSteps: [
          `📋 Run \`context\` to see ${state.loadedRules.length} loaded rules`,
          `🔍 Run \`review\` to analyze your code`,
          `🏥 Run \`health\` to check project health`,
          ...recommendations.commands.map(cmd => `💡 Try: \`${cmd}\``)
        ]
      }
    });
  }

  // Auto-detect project type
  const detection = autoDetect.detectProjectType(resolvedPath);

  if (!detection.detected || !detection.projectType) {
    logger.warn('Auto-detection failed', { path: resolvedPath });
    return jsonResponse({
      success: false,
      message: '🔍 Could not auto-detect project type',
      wizard: {
        step: '1/3 - Detection',
        status: 'needs_input',
        question: 'What type of project is this?',
        options: Object.entries(SUPPORTED_PROJECTS).map(([key, val]) => ({
          value: key,
          label: val.name,
          description: val.description
        })),
        hint: 'Use: setup type:"react-typescript"',
        availableTypes: Object.keys(SUPPORTED_PROJECTS)
      }
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

  const recommendations = getRecommendations(detectedType);
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
    wizard: {
      step: '1/3 - Setup Complete ✓',
      detectedAs: project.name,
      confidenceLevel: detection.confidence === 'high' ? 'High' : detection.confidence === 'medium' ? 'Medium' : 'Low',
      recommendations: {
        suggestedTools: recommendations.tools,
        vsCodeExtensions: recommendations.extensions,
        tips: recommendations.tips
      },
      nextSteps: [
        `📋 Run \`context\` to see ${state.loadedRules.length} loaded rules`,
        `🔍 Run \`review\` to analyze your code`,
        `🏥 Run \`health\` to check project health`,
        ...recommendations.commands.map(cmd => `💡 Try: \`${cmd}\``)
      ]
    }
  });
}
