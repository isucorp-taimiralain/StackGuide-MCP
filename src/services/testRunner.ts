/**
 * Test runner service for active agents.
 * Executes configured test/lint/build commands and returns structured results.
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';
import { createServiceCircuitBreaker } from '../utils/circuitBreaker.js';
import { TestingConfig, TestingLayerConfig } from '../config/agentConfig.js';

const execAsync = promisify(execCallback);

export interface CommandExecutionResult {
  command: string;
  cwd: string;
  success: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
  timedOut: boolean;
}

export interface TestSummary {
  passed: number;
  failed: number;
  total: number;
  skipped: number;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  clean: boolean;
}

export interface TestRunResult extends CommandExecutionResult {
  summary: TestSummary;
}

export interface LintRunResult extends CommandExecutionResult {
  summary: LintSummary;
}

export interface BuildRunResult extends CommandExecutionResult {}

export interface LayerExecutionResult {
  layer: string;
  dir: string;
  tests?: TestRunResult;
  lint?: LintRunResult;
  build?: BuildRunResult;
}

type CommandExecutor = (
  command: string,
  cwd: string,
  timeoutMs: number
) => Promise<CommandExecutionResult>;

function parseTestSummary(output: string): TestSummary {
  const summary: TestSummary = {
    passed: 0,
    failed: 0,
    total: 0,
    skipped: 0,
  };

  // Vitest style: "Tests 1 failed | 765 passed (766)"
  const vitestMixed = output.match(/Tests?\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed(?:\s*\((\d+)\))?/i);
  if (vitestMixed) {
    summary.failed = Number(vitestMixed[1] || 0);
    summary.passed = Number(vitestMixed[2] || 0);
    summary.total = Number(vitestMixed[3] || (summary.passed + summary.failed));
    return summary;
  }

  // Vitest all green: "Tests 796 passed (796)"
  const vitestPassed = output.match(/Tests?\s+(\d+)\s+passed(?:\s*\((\d+)\))?/i);
  if (vitestPassed) {
    summary.passed = Number(vitestPassed[1] || 0);
    summary.total = Number(vitestPassed[2] || summary.passed);
    return summary;
  }

  // PHPUnit/Pest style.
  const phpUnitTotal = output.match(/Tests?:\s+(\d+)/i);
  const phpUnitFailures = output.match(/Failures?:\s+(\d+)/i);
  const phpUnitSkipped = output.match(/Skipped:\s+(\d+)/i);
  if (phpUnitTotal) {
    summary.total = Number(phpUnitTotal[1] || 0);
    summary.failed = Number(phpUnitFailures?.[1] || 0);
    summary.skipped = Number(phpUnitSkipped?.[1] || 0);
    summary.passed = Math.max(0, summary.total - summary.failed - summary.skipped);
    return summary;
  }

  // Fallback.
  if (/failed/i.test(output)) {
    summary.failed = 1;
    summary.total = 1;
  }
  if (/pass/i.test(output)) {
    summary.passed = Math.max(summary.passed, 1);
    summary.total = Math.max(summary.total, summary.passed + summary.failed);
  }

  return summary;
}

function parseLintSummary(output: string, success: boolean): LintSummary {
  const eslintProblems = output.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/i);
  if (eslintProblems) {
    const errors = Number(eslintProblems[2] || 0);
    const warnings = Number(eslintProblems[3] || 0);
    return {
      errors,
      warnings,
      clean: errors === 0 && warnings === 0,
    };
  }

  const errorsOnly = output.match(/(\d+)\s+errors?/i);
  const warningsOnly = output.match(/(\d+)\s+warnings?/i);
  const errors = Number(errorsOnly?.[1] || 0);
  const warnings = Number(warningsOnly?.[1] || 0);

  if (errors > 0 || warnings > 0) {
    return {
      errors,
      warnings,
      clean: errors === 0 && warnings === 0,
    };
  }

  return {
    errors: success ? 0 : 1,
    warnings: 0,
    clean: success,
  };
}

function defaultCommandExecutor(): CommandExecutor {
  return async (command: string, cwd: string, timeoutMs: number): Promise<CommandExecutionResult> => {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 25,
      });
      return {
        command,
        cwd,
        success: true,
        exitCode: 0,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
        durationMs: Date.now() - start,
        timedOut: false,
      };
    } catch (error) {
      const withOutput = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: number;
        signal?: string;
      };
      const timedOut = withOutput.signal === 'SIGTERM' || /timed out/i.test(withOutput.message);
      return {
        command,
        cwd,
        success: false,
        exitCode: typeof withOutput.code === 'number' ? withOutput.code : 1,
        output: [withOutput.stdout, withOutput.stderr, withOutput.message].filter(Boolean).join('\n').trim(),
        durationMs: Date.now() - start,
        timedOut,
      };
    }
  };
}

export class TestRunnerService {
  private readonly executeCommand: CommandExecutor;
  private readonly commandBreaker = createServiceCircuitBreaker('test-runner', {
    failureThreshold: 3,
    callTimeoutMs: 10 * 60 * 1000,
    resetTimeoutMs: 30_000,
  });

  constructor(executor?: CommandExecutor) {
    this.executeCommand = executor || defaultCommandExecutor();
  }

  private async runCommand(command: string, cwd: string, timeoutMs = 5 * 60 * 1000): Promise<CommandExecutionResult> {
    return this.commandBreaker.execute(async () => this.executeCommand(command, cwd, timeoutMs));
  }

  async runTests(layer: TestingLayerConfig, projectPath: string): Promise<TestRunResult> {
    const cwd = layer.dir === '.' ? projectPath : path.join(projectPath, layer.dir);
    const command = layer.commands.test || '';
    if (!command) {
      return {
        command: '',
        cwd,
        success: true,
        exitCode: 0,
        output: '',
        durationMs: 0,
        timedOut: false,
        summary: { passed: 0, failed: 0, total: 0, skipped: 0 },
      };
    }

    const result = await this.runCommand(command, cwd);
    return {
      ...result,
      summary: parseTestSummary(result.output),
    };
  }

  async runLint(layer: TestingLayerConfig, projectPath: string): Promise<LintRunResult> {
    const cwd = layer.dir === '.' ? projectPath : path.join(projectPath, layer.dir);
    const command = layer.commands.lint || layer.commands.typecheck || '';
    if (!command) {
      return {
        command: '',
        cwd,
        success: true,
        exitCode: 0,
        output: '',
        durationMs: 0,
        timedOut: false,
        summary: { errors: 0, warnings: 0, clean: true },
      };
    }

    const result = await this.runCommand(command, cwd);
    return {
      ...result,
      summary: parseLintSummary(result.output, result.success),
    };
  }

  async runBuild(layer: TestingLayerConfig, projectPath: string): Promise<BuildRunResult> {
    const cwd = layer.dir === '.' ? projectPath : path.join(projectPath, layer.dir);
    const command = layer.commands.build || '';
    if (!command) {
      return {
        command: '',
        cwd,
        success: true,
        exitCode: 0,
        output: '',
        durationMs: 0,
        timedOut: false,
      };
    }
    return this.runCommand(command, cwd);
  }

  async runLayer(layerName: string, layer: TestingLayerConfig, projectPath: string): Promise<LayerExecutionResult> {
    const result: LayerExecutionResult = {
      layer: layerName,
      dir: layer.dir,
    };

    if (layer.commands.test) {
      result.tests = await this.runTests(layer, projectPath);
    }
    if (layer.commands.lint || layer.commands.typecheck) {
      result.lint = await this.runLint(layer, projectPath);
    }
    if (layer.commands.build) {
      result.build = await this.runBuild(layer, projectPath);
    }

    return result;
  }

  async runConfiguredLayers(testing: TestingConfig, projectPath: string): Promise<LayerExecutionResult[]> {
    const results: LayerExecutionResult[] = [];

    if (testing.backend?.enabled) {
      results.push(await this.runLayer('backend', testing.backend, projectPath));
    }
    if (testing.frontend?.enabled) {
      results.push(await this.runLayer('frontend', testing.frontend, projectPath));
    }

    return results;
  }
}

export const __internal = {
  parseTestSummary,
  parseLintSummary,
};
