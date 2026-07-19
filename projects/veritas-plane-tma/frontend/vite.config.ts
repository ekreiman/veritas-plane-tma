import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build output is served at the site root by Kai's Caddy config
// (TLV-2682 runbook: `/` and static assets from
// `/srv/veritas-plane-tma/frontend/dist`, SPA fallback to `/index.html`,
// `/api/*` and `/auth/*` proxied to FastAPI on 127.0.0.1:8081). Root
// base path (not `/tma/`) matches that routing exactly.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    // Local dev proxy — mirrors the TLV-2682 production routing (FastAPI
    // on 127.0.0.1:8081) so `npm run dev` behaves the same as the deployed
    // Caddy setup.
    proxy: {
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
      '/auth': { target: 'http://localhost:8081', changeOrigin: true },
    },
  },
});
