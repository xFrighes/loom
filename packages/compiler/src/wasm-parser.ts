import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let wasmLoaded = false
let wasmModule: any = null

export async function ensureWasmLoaded(): Promise<void> {
  if (wasmLoaded) return
  wasmModule = require('@loom-lang/loom_core/wasm')
  await wasmModule.default?.()
  wasmLoaded = true
}

export function tryWasmParse(src: string): any {
  if (!wasmLoaded) {
    // In a real implementation, we might want to throw or return null
    // depending on whether we want to wait for WASM or fallback to TS.
    return null
  }
  if (typeof wasmModule.wasm_parse_json === 'function') {
    const result = JSON.parse(wasmModule.wasm_parse_json(src))
    if (result && result.error) {
      throw new Error(result.error)
    }
    if (/^\s*-\s+(meta|schema|server|tokens)\b/m.test(src) && missingAdvancedZoneResult(result)) return null
    return result
  }
  const result = wasmModule.wasm_parse(src)
  if (result && result.error) {
    throw new Error(result.error)
  }
  if (/^\s*-\s+(meta|schema|server|tokens)\b/m.test(src) && missingAdvancedZoneResult(result)) return null
  return result
}

export function tryWasmTokenize(src: string): any {
  if (!wasmLoaded) return null
  if (typeof wasmModule.wasm_tokenize_json === 'function') {
    return JSON.parse(wasmModule.wasm_tokenize_json(src))
  }
  return wasmModule.wasm_tokenize(src)
}

function missingAdvancedZoneResult(result: any): boolean {
  if (!result || typeof result !== 'object') return true
  return result.meta === undefined && result.schema === undefined && result.server === undefined && result.tokens === undefined
}
