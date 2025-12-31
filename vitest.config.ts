import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // Entry point with side effects
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 45,
        functions: 50,
        branches: 35,
        statements: 45,
      },
    },
    testTimeout: 10000,
  },
});
