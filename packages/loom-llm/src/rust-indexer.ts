import { createRequire } from 'module'
const require = createRequire(import.meta.url)

let rustCore: any = null

try {
  rustCore = require('@loom-lang/loom_core')
} catch {
  // Fallback handled by the caller
}

export function tryRustIndexWorkspace(options: any): any {
  if (rustCore && typeof rustCore.indexWorkspace === 'function') {
    return rustCore.indexWorkspace(options.root, options.cacheDir, options.inputs)
  }
  return null
}

export function tryRustHashText(text: string): string | null {
  if (rustCore && typeof rustCore.hashText === 'function') {
    return rustCore.hashText(text)
  }
  return null
}
