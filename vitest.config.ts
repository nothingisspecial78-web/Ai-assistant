import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@ai-assistant/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@ai-assistant/server': path.resolve(__dirname, 'packages/server/src/index.ts'),
      '@ai-assistant/widget': path.resolve(__dirname, 'packages/widget/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    testTimeout: 15000,
  },
});
