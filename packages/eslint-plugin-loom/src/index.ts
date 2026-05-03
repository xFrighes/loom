import { analyze, type CompilerDiagnostic, type SourceSpan } from '@loom-lang/compiler'

type LoomLintMessage = {
  ruleId: string
  severity: 1 | 2
  message: string
  line: number
  column: number
  endLine: number
  endColumn: number
}

type LoomProcessor = {
  meta: {
    name: string
    version: string
  }
  preprocess(text: string, filename: string): string[]
  postprocess(messages: LoomLintMessage[][], filename: string): LoomLintMessage[]
  supportsAutofix: boolean
}

const diagnosticsCache = new Map<string, CompilerDiagnostic[]>()
const PLACEHOLDER_MODULE = 'export {};\n'

export function toLintMessage(diagnostic: CompilerDiagnostic): LoomLintMessage {
  return {
    ruleId: diagnostic.code,
    severity: diagnostic.severity === 'error' ? 2 : 1,
    message: diagnostic.message,
    line: diagnostic.span.start.line,
    column: diagnostic.span.start.column,
    endLine: diagnostic.span.end.line,
    endColumn: Math.max(diagnostic.span.end.column, diagnostic.span.start.column),
  }
}

export const loomProcessor: LoomProcessor = {
  meta: {
    name: 'loom-processor',
    version: '0.1.0',
  },
  preprocess(text, filename) {
    diagnosticsCache.set(filename, analyzeSafely(text).diagnostics)
    return [PLACEHOLDER_MODULE]
  },
  postprocess(_messages, filename) {
    const diagnostics = diagnosticsCache.get(filename) ?? []
    diagnosticsCache.delete(filename)
    return diagnostics.map(toLintMessage)
  },
  supportsAutofix: false,
}

function analyzeSafely(text: string): { diagnostics: CompilerDiagnostic[] } {
  try {
    return analyze(text)
  } catch (error) {
    const span = getErrorSpan(error) ?? fallbackSpan()
    return {
      diagnostics: [{
        code: 'loom/parse',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        span,
      }],
    }
  }
}

function getErrorSpan(error: unknown): SourceSpan | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'span' in error &&
    isSourceSpan((error as { span?: unknown }).span)
  ) {
    return (error as { span: SourceSpan }).span
  }
  return undefined
}

function isSourceSpan(value: unknown): value is SourceSpan {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'start' in value &&
      'end' in value,
  )
}

function fallbackSpan(): SourceSpan {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
}

const plugin: {
  meta: {
    name: string
    version: string
  }
  processors: Record<string, LoomProcessor>
  configs: {
    recommended?: {
      files: string[]
      plugins: Record<string, unknown>
      processor: string
      languageOptions: {
        ecmaVersion: 'latest'
        sourceType: 'module'
      }
    }[]
  }
} = {
  meta: {
    name: 'eslint-plugin-loom',
    version: '0.1.0',
  },
  processors: {
    loom: loomProcessor,
  },
  configs: {},
}

plugin.configs.recommended = [
  {
    files: ['**/*.loom'],
    plugins: { loom: plugin },
    processor: 'loom/loom',
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
]

export default plugin
