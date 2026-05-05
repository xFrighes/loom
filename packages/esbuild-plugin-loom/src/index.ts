import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { compile } from '@loom-lang/compiler'
import type { CompileResult } from '@loom-lang/compiler'

export type LoomEsbuildTarget = 'react' | 'vue' | 'svelte'

export type LoomEsbuildPluginOptions = {
  target?: LoomEsbuildTarget
}

type EsbuildBuild = {
  onLoad(options: { filter: RegExp }, callback: (args: { path: string }) => Promise<{ contents: string; loader: 'js' | 'jsx'; resolveDir: string }>): void
}

type EsbuildPlugin = {
  name: string
  setup(build: EsbuildBuild): void
}

export function loom(options: LoomEsbuildPluginOptions = {}): EsbuildPlugin {
  const target = options.target ?? 'react'

  return {
    name: 'esbuild-plugin-loom',
    setup(build) {
      build.onLoad({ filter: /\.loom$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const result = compileForEsbuild(source, args.path, target)
        return {
          contents: result.code,
          loader: target === 'react' ? 'jsx' : 'js',
          resolveDir: path.dirname(args.path),
        }
      })
    },
  }
}

export default loom

export function compileForEsbuild(source: string, sourceFile: string, target: LoomEsbuildTarget): CompileResult {
  return compile(source, {
    componentName: path.basename(sourceFile, '.loom'),
    target,
    sourceFile,
  })
}
