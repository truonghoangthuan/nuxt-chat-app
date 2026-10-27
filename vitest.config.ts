import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '#supabase/server': fileURLToPath(new URL('./tests/helpers/supabaseServer.ts', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.nuxt/**', '**/.output/**'],
  },
})
