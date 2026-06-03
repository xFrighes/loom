import path from 'node:path'
import { compile } from '@loom-ui/compiler'
import type { AdvancedCompileOptions } from '@loom-ui/compiler'

export type LoomWebpackTarget = 'react' | 'vue' | 'svelte'

export type LoomWebpackLoaderOptions = AdvancedCompileOptions & {
  target?: LoomWebpackTarget
}

type LoaderContext = {
  resourcePath: string
  getOptions?(): LoomWebpackLoaderOptions
  async?(): ((error: Error | null, code?: string, map?: unknown) => void) | undefined
}

export default function loomWebpackLoader(this: LoaderContext, source: string): string | undefined {
  const callback = this.async?.()

  try {
    const result = compileForWebpack(source, this.resourcePath, this.getOptions?.() ?? {})
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

export function compileForWebpack(source: string, sourceFile: string, options: LoomWebpackLoaderOptions = {}) {
  return compile(source, {
    ...options,
    componentName: path.basename(sourceFile, '.loom'),
    target: options.target ?? 'react',
    sourceFile,
  })
}
