export { formatLoom } from './formatter.js'
export { getFoldRanges } from './folds.js'
export type { FoldRange } from './folds.js'
export { parse, ParseError } from './parser.js'
export { tokenize } from './lexer.js'
export type { LexerResult, Token } from './lexer.js'
export type { TK } from './lexer.js'
export type * from './ast.js'
export type { CompileResult, CodegenTarget, TargetGenerateOptions } from './codegen/target.js'
export { formatDiagnostic, hasErrors, validate } from './validate.js'
export type { CompilerDiagnostic, DiagnosticSeverity } from './validate.js'

import { parse, ParseError } from './parser.js'
import { ReactTarget } from './codegen/react.js'
import { VueTarget } from './codegen/vue.js'
import { SvelteTarget } from './codegen/svelte.js'
import type { CompileResult } from './codegen/target.js'
import type { LoomFile } from './ast.js'
import { hasErrors, validate, type CompilerDiagnostic } from './validate.js'

export type CompileOptions = {
  /** Name of the component (used for CSS class hashing and function name) */
  componentName: string
  /** Target framework */
  target: 'react' | 'vue' | 'svelte'
  /** Optional CSS import override used by bundler integrations. */
  cssImportPath?: string
}

export type AnalyzeResult = {
  file?: LoomFile
  diagnostics: CompilerDiagnostic[]
}

export class CompileError extends Error {
  constructor(public readonly diagnostics: CompilerDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'))
  }
}

export function analyze(src: string): AnalyzeResult {
  try {
    const file = parse(src)
    const diagnostics = validate(file)
    return { file, diagnostics }
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        diagnostics: [{
          code: 'loom/parse',
          severity: 'error',
          message: error.message,
          span: error.span,
        }],
      }
    }
    throw error
  }
}

/**
 * Compile a .loom source string to the target framework's output.
 *
 * @example
 * const { code, css } = compile(src, { componentName: 'Button', target: 'react' })
 */
export function compile(src: string, options: CompileOptions): CompileResult {
  const { file, diagnostics } = analyze(src)

  if (!file || hasErrors(diagnostics)) {
    throw new CompileError(diagnostics)
  }

  switch (options.target) {
    case 'react':
      return new ReactTarget().generate(file, options.componentName, { cssImportPath: options.cssImportPath })
    case 'vue':
      return new VueTarget().generate(file, options.componentName)
    case 'svelte':
      return new SvelteTarget().generate(file, options.componentName)
    default: {
      const _exhaustive: never = options.target
      throw new Error(`Unknown target: ${options.target}`)
    }
  }
}
