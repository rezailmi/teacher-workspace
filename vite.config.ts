import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { madeRefine } from 'made-refine/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config
export default defineConfig({
  root: 'web',
  plugins: [
    react({
      babel: {
        plugins: ['made-refine/babel'],
      },
    }),
    tailwindcss(),
    madeRefine(),
  ],
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, 'web'),
    },
  },
  server: {
    proxy: {
      '/api/web': 'http://localhost:3000',
      '/api/files': 'http://localhost:3000',
      '/api/configs': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
