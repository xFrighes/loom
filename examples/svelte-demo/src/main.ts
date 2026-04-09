// @ts-expect-error — .loom files are handled by vite-plugin-loom
import App from './App.loom'

new App({ target: document.getElementById('app')! })
