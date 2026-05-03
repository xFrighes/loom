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
  const result = wasmModule.wasm_parse(src)
  if (result && result.error) {
    throw new Error(result.error)
  }
  return result
}

export function tryWasmTokenize(src: string): any {
  if (!wasmLoaded) return null
  return wasmModule.wasm_tokenize(src)
}
