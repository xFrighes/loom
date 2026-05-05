import type { LoomFile } from '../ast.js'
import type { CompilerDiagnostic } from '../validate.js'

export interface CompileResult {
  /** Framework-specific source code (.tsx / .vue / .svelte) */
  code: string
  /** Extracted CSS Modules content (empty string if no styles) */
  css: string
  /** Source map JSON string (optional) */
  map?: string
  /**
   * Target-specific warnings for features where Loom cannot guarantee
   * equivalent behaviour across frameworks.
   */
  warnings?: CompilerDiagnostic[]
}

export interface TargetGenerateOptions {
  /** Override the emitted CSS import path for targets that need external CSS. */
  cssImportPath?: string
  /**
   * Original source file path (relative or absolute). When provided, the
   * codegen target will produce a `map` field in the result.
   */
  sourceFile?: string
  /** Original source content, embedded in the source map's `sourcesContent`. */
  sourceContent?: string
  /**
   * Emit SSR-compatible output.
   * - React: prepends `'use server'` directive; avoids client-only hook imports.
   * - Vue: omits CSS Modules injection (SSR cannot inject style tags).
   * - Svelte: wraps module context in `<script context="module">` for SvelteKit.
   */
  ssr?: boolean
  /** Emit one deterministic utility class per style declaration. */
  atomicCss?: boolean
}

export interface CodegenTarget {
  generate(file: LoomFile, componentName: string, options?: TargetGenerateOptions): CompileResult
}
