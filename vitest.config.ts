import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], globals: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next build-time guard with no module Vite can resolve here. Without this
      // alias, any server module carrying the guard is unloadable in tests, which pushes you to
      // drop the guard rather than fix the config. Keep the guard, stub the import: `next build`
      // still enforces it.
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
  },
})
