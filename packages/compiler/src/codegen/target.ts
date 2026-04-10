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
}

export interface CodegenTarget {
  generate(file: LoomFile, componentName: string, options?: TargetGenerateOptions): CompileResult
}
