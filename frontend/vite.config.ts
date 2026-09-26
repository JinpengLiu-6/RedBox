import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@redbox/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@redbox/shared/schema': resolve(__dirname, '../shared/src/schema.ts'),
    },
  },
  server: { port: 5173 },
});
