import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Brand Studio (../studio, Vite dev server on port 3000 with base '/studio/') is served through this origin in development,
    // so it shares the origin and the BrandShield session (localStorage). ws: true keeps Studio's HMR working.
    proxy: {
      '/studio': { target: 'http://127.0.0.1:3000', ws: true, changeOrigin: false },
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
