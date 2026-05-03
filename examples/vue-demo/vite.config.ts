import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import loom from 'vite-plugin-loom'
export default defineConfig({
  plugins: [
    loom({ target: 'vue' }),
    vue(),
  ],
  build: { minify: false },
})
