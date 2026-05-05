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
  if (rustCore && typeof rustCore.napiParseJson === 'function') {
    const result = JSON.parse(rustCore.napiParseJson(src))
    if (result && result.error) {
      throw new Error(result.error)
    }
    return result
  }

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
  if (rustCore && typeof rustCore.napiTokenizeJson === 'function') {
    return JSON.parse(rustCore.napiTokenizeJson(src))
  }

  if (rustCore && typeof rustCore.napiTokenize === 'function') {
    return rustCore.napiTokenize(src)
  }
  return null
}

export function tryRustParseMany(sources: string[]): any[] | null {
  if (rustCore && typeof rustCore.napiParseManyJson === 'function') {
    return rustCore.napiParseManyJson(sources).map((result: string) => {
      const parsed = JSON.parse(result)
      if (parsed && parsed.error) {
        throw new Error(parsed.error)
      }
      return parsed
    })
  }
  return null
}
