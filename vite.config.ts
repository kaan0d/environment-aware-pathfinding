import { defineConfig } from 'vite'

// VITE_BASE lets GitHub Pages serve the build from a sub-path.
export default defineConfig({ base: process.env.VITE_BASE ?? '/' })
