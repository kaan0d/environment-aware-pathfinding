import { defineConfig } from 'vitest/config'

// VITE_BASE lets GitHub Pages serve the build from a sub-path; benchmarks live in bench/ and run only via npm run bench.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  test: { include: ['tests/**/*.test.ts'] },
})
