import type { LoomFile } from '../ast.js'

export interface CompileResult {
  /** Framework-specific source code (.tsx / .vue / .svelte) */
  code: string
  /** Extracted CSS Modules content (empty string if no styles) */
  css: string
  /** Source map JSON string (optional) */
  map?: string
}

export interface TargetGenerateOptions {
  /** Override the emitted CSS import path for targets that need external CSS. */
  cssImportPath?: string
}

export interface CodegenTarget {
  generate(file: LoomFile, componentName: string, options?: TargetGenerateOptions): CompileResult
}
