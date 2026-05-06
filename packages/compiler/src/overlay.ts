import type { SourceSpan } from './ast.js'
import type { CompilerDiagnostic, DiagnosticSource } from './validate.js'

export type NormalizedDiagnostic = {
  code: string
  message: string
  severity: CompilerDiagnostic['severity']
  span: SourceSpan
  suggestion?: string
  source: DiagnosticSource
  sourceFile?: string
}

export type DiagnosticOverlayPayload = {
  title: string
  sourceFile?: string
  diagnostics: NormalizedDiagnostic[]
}

export function normalizeDiagnostic(
  diagnostic: CompilerDiagnostic,
  options: { sourceFile?: string; source?: DiagnosticSource } = {},
): NormalizedDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    span: diagnostic.span,
    suggestion: diagnostic.suggestion,
    source: diagnostic.source ?? options.source ?? inferDiagnosticSource(diagnostic.code),
    sourceFile: options.sourceFile,
  }
}

export function createDiagnosticOverlay(
  diagnostics: CompilerDiagnostic[],
  options: { sourceFile?: string; title?: string; source?: DiagnosticSource } = {},
): DiagnosticOverlayPayload {
  return {
    title: options.title ?? 'Loom compilation failed',
    sourceFile: options.sourceFile,
    diagnostics: diagnostics.map((diagnostic) => normalizeDiagnostic(diagnostic, options)),
  }
}

export function formatDiagnosticForOverlay(diagnostic: NormalizedDiagnostic): string {
  const location = `${diagnostic.span.start.line}:${diagnostic.span.start.column}`
  const file = diagnostic.sourceFile ? `${diagnostic.sourceFile}:` : ''
  const suggestion = diagnostic.suggestion ? `\n  fix: ${diagnostic.suggestion}` : ''
  return `[${diagnostic.source}] ${diagnostic.severity} ${diagnostic.code} ${file}${location}\n  ${diagnostic.message}${suggestion}`
}

export function renderDiagnosticOverlayText(payload: DiagnosticOverlayPayload): string {
  const file = payload.sourceFile ? `\n${payload.sourceFile}` : ''
  return [
    `${payload.title}${file}`,
    ...payload.diagnostics.map(formatDiagnosticForOverlay),
  ].join('\n\n')
}

function inferDiagnosticSource(code: string): DiagnosticSource {
  if (code === 'loom/parse') return 'parser'
  if (code.startsWith('loom/react-') || code.startsWith('loom/missing-')) return 'codegen'
  return 'validator'
}
