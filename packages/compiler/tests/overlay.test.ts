import { describe, expect, it } from 'vitest'
import {
  analyze,
  createDiagnosticOverlay,
  renderDiagnosticOverlayText,
} from '../src/index.js'

describe('diagnostic overlay payloads', () => {
  it('normalizes parser and validator diagnostics for shared overlays', () => {
    const parsed = analyze('- pug\nelse\n  div Nope')
    const overlay = createDiagnosticOverlay(parsed.diagnostics, {
      sourceFile: 'App.loom',
    })

    expect(overlay.diagnostics[0]).toMatchObject({
      code: 'loom/control-flow-placement',
      source: 'validator',
      sourceFile: 'App.loom',
      suggestion: expect.any(String),
    })
    expect(renderDiagnosticOverlayText(overlay)).toContain('fix:')
  })

  it('labels parser diagnostics with parser source', () => {
    const overlay = createDiagnosticOverlay([{
      code: 'loom/parse',
      severity: 'error',
      message: 'Expected zone',
      span: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    }])

    expect(overlay.diagnostics[0]?.source).toBe('parser')
  })
})
