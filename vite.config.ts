import { defineConfig } from 'vitest/config'

// Relative asset paths by default, so the build works from any sub-path such as GitHub Pages; VITE_BASE overrides; benchmarks live in bench/ and run only via npm run bench.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  test: { include: ['tests/**/*.test.ts'] },
})
