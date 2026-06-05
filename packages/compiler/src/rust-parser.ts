let rustCore: any = null

try {
  // Attempt to load the native binary. 
  // In production, this would be a published package.
  // In development, we look in the build directory.
  const nodeRequire = new Function('return typeof require === "function" ? require : undefined')() as NodeRequire | undefined
  rustCore = nodeRequire?.('@loom-ui/loom_core') ?? null
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
    if (hasAdvancedZones(src) && missingAdvancedZoneResult(result)) return null
    if (hasExplicitViewZone(src) && missingViewZoneResult(result)) return null
    return result
  }

  if (rustCore && typeof rustCore.napiParse === 'function') {
    const result = rustCore.napiParse(src)
    if (result && result.error) {
       // Handle Rust-originated parse error
       throw new Error(result.error) 
    }
    if (hasAdvancedZones(src) && missingAdvancedZoneResult(result)) return null
    if (hasExplicitViewZone(src) && missingViewZoneResult(result)) return null
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
    const parsedResults = rustCore.napiParseManyJson(sources).map((result: string) => {
      const parsed = JSON.parse(result)
      if (parsed && parsed.error) {
        throw new Error(parsed.error)
      }
      return parsed
    })
    if (parsedResults.some((result: any, index: number) => {
      const source = sources[index] ?? ''
      return (hasAdvancedZones(source) && missingAdvancedZoneResult(result))
        || (hasExplicitViewZone(source) && missingViewZoneResult(result))
    })) {
      return null
    }
    return parsedResults
  }
  return null
}

function hasAdvancedZones(src: string): boolean {
  return /^\s*-\s+(meta|schema|server|tokens)\b/m.test(src)
}

function hasExplicitViewZone(src: string): boolean {
  return /^-\s+view\b/m.test(src)
}

function missingAdvancedZoneResult(result: any): boolean {
  if (!result || typeof result !== 'object') return true
  return result.meta === undefined && result.schema === undefined && result.server === undefined && result.tokens === undefined
}

function missingViewZoneResult(result: any): boolean {
  return !result || typeof result !== 'object' || !Array.isArray(result.markup)
}
