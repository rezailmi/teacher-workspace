import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: '.',
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./web/test/setup.ts'],
      include: ['web/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
