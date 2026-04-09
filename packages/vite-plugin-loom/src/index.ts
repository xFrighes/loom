import path from 'node:path'
import { readFileSync } from 'node:fs'
import { compile } from '@loom-lang/compiler'
import type { CompileResult } from '@loom-lang/compiler'
import { transformWithEsbuild } from 'vite'
import type { Plugin, ResolvedConfig } from 'vite'

export type LoomPluginOptions = {
  /**
   * Target framework.
   * If omitted, the plugin auto-detects from other Vite plugins in the config.
   */
  target?: 'react' | 'vue' | 'svelte'
}

export default function loom(options: LoomPluginOptions = {}): Plugin {
  const compileCache = new Map<string, CompileResult>()
  let resolvedTarget: 'react' | 'vue' | 'svelte' = options.target ?? 'react'
  let config: ResolvedConfig

  return {
    name: 'vite-plugin-loom',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
      if (!options.target) {
        resolvedTarget = detectTarget(config)
      }
    },

    async resolveId(source, importer) {
      if (isVirtualLoomId(source)) return source
      if (!source.endsWith('.loom')) return null

      const resolved = await this.resolve(source, importer, { skipSelf: true })
      const sourcePath = stripQuery(resolved?.id ?? source)
      return createEntryId(sourcePath, resolvedTarget)
    },

    async load(id) {
      const virtual = parseVirtualLoomId(id)
      if (!virtual) return null

      const result = loadCompileResult(this, virtual.sourcePath, virtual.target, compileCache)

      if (virtual.kind === 'style') {
        return result.css
      }

      if (virtual.target === 'react') {
        const transformed = await transformWithEsbuild(
          result.code,
          `${virtual.sourcePath}.tsx`,
          { loader: 'tsx', jsx: 'transform' },
        )

        return {
          code: transformed.code,
          map: transformed.map ?? null,
        }
      }

      return {
        code: result.code,
        map: null,
      }
    },
  }
}

/**
 * Detect the target framework by looking for known Vite plugins.
 */
export function detectTarget(config: ResolvedConfig): 'react' | 'vue' | 'svelte' {
  for (const p of config.plugins) {
    const name = (p as Plugin).name ?? ''
    if (name === 'vite:react-babel' || name === 'vite:react-refresh' || name.includes('react')) {
      return 'react'
    }
    if (name.includes('vue')) return 'vue'
    if (name.includes('svelte')) return 'svelte'
  }
  return 'react'
}

type LoomVirtualModule =
  | { kind: 'entry'; sourcePath: string; target: 'react' | 'vue' | 'svelte' }
  | { kind: 'style'; sourcePath: string; target: 'react' }

function loadCompileResult(
  ctx: Pick<PluginContextLike, 'addWatchFile' | 'error'>,
  sourcePath: string,
  target: 'react' | 'vue' | 'svelte',
  cache: Map<string, CompileResult>,
): CompileResult {
  const cacheKey = `${target}:${sourcePath}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  ctx.addWatchFile(sourcePath)
  const src = readFileSync(sourcePath, 'utf8')
  const componentName = path.basename(sourcePath, '.loom')

  try {
    const result = compile(src, {
      componentName,
      target,
      cssImportPath: target === 'react' ? createStyleId(sourcePath) : undefined,
    })
    cache.set(cacheKey, result)
    return result
  } catch (err) {
    ctx.error(err instanceof Error ? err.message : String(err))
  }
}

type PluginContextLike = {
  addWatchFile(file: string): void
  error(message: string): never
}

function stripQuery(id: string): string {
  const queryIndex = id.indexOf('?')
  return queryIndex === -1 ? id : id.slice(0, queryIndex)
}

function isVirtualLoomId(id: string): boolean {
  return parseVirtualLoomId(id) !== null
}

function createEntryId(sourcePath: string, target: 'react' | 'vue' | 'svelte'): string {
  const extension = target === 'react' ? 'js' : target
  return `${virtualModuleStem(sourcePath)}.${extension}?loom-entry=1&loom-target=${target}&loom-source=${encodeURIComponent(sourcePath)}`
}

function createStyleId(sourcePath: string): string {
  return `${virtualModuleStem(sourcePath)}.module.css?loom-style=1&loom-target=react&loom-source=${encodeURIComponent(sourcePath)}`
}

function parseVirtualLoomId(id: string): LoomVirtualModule | null {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1) return null

  const query = id.slice(queryIndex + 1)
  const params = new URLSearchParams(query)
  const sourcePath = params.get('loom-source')
  const target = params.get('loom-target')

  if (!sourcePath || !target) return null
  if (target !== 'react' && target !== 'vue' && target !== 'svelte') return null

  if (params.has('loom-entry')) {
    return { kind: 'entry', sourcePath, target }
  }

  if (params.has('loom-style') && target === 'react') {
    return { kind: 'style', sourcePath, target }
  }

  return null
}

function virtualModuleStem(sourcePath: string): string {
  return sourcePath.endsWith('.loom')
    ? sourcePath.slice(0, -'.loom'.length) + '-loom'
    : sourcePath + '-loom'
}
