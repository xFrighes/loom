import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import loom from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    loom({ target: 'svelte' }),
    svelte(),
  ],
})
