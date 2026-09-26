import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const server = env.VITE_GAME_SERVER ?? process.env.VITE_GAME_SERVER;
  // A production build without the Railway URL would connect to the page's own
  // host (itch.io's CDN, or Vercel) and silently fail. Refuse to build instead.
  if (command === 'build' && (!server || !server.startsWith('wss://'))) {
    throw new Error('VITE_GAME_SERVER must be set to the Railway wss:// URL for production builds, e.g. VITE_GAME_SERVER=wss://redbox.up.railway.app');
  }
  return {
    // itch.io serves the game from a sub-path on its CDN: every asset path must be relative.
    base: './',
    resolve: {
      alias: {
        '@redbox/shared/schema': resolve(__dirname, '../shared/src/schema.ts'),
        '@redbox/shared': resolve(__dirname, '../shared/src/index.ts'),
      },
    },
    build: { target: 'es2022' },
    server: { port: 5173 },
  };
});
