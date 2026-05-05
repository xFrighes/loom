import { analyze, compile, formatDiagnostic } from '@loom-lang/compiler'
import type { CompileOptions, CompilerDiagnostic, CompileResult } from '@loom-lang/compiler'

export type PlaygroundTarget = CompileOptions['target']

export type PlaygroundInput = {
  source: string
  target: PlaygroundTarget
  componentName?: string
}

export type PlaygroundResult = {
  ok: true
  output: CompileResult
  diagnostics: CompilerDiagnostic[]
} | {
  ok: false
  diagnostics: CompilerDiagnostic[]
  message: string
}

export function compilePlayground(input: PlaygroundInput): PlaygroundResult {
  const analysis = analyze(input.source)
  if (!analysis.file || analysis.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      ok: false,
      diagnostics: analysis.diagnostics,
      message: analysis.diagnostics.map(formatDiagnostic).join('\n'),
    }
  }

  return {
    ok: true,
    diagnostics: analysis.diagnostics,
    output: compile(input.source, {
      componentName: input.componentName ?? 'PlaygroundComponent',
      target: input.target,
      sourceFile: 'playground.loom',
    }),
  }
}

export const defaultPlaygroundSource = `- props
  title: string = "Loom"

- pug
section.card
  h1 {title}
  p Edit this component and switch targets.
`
