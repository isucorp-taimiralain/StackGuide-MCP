import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleInit } from '../src/handlers/init.js';

const mockState = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: [],
};

function parseResponse(result: { content: Array<{ text: string }> }): unknown {
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

describe('init handler', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackguide-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detect action', () => {
    it('should detect a Node.js project', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '18.0.0' } })
      );

      return handleInit({ action: 'detect', path: tmpDir }, mockState).then(result => {
        const data = parseResponse(result) as Record<string, unknown>;
        expect(data).toHaveProperty('detected', true);
        expect(data).toHaveProperty('projectType');
      });
    });

    it('should report not detected for empty dir', async () => {
      const result = await handleInit({ action: 'detect', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('detected', false);
    });

    it('should return error for non-existent path', async () => {
      const result = await handleInit({ action: 'detect', path: '/tmp/nonexistent-stackguide-xyz' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('error');
    });
  });

  describe('full action', () => {
    it('should scaffold .stackguide/ directory', async () => {
      const result = await handleInit({ action: 'full', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('totalFiles');
      expect((data.totalFiles as number)).toBeGreaterThan(0);

      const sgDir = path.join(tmpDir, '.stackguide');
      expect(fs.existsSync(sgDir)).toBe(true);
      expect(fs.existsSync(path.join(sgDir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(sgDir, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(sgDir, 'hooks'))).toBe(true);
      expect(fs.existsSync(path.join(sgDir, 'commands'))).toBe(true);
    });

    it('should include all 5 agents', async () => {
      await handleInit({ action: 'full', path: tmpDir }, mockState);
      const agentsDir = path.join(tmpDir, '.stackguide', 'agents');
      const agents = fs.readdirSync(agentsDir);
      expect(agents.length).toBe(5);
    });

    it('should include core skills', async () => {
      await handleInit({ action: 'full', path: tmpDir }, mockState);
      const skillsDir = path.join(tmpDir, '.stackguide', 'skills');
      const skills = fs.readdirSync(skillsDir);
      expect(skills).toContain('tdd-core.md');
      expect(skills).toContain('mr-conventions.md');
      expect(skills).toContain('traceability.md');
    });

    it('should include stack-specific skills when type is forced', async () => {
      const result = await handleInit({ action: 'full', path: tmpDir, type: 'laravel' }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('stackType', 'laravel');

      const skillsDir = path.join(tmpDir, '.stackguide', 'skills');
      const skills = fs.readdirSync(skillsDir);
      expect(skills).toContain('stack-laravel.md');
      expect(skills).toContain('stack-postgres-migrations.md');
    });

    it('should include react skills for react-typescript type', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '18.0.0' } })
      );
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } })
      );

      const result = await handleInit({ action: 'full', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('stackType', 'react-typescript');

      const skillsDir = path.join(tmpDir, '.stackguide', 'skills');
      const skills = fs.readdirSync(skillsDir);
      expect(skills).toContain('stack-react.md');
    });

    it('should include hooks', async () => {
      await handleInit({ action: 'full', path: tmpDir }, mockState);
      const hooksDir = path.join(tmpDir, '.stackguide', 'hooks');
      const hooks = fs.readdirSync(hooksDir);
      expect(hooks).toContain('check-branch-name.sh');
      expect(hooks).toContain('check-ticket-key.sh');
      expect(hooks).toContain('check-commit-msg.sh');
    });

    it('should include commands', async () => {
      await handleInit({ action: 'full', path: tmpDir }, mockState);
      const commandsDir = path.join(tmpDir, '.stackguide', 'commands');
      const commands = fs.readdirSync(commandsDir);
      expect(commands.length).toBe(5);
    });

    it('should generate .stackguide/config.json', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: {
            test: 'vitest run',
            lint: 'eslint .',
            build: 'tsc -b',
          },
        })
      );

      const result = await handleInit({ action: 'full', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('configPath');

      const configPath = path.join(tmpDir, '.stackguide', 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(config).toHaveProperty('tracker');
      expect(config).toHaveProperty('vcs');
      expect(config).toHaveProperty('testing');
      expect(config).toHaveProperty('workflow');
    });
  });

  describe('status action', () => {
    it('should report not initialized for a clean dir', async () => {
      const result = await handleInit({ action: 'status', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('initialized', false);
    });

    it('should report initialized after full init', async () => {
      await handleInit({ action: 'full', path: tmpDir }, mockState);
      const result = await handleInit({ action: 'status', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('initialized', true);
      expect(data).toHaveProperty('structure');
    });
  });

  describe('invalid action', () => {
    it('should return error for unknown action', async () => {
      const result = await handleInit({ action: 'foobar', path: tmpDir }, mockState);
      const data = parseResponse(result) as Record<string, unknown>;
      expect(data).toHaveProperty('error');
    });
  });
});
