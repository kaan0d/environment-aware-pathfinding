import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['bench/**/*.bench.ts'], testTimeout: 60000 } })
