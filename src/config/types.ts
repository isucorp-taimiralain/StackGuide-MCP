// Supported project types
export type ProjectType = 
  | 'python-django'
  | 'python-fastapi'
  | 'python-flask'
  | 'react-node'
  | 'react-typescript'
  | 'vue-node'
  | 'nextjs'
  | 'express'
  | 'nestjs'
  | 'laravel'
  | 'rails'
  | 'golang'
  | 'rust'
  | 'custom';

// Project information
export interface ProjectInfo {
  type: ProjectType;
  name: string;
  description: string;
  languages: string[];
  frameworks: string[];
  detectionFiles: string[];
}

// Individual rule configuration
export interface Rule {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  content: string;
  enabled: boolean;
  priority: number;
}

// Rule categories
export type RuleCategory = 
  | 'coding-standards'
  | 'best-practices'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'testing'
  | 'documentation'
  | 'naming-conventions';

// Knowledge base file
export interface KnowledgeFile {
  id: string;
  name: string;
  path: string;
  projectType: ProjectType;
  category: KnowledgeCategory;
  description: string;
  content: string;
}

// Knowledge categories
export type KnowledgeCategory =
  | 'patterns'
  | 'common-issues'
  | 'architecture'
  | 'snippets'
  | 'workflows'
  | 'troubleshooting';

// User configuration
export interface UserConfiguration {
  id: string;
  name: string;
  projectType: ProjectType;
  selectedRules: string[];
  selectedKnowledge: string[];
  customRules: Rule[];
  createdAt: string;
  updatedAt: string;
}

// Server state
export interface ServerState {
  activeProjectType: ProjectType | null;
  activeConfiguration: UserConfiguration | null;
  loadedRules: Rule[];
  loadedKnowledge: KnowledgeFile[];
}

// Supported projects definition
export const SUPPORTED_PROJECTS: Record<ProjectType, ProjectInfo> = {
  'python-django': {
    type: 'python-django',
    name: 'Python Django',
    description: 'Django web framework with Python',
    languages: ['python'],
    frameworks: ['django'],
    detectionFiles: ['manage.py', 'django', 'settings.py']
  },
  'python-fastapi': {
    type: 'python-fastapi',
    name: 'Python FastAPI',
    description: 'FastAPI modern web framework',
    languages: ['python'],
    frameworks: ['fastapi'],
    detectionFiles: ['main.py', 'fastapi']
  },
  'python-flask': {
    type: 'python-flask',
    name: 'Python Flask',
    description: 'Flask micro web framework',
    languages: ['python'],
    frameworks: ['flask'],
    detectionFiles: ['app.py', 'flask']
  },
  'react-node': {
    type: 'react-node',
    name: 'React with Node.js',
    description: 'React frontend with Node.js backend',
    languages: ['javascript', 'typescript'],
    frameworks: ['react', 'node', 'express'],
    detectionFiles: ['package.json', 'react', 'node']
  },
  'react-typescript': {
    type: 'react-typescript',
    name: 'React TypeScript',
    description: 'React with TypeScript',
    languages: ['typescript'],
    frameworks: ['react'],
    detectionFiles: ['tsconfig.json', 'react']
  },
  'vue-node': {
    type: 'vue-node',
    name: 'Vue.js with Node.js',
    description: 'Vue.js frontend with Node.js backend',
    languages: ['javascript', 'typescript'],
    frameworks: ['vue', 'node'],
    detectionFiles: ['package.json', 'vue']
  },
  'nextjs': {
    type: 'nextjs',
    name: 'Next.js',
    description: 'Next.js React framework',
    languages: ['javascript', 'typescript'],
    frameworks: ['nextjs', 'react'],
    detectionFiles: ['next.config.js', 'next.config.mjs']
  },
  'express': {
    type: 'express',
    name: 'Express.js',
    description: 'Express.js Node framework',
    languages: ['javascript', 'typescript'],
    frameworks: ['express', 'node'],
    detectionFiles: ['package.json', 'express']
  },
  'nestjs': {
    type: 'nestjs',
    name: 'NestJS',
    description: 'NestJS Node framework',
    languages: ['typescript'],
    frameworks: ['nestjs', 'node'],
    detectionFiles: ['nest-cli.json', 'nestjs']
  },
  'laravel': {
    type: 'laravel',
    name: 'Laravel PHP',
    description: 'Laravel PHP framework',
    languages: ['php'],
    frameworks: ['laravel'],
    detectionFiles: ['artisan', 'composer.json']
  },
  'rails': {
    type: 'rails',
    name: 'Ruby on Rails',
    description: 'Ruby on Rails framework',
    languages: ['ruby'],
    frameworks: ['rails'],
    detectionFiles: ['Gemfile', 'config/routes.rb']
  },
  'golang': {
    type: 'golang',
    name: 'Go',
    description: 'Go programming language',
    languages: ['go'],
    frameworks: [],
    detectionFiles: ['go.mod', 'main.go']
  },
  'rust': {
    type: 'rust',
    name: 'Rust',
    description: 'Rust programming language',
    languages: ['rust'],
    frameworks: [],
    detectionFiles: ['Cargo.toml', 'main.rs']
  },
  'custom': {
    type: 'custom',
    name: 'Custom Project',
    description: 'Custom project configuration',
    languages: [],
    frameworks: [],
    detectionFiles: []
  }
};
