import path from 'node:path'
import { compile } from '@loom-lang/compiler'
import type { CompileResult } from '@loom-lang/compiler'

export type LoomRollupTarget = 'react' | 'vue' | 'svelte'

export type LoomRollupPluginOptions = {
  target?: LoomRollupTarget
}

type TransformResult = {
  code: string
  map?: unknown
}

type RollupPlugin = {
  name: string
  transform(code: string, id: string): TransformResult | null
}

export function loom(options: LoomRollupPluginOptions = {}): RollupPlugin {
  const target = options.target ?? 'react'

  return {
    name: 'rollup-plugin-loom',
    transform(source, id) {
      if (!stripQuery(id).endsWith('.loom')) return null
      const result = compileForRollup(source, id, target)
      return {
        code: result.code,
        map: result.map ?? null,
      }
    },
  }
}

export default loom

export function compileForRollup(source: string, id: string, target: LoomRollupTarget): CompileResult {
  const sourceFile = stripQuery(id)
  return compile(source, {
    componentName: path.basename(sourceFile, '.loom'),
    target,
    sourceFile,
  })
}

function stripQuery(id: string): string {
  const index = id.indexOf('?')
  return index === -1 ? id : id.slice(0, index)
}
