import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../data/workflows/tdd/scripts');

function run(script: string, args: string[], cwd: string) {
  return spawnSync('bash', [path.join(SCRIPTS_DIR, script), ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

describe('workflow scripts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackguide-scripts-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('tdd-feature-branch.sh', () => {
    it('should reject an invalid ticket key before touching git', () => {
      const result = run('tdd-feature-branch.sh', ['proj-123', 'valid-slug'], tmpDir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid TICKET-KEY');
    });

    it('should reject an invalid slug before touching git', () => {
      const result = run('tdd-feature-branch.sh', ['PROJ-123', 'Bad_Slug'], tmpDir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid slug');
    });

    it('should create the feature branch from a valid ticket and slug', () => {
      spawnSync('git', ['init', '-b', 'development'], { cwd: tmpDir });
      const result = run('tdd-feature-branch.sh', ['PROJ-123', 'customer-onboarding'], tmpDir);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('feature/PROJ-123-customer-onboarding');
    });
  });

  describe('oj-verify.sh', () => {
    it('should fail open (127) when no OJ contract exists', () => {
      const result = run('oj-verify.sh', [], tmpDir);
      expect(result.status).toBe(127);
      expect(result.stderr).toContain('OJ skipped');
    });
  });
});
