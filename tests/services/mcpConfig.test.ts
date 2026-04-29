import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { previewMcpTemplateSync, syncMcpTemplateConfigs } from '../../src/services/mcpConfig.js';

describe('mcpConfig service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackguide-mcp-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('previews additions for both manifest targets', () => {
    const preview = previewMcpTemplateSync(tmpDir, ['jira', 'github'], ['cursor', 'root']);

    expect(preview.integrations).toEqual(['jira', 'github']);
    expect(preview.targets.length).toBe(2);
    expect(preview.targets[0].addedServers.length).toBeGreaterThan(0);
    expect(preview.placeholders).toContain('<JIRA_TOKEN>');
  });

  it('syncs templates into .cursor/mcp.json and .mcp.json', () => {
    const result = syncMcpTemplateConfigs(tmpDir, ['jira', 'gitlab'], ['cursor', 'root']);

    expect(result.targets).toHaveLength(2);
    const cursorPath = path.join(tmpDir, '.cursor', 'mcp.json');
    const rootPath = path.join(tmpDir, '.mcp.json');

    expect(fs.existsSync(cursorPath)).toBe(true);
    expect(fs.existsSync(rootPath)).toBe(true);

    const cursorManifest = JSON.parse(fs.readFileSync(cursorPath, 'utf-8')) as { mcpServers: Record<string, unknown> };
    const rootManifest = JSON.parse(fs.readFileSync(rootPath, 'utf-8')) as { mcpServers: Record<string, unknown> };

    expect(Object.keys(cursorManifest.mcpServers)).toContain('jira');
    expect(Object.keys(rootManifest.mcpServers)).toContain('gitlab');
  });

  it('does not overwrite existing server definitions', () => {
    const rootPath = path.join(tmpDir, '.mcp.json');
    fs.writeFileSync(rootPath, JSON.stringify({
      mcpServers: {
        jira: {
          command: 'node',
          args: ['custom-jira.js'],
        },
      },
    }, null, 2));

    const result = syncMcpTemplateConfigs(tmpDir, ['jira'], ['root']);
    const manifest = JSON.parse(fs.readFileSync(rootPath, 'utf-8')) as { mcpServers: Record<string, { command: string }> };

    expect(result.targets[0].addedServers).toEqual([]);
    expect(result.targets[0].skippedServers).toEqual(['jira']);
    expect(manifest.mcpServers.jira.command).toBe('node');
  });
});
