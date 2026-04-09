import { createApp } from 'vue'
// @ts-expect-error — .loom files are handled by vite-plugin-loom
import App from './App.loom'

createApp(App).mount('#app')
