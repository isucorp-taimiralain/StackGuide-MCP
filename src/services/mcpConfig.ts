import * as fs from 'fs';
import * as path from 'path';
import { McpIntegration, McpManifestTarget } from '../config/agentConfig.js';

interface McpManifest {
  mcpServers: Record<string, Record<string, unknown>>;
}

interface IntegrationTemplate {
  serverName: string;
  config: Record<string, unknown>;
  placeholders: string[];
}

export interface McpSyncTargetResult {
  target: McpManifestTarget;
  path: string;
  existed: boolean;
  existingServers: string[];
  addedServers: string[];
  skippedServers: string[];
  totalServers: number;
}

export interface McpSyncResult {
  integrations: McpIntegration[];
  placeholders: string[];
  targets: McpSyncTargetResult[];
}

const TARGETS: McpManifestTarget[] = ['cursor', 'root'];

const INTEGRATION_TEMPLATES: Record<McpIntegration, IntegrationTemplate> = {
  jira: {
    serverName: 'jira',
    config: {
      command: 'npx',
      args: ['-y', '<jira-mcp-package>'],
      env: {
        JIRA_BASE_URL: 'https://your-domain.atlassian.net',
        JIRA_TOKEN: '<JIRA_TOKEN>',
      },
    },
    placeholders: ['<jira-mcp-package>', '<JIRA_TOKEN>'],
  },
  github: {
    serverName: 'github',
    config: {
      command: 'npx',
      args: ['-y', '<github-mcp-package>'],
      env: {
        GITHUB_TOKEN: '<GITHUB_TOKEN>',
      },
    },
    placeholders: ['<github-mcp-package>', '<GITHUB_TOKEN>'],
  },
  gitlab: {
    serverName: 'gitlab',
    config: {
      command: 'npx',
      args: ['-y', '<gitlab-mcp-package>'],
      env: {
        GITLAB_BASE_URL: 'https://gitlab.com',
        GITLAB_TOKEN: '<GITLAB_TOKEN>',
      },
    },
    placeholders: ['<gitlab-mcp-package>', '<GITLAB_TOKEN>'],
  },
};

function normalizeIntegrations(integrations: McpIntegration[]): McpIntegration[] {
  const unique = new Set<McpIntegration>();
  for (const integration of integrations) {
    if (integration in INTEGRATION_TEMPLATES) {
      unique.add(integration);
    }
  }
  return Array.from(unique.values());
}

function normalizeTargets(targets?: McpManifestTarget[]): McpManifestTarget[] {
  if (!targets || targets.length === 0) {
    return [...TARGETS];
  }
  const unique = new Set<McpManifestTarget>();
  for (const target of targets) {
    if (target === 'cursor' || target === 'root') {
      unique.add(target);
    }
  }
  return unique.size > 0 ? Array.from(unique.values()) : [...TARGETS];
}

function resolveManifestPath(projectPath: string, target: McpManifestTarget): string {
  if (target === 'cursor') {
    return path.join(projectPath, '.cursor', 'mcp.json');
  }
  return path.join(projectPath, '.mcp.json');
}

function readManifest(filePath: string): { manifest: McpManifest; existed: boolean } {
  if (!fs.existsSync(filePath)) {
    return {
      manifest: { mcpServers: {} },
      existed: false,
    };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<McpManifest>;
    if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return {
        manifest: {
          mcpServers: parsed.mcpServers as Record<string, Record<string, unknown>>,
        },
        existed: true,
      };
    }
  } catch {
    // Fall back to an empty manifest to recover malformed files safely.
  }

  return {
    manifest: { mcpServers: {} },
    existed: true,
  };
}

function cloneTemplateConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function getTemplateServers(integrations: McpIntegration[]): Record<string, Record<string, unknown>> {
  const servers: Record<string, Record<string, unknown>> = {};
  for (const integration of integrations) {
    const template = INTEGRATION_TEMPLATES[integration];
    if (!template) {
      continue;
    }
    servers[template.serverName] = cloneTemplateConfig(template.config);
  }
  return servers;
}

function getTemplatePlaceholders(integrations: McpIntegration[]): string[] {
  const values = new Set<string>();
  for (const integration of integrations) {
    const template = INTEGRATION_TEMPLATES[integration];
    if (!template) {
      continue;
    }
    for (const placeholder of template.placeholders) {
      values.add(placeholder);
    }
  }
  return Array.from(values.values());
}

function writeManifest(filePath: string, manifest: McpManifest): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function calculateTargetResult(
  target: McpManifestTarget,
  filePath: string,
  existed: boolean,
  existingServers: string[],
  addedServers: string[],
  skippedServers: string[],
  totalServers: number
): McpSyncTargetResult {
  return {
    target,
    path: filePath,
    existed,
    existingServers,
    addedServers,
    skippedServers,
    totalServers,
  };
}

export function previewMcpTemplateSync(
  projectPath: string,
  integrations: McpIntegration[],
  targets?: McpManifestTarget[]
): McpSyncResult {
  const selectedIntegrations = normalizeIntegrations(integrations);
  const selectedTargets = normalizeTargets(targets);
  const templateServers = getTemplateServers(selectedIntegrations);
  const templateNames = Object.keys(templateServers);

  const results: McpSyncTargetResult[] = [];
  for (const target of selectedTargets) {
    const filePath = resolveManifestPath(projectPath, target);
    const { manifest, existed } = readManifest(filePath);
    const existingServers = Object.keys(manifest.mcpServers);
    const addedServers = templateNames.filter(name => !existingServers.includes(name));
    const skippedServers = templateNames.filter(name => existingServers.includes(name));
    results.push(
      calculateTargetResult(
        target,
        filePath,
        existed,
        existingServers,
        addedServers,
        skippedServers,
        existingServers.length + addedServers.length
      )
    );
  }

  return {
    integrations: selectedIntegrations,
    placeholders: getTemplatePlaceholders(selectedIntegrations),
    targets: results,
  };
}

export function syncMcpTemplateConfigs(
  projectPath: string,
  integrations: McpIntegration[],
  targets?: McpManifestTarget[]
): McpSyncResult {
  const selectedIntegrations = normalizeIntegrations(integrations);
  const selectedTargets = normalizeTargets(targets);
  const templateServers = getTemplateServers(selectedIntegrations);
  const templateEntries = Object.entries(templateServers);

  const results: McpSyncTargetResult[] = [];
  for (const target of selectedTargets) {
    const filePath = resolveManifestPath(projectPath, target);
    const { manifest, existed } = readManifest(filePath);
    const existingServers = Object.keys(manifest.mcpServers);
    const addedServers: string[] = [];
    const skippedServers: string[] = [];

    for (const [serverName, serverConfig] of templateEntries) {
      if (manifest.mcpServers[serverName]) {
        skippedServers.push(serverName);
        continue;
      }
      manifest.mcpServers[serverName] = cloneTemplateConfig(serverConfig);
      addedServers.push(serverName);
    }

    if (addedServers.length > 0) {
      writeManifest(filePath, manifest);
    }

    results.push(
      calculateTargetResult(
        target,
        filePath,
        existed,
        existingServers,
        addedServers,
        skippedServers,
        Object.keys(manifest.mcpServers).length
      )
    );
  }

  return {
    integrations: selectedIntegrations,
    placeholders: getTemplatePlaceholders(selectedIntegrations),
    targets: results,
  };
}
