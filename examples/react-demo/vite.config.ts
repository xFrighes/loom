import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import loom from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    loom({ target: 'react' }),
    react(),
  ],
})
