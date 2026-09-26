import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gamePort = process.env.GAME_PORT ?? '2577';
  const server = env.VITE_GAME_SERVER ?? process.env.VITE_GAME_SERVER;

  if (command === 'build' && process.env.ALLOW_OFFLINE_BUILD !== '1' && (!server || !server.startsWith('wss://'))) {
    throw new Error(
      '\n[itch.io / Production Build Guard]\n' +
      'VITE_GAME_SERVER must be set to your online backend WebSocket URL (wss://...) before building for itch.io / production.\n' +
      'Example:\n' +
      '  VITE_GAME_SERVER=wss://<your-backend-domain>.up.railway.app npm run package:itch\n\n' +
      'If you intentionally want to test a build without a live server URL, pass:\n' +
      '  ALLOW_OFFLINE_BUILD=1 npm run build:client\n'
    );
  }

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
