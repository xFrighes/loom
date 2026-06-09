import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { compile } from '@loom-kit/compiler'
import type { AdvancedCompileOptions, CompileResult } from '@loom-kit/compiler'

export type LoomEsbuildTarget = 'react' | 'vue' | 'svelte'

export type LoomEsbuildPluginOptions = AdvancedCompileOptions & {
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
        const result = compileForEsbuild(source, args.path, target, options)
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

export function compileForEsbuild(source: string, sourceFile: string, target: LoomEsbuildTarget, options: AdvancedCompileOptions = {}): CompileResult {
  return compile(source, {
    ...options,
    componentName: path.basename(sourceFile, '.loom'),
    target,
    sourceFile,
  })
}
