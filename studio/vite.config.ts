/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Brand Studio is served under /studio/ on the same origin as BrandShield (shared login session).
// Nothing from the environment is injected into the bundle: AI keys live on the BrandShield server.
export default defineConfig({
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    // Only used when this dev server is opened directly; normally BrandShield's dev server proxies /studio here
    // and /api to the backend, so everything shares one origin.
    proxy: { '/api': { target: process.env.STUDIO_API_PROXY || 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
