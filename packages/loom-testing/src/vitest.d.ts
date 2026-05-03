import 'vitest'
import type { LoomMatcherOptions } from './index.js'

declare module 'vitest' {
  interface Assertion<T = any> {
    toCompileAcrossTargets(options?: LoomMatcherOptions): T
  }

  interface AsymmetricMatchersContaining {
    toCompileAcrossTargets(options?: LoomMatcherOptions): void
  }
}

export {}
