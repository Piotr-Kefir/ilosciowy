/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' — działa na Vercel, GitHub Pages (podkatalog) i z dowolnej ścieżki.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
})
