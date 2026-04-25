import { describe, it, expect, vi } from 'vitest';
import { TestRunnerService, __internal } from '../src/services/testRunner.js';

describe('TestRunnerService', () => {
  it('parses vitest output summary', () => {
    const summary = __internal.parseTestSummary('Tests 1 failed | 7 passed (8)');
    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(7);
    expect(summary.total).toBe(8);
  });

  it('parses eslint output summary', () => {
    const summary = __internal.parseLintSummary('12 problems (3 errors, 9 warnings)', false);
    expect(summary.errors).toBe(3);
    expect(summary.warnings).toBe(9);
    expect(summary.clean).toBe(false);
  });

  it('runs configured layers and returns structured results', async () => {
    const executor = vi.fn(async (command: string) => {
      if (command === 'pnpm test') {
        return {
          command,
          cwd: '/tmp/project/frontend',
          success: true,
          exitCode: 0,
          output: 'Tests 3 passed (3)',
          durationMs: 100,
          timedOut: false,
        };
      }

      if (command === 'pnpm lint') {
        return {
          command,
          cwd: '/tmp/project/frontend',
          success: true,
          exitCode: 0,
          output: '0 problems (0 errors, 0 warnings)',
          durationMs: 80,
          timedOut: false,
        };
      }

      return {
        command,
        cwd: '/tmp/project/frontend',
        success: true,
        exitCode: 0,
        output: '',
        durationMs: 50,
        timedOut: false,
      };
    });

    const service = new TestRunnerService(executor);
    const results = await service.runConfiguredLayers(
      {
        frontend: {
          dir: 'frontend',
          enabled: true,
          commands: {
            test: 'pnpm test',
            lint: 'pnpm lint',
          },
        },
      },
      '/tmp/project'
    );

    expect(results).toHaveLength(1);
    expect(results[0].tests?.summary.passed).toBe(3);
    expect(results[0].lint?.summary.clean).toBe(true);
  });

  it('returns failed result when command fails', async () => {
    const executor = vi.fn(async (command: string) => ({
      command,
      cwd: '/tmp/project/backend',
      success: false,
      exitCode: 1,
      output: 'Tests 2 failed | 1 passed (3)',
      durationMs: 120,
      timedOut: false,
    }));

    const service = new TestRunnerService(executor);
    const result = await service.runTests(
      {
        dir: 'backend',
        enabled: true,
        commands: { test: 'pnpm test' },
      },
      '/tmp/project'
    );

    expect(result.success).toBe(false);
    expect(result.summary.failed).toBe(2);
  });
});
