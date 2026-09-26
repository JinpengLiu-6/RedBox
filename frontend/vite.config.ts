import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gamePort = process.env.GAME_PORT ?? '2577';
  
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@redbox/shared/schema': resolve(__dirname, '../shared/src/schema.ts'),
        '@redbox/shared': resolve(__dirname, '../shared/src/index.ts'),
        '@': resolve(__dirname, 'src'),
      },
    },
    build: { target: 'es2022' },
    server: { 
      port: Number(process.env.CLIENT_PORT ?? 5180),
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/game': {
          target: `http://127.0.0.1:${gamePort}`,
          ws: true,
          rewrite: (path) => path.replace(/^\/game/, ''),
        },
      },
    },
  };
});
