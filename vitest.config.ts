import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run test files sequentially to avoid SQLite state pollution
    fileParallelism: false,
    // Each test file gets isolated sequence
    sequence: {
      hooks: 'list',
    },
  },
});
