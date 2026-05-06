export { formatLoom, printLoom } from './printer.js'
export { getFoldRanges } from './folds.js'
export type { FoldRange } from './folds.js'
export { parse, ParseError } from './parser.js'
export { tokenize } from './lexer.js'
export type { LexerResult, Token } from './lexer.js'
export type { TK } from './lexer.js'
export type * from './ast.js'
export { extractLoomStructure } from './blocks.js'
export type { LoomStructure, LoomTopLevelBlock, LoomTopLevelBlockKind, LoomMarkupNodeRef } from './blocks.js'
export type { CompileResult, CodegenTarget, TargetGenerateOptions } from './codegen/target.js'
export { warnReactBehavior, warnMissingLoopKey } from './codegen/warnings.js'
export { formatDiagnostic, hasErrors, validate } from './validate.js'
export type { CompilerDiagnostic, DiagnosticSeverity, DiagnosticSource, ValidateOptions } from './validate.js'
export {
  createDiagnosticOverlay,
  formatDiagnosticForOverlay,
  normalizeDiagnostic,
  renderDiagnosticOverlayText,
} from './overlay.js'
export type { DiagnosticOverlayPayload, NormalizedDiagnostic } from './overlay.js'
export { createIncrementalCache, IncrementalCache } from './incremental-cache.js'
export type {
  IncrementalCacheStats,
  IncrementalCompileResult,
  ZoneCacheEntry,
} from './incremental-cache.js'
export { indexWorkspace } from './workspace-index.js'
export type {
  WorkspaceComponentContract,
  WorkspaceIndex,
  WorkspacePackage,
} from './workspace-index.js'

import { parse, ParseError } from './parser.js'
import { ReactTarget } from './codegen/react.js'
import { VueTarget } from './codegen/vue.js'
import { SvelteTarget } from './codegen/svelte.js'
import type { CompileResult } from './codegen/target.js'
import type { LoomFile } from './ast.js'
import { hasErrors, validate, type CompilerDiagnostic, type ValidateOptions } from './validate.js'
import { formatLoom } from './printer.js'
import {
  applyDirectiveTransforms,
  finalizeAdvancedResult,
  type AdvancedCompileOptions,
} from './advanced.js'
export type {
  AdvancedCompileOptions,
  AssetMetadata,
  CssAsset,
  DirectiveContext,
  DirectivePlugin,
  I18nKeyManifest,
  SchemaAdapter,
} from './advanced.js'
export type CompileOptions = {
  /** Name of the component (used for CSS class hashing and function name) */
  componentName: string
  /** Target framework */
  target: 'react' | 'vue' | 'svelte'
  /** Optional CSS import override used by bundler integrations. */
  cssImportPath?: string
  /**
   * Original source file path. When provided, the compiler will include a
   * source map in the result.
   */
  sourceFile?: string
  /**
   * Emit SSR-compatible output (React `'use server'`, Vue no style injection,
   * Svelte `<script context="module">`).
   */
  ssr?: boolean
  /** Optional utility-first CSS generation mode. */
  atomicCss?: boolean
  /** Enable strict accessibility diagnostics. */
  strictA11y?: boolean
  /** Enable unsafe HTML, URL, event, and expression scanning. */
  security?: boolean
  /** Warn when generated target output exceeds this many bytes. */
  bundleBudgetBytes?: number
} & AdvancedCompileOptions

export type AnalyzeOptions = ValidateOptions

export type AnalyzeResult = {
  file?: LoomFile
  diagnostics: CompilerDiagnostic[]
}

export class CompileError extends Error {
  constructor(public readonly diagnostics: CompilerDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'))
  }
}

export function analyze(src: string, options: AnalyzeOptions = {}): AnalyzeResult {
  try {
    const file = parse(src)
    const diagnostics = validate(file, options)
    return { file, diagnostics }
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        diagnostics: [{
          code: 'loom/parse',
          severity: 'error',
          message: error.message,
          span: error.span,
          source: 'parser',
          suggestion: 'Fix the syntax at this source span and rerun compilation.',
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
  validateCompileOptions(options)

  const { file, diagnostics } = analyze(src, {
    strictA11y: options.strictA11y,
    security: options.security,
  })

  if (!file || hasErrors(diagnostics)) {
    throw new CompileError(diagnostics)
  }

  const transformedFile = applyDirectiveTransforms(file, options)

  const genOptions = {
    cssImportPath: options.cssImportPath,
    sourceFile: options.sourceFile,
    sourceContent: src,
    ssr: options.ssr,
    atomicCss: options.atomicCss,
  }

  let result: CompileResult
  switch (options.target) {
    case 'react':
      result = new ReactTarget().generate(transformedFile, options.componentName, genOptions)
      break
    case 'vue':
      result = new VueTarget().generate(transformedFile, options.componentName, genOptions)
      break
    case 'svelte':
      result = new SvelteTarget().generate(transformedFile, options.componentName, genOptions)
      break
    default: {
      const _exhaustive: never = options.target
      throw new Error(`Unknown target: ${options.target}`)
    }
  }

  if (options.bundleBudgetBytes !== undefined) {
    const size = Buffer.byteLength(result.code + (result.css ?? ''), 'utf8')
    if (size > options.bundleBudgetBytes) {
      result = {
        ...result,
        warnings: [
          ...(result.warnings ?? []),
          {
            code: 'loom/bundle-budget',
            severity: 'warning',
            message: `Generated ${options.target} output is ${size} bytes, exceeding budget ${options.bundleBudgetBytes} bytes.`,
            span: transformedFile.span ?? {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 },
            },
            source: 'codegen',
            suggestion: 'Split this component or move repeated static content into children.',
          },
        ],
      }
    }
  }

  return finalizeAdvancedResult(result, transformedFile, options)
}

function validateCompileOptions(options: CompileOptions): void {
  if (!/^[A-Za-z_$][\w$]*$/.test(options.componentName)) {
    throw new Error(`Invalid componentName "${options.componentName}". Component names must be valid JavaScript identifiers.`)
  }

  if (options.target !== 'react' && options.target !== 'vue' && options.target !== 'svelte') {
    throw new Error(`Unknown target: ${String(options.target)}`)
  }
}
