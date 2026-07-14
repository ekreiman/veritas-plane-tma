import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build output is served at /tma/ by whatever reverse proxy fronts the
// backend that talks to Plane's API (TBD — Kai's original Caddy config
// was written against a different, now-retired upstream and needs a
// fresh Caddyfile pointed at this app's own backend, not Plane directly).
export default defineConfig({
  base: '/tma/',
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
    // Local dev proxy — points at whatever backend service ends up
    // brokering initData validation -> Plane identity -> Plane API calls.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/auth': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});
