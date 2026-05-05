import path from 'node:path'
import { compile } from '@loom-lang/compiler'

export type LoomRspackTarget = 'react' | 'vue' | 'svelte'

export type LoomRspackPluginOptions = {
  target?: LoomRspackTarget
}

type RspackCompiler = {
  options?: {
    module?: {
      rules?: unknown[]
    }
  }
}

export class LoomRspackPlugin {
  readonly name = 'LoomRspackPlugin'

  constructor(private readonly options: LoomRspackPluginOptions = {}) {}

  apply(compiler: RspackCompiler): void {
    compiler.options ??= {}
    compiler.options.module ??= {}
    compiler.options.module.rules ??= []
    compiler.options.module.rules.push(createRspackRule(this.options))
  }
}

export default LoomRspackPlugin

export function createRspackRule(options: LoomRspackPluginOptions = {}) {
  return {
    test: /\.loom$/,
    use: [{
      loader: '@loom-lang/rspack-plugin/loader',
      options,
    }],
  }
}

export function compileForRspack(source: string, sourceFile: string, options: LoomRspackPluginOptions = {}) {
  return compile(source, {
    componentName: path.basename(sourceFile, '.loom'),
    target: options.target ?? 'react',
    sourceFile,
  })
}
