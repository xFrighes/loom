import { compile, type CompileResult } from '@loom-lang/compiler'

export type LoomCompileTarget = 'react' | 'vue' | 'svelte'

export type LoomTestCompileOptions = {
  componentName?: string
  sourceFile?: string
}

export type LoomTargetList = readonly LoomCompileTarget[]

export type LoomCompiledTargets = Record<LoomCompileTarget, CompileResult>

const DEFAULT_TARGETS: LoomTargetList = ['react', 'vue', 'svelte']

export function compileFixture(
  source: string,
  target: LoomCompileTarget,
  options: LoomTestCompileOptions = {},
): CompileResult {
  return compile(source, {
    componentName: options.componentName ?? 'TestComponent',
    target,
    sourceFile: options.sourceFile,
  })
}

export function compileForTargets(
  source: string,
  targets: LoomTargetList = DEFAULT_TARGETS,
  options: LoomTestCompileOptions = {},
): LoomCompiledTargets {
  const compiled = {} as LoomCompiledTargets
  for (const target of targets) {
    compiled[target] = compileFixture(source, target, options)
  }
  return compiled
}

export function assertCompiles(
  source: string,
  targets: LoomTargetList = DEFAULT_TARGETS,
  options: LoomTestCompileOptions = {},
): LoomCompiledTargets {
  return compileForTargets(source, targets, options)
}

export type LoomMatcherOptions = LoomTestCompileOptions & {
  targets?: LoomTargetList
}

export const loomMatchers = {
  toCompileAcrossTargets(received: string, options: LoomMatcherOptions = {}) {
    try {
      compileForTargets(received, options.targets ?? DEFAULT_TARGETS, options)
      return {
        pass: true,
        message: () => 'Expected Loom source not to compile across the requested targets.',
      }
    } catch (error) {
      return {
        pass: false,
        message: () =>
          error instanceof Error
            ? error.message
            : `Failed to compile Loom source: ${String(error)}`,
      }
    }
  },
}

declare module 'vitest' {
  interface Assertion<T = any> {
    toCompileAcrossTargets(options?: LoomMatcherOptions): T
  }

  interface AsymmetricMatchersContaining {
    toCompileAcrossTargets(options?: LoomMatcherOptions): void
  }
}
