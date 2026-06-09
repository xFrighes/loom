import react from '@vitejs/plugin-react'
import loom from 'vite-plugin-loom'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), loom({ target: 'react' })],
})
