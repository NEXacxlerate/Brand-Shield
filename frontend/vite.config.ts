import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Brand Studio (../studio, Vite dev server on port 3000 with base '/studio/') is served through this origin in development,
    // so it shares the origin and the BrandShield session (localStorage). ws: true keeps Studio's HMR working.
    proxy: {
      '/studio': { target: process.env.STUDIO_DEV_URL || 'http://127.0.0.1:3000', ws: true, changeOrigin: false },
      // Studio calls the API on its own (this) origin with relative /api URLs; BrandShield itself uses VITE_API_URL and is not affected.
      '/api': { target: process.env.STUDIO_API_PROXY || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
