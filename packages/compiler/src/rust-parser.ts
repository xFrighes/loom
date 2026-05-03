import { createRequire } from 'module'

const require = createRequire(import.meta.url)

let rustCore: any = null

try {
  // Attempt to load the native binary. 
  // In production, this would be a published package.
  // In development, we look in the build directory.
  rustCore = require('@loom-lang/loom_core')
} catch {
  // Fallback or silent fail if not built yet
  // console.warn('Rust core not found, falling back to TS parser')
}

export function tryRustParse(src: string): any {
  if (rustCore && typeof rustCore.napiParse === 'function') {
    const result = rustCore.napiParse(src)
    if (result && result.error) {
       // Handle Rust-originated parse error
       throw new Error(result.error) 
    }
    return normalizeRustResult(result)
  }
  return null
}

function normalizeRustResult(obj: any): any {
  if (obj === null) return undefined
  if (Array.isArray(obj)) return obj.map(normalizeRustResult)
  if (typeof obj === 'object') {
    const next: any = {}
    for (const key in obj) {
      next[key] = normalizeRustResult(obj[key])
    }
    return next
  }
  return obj
}

export function tryRustTokenize(src: string): any {
  if (rustCore && typeof rustCore.napiTokenize === 'function') {
    return rustCore.napiTokenize(src)
  }
  return null
}
