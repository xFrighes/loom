import { compileForRspack, type LoomRspackPluginOptions } from './index.js'

type LoaderContext = {
  resourcePath: string
  getOptions?(): LoomRspackPluginOptions
  async?(): ((error: Error | null, code?: string, map?: unknown) => void) | undefined
}

export default function loomRspackLoader(this: LoaderContext, source: string): string | undefined {
  const callback = this.async?.()

  try {
    const result = compileForRspack(source, this.resourcePath, this.getOptions?.() ?? {})
    if (callback) {
      callback(null, result.code, result.map ?? undefined)
      return undefined
    }
    return result.code
  } catch (error) {
    if (callback) {
      callback(error instanceof Error ? error : new Error(String(error)))
      return undefined
    }
    throw error
  }
}
