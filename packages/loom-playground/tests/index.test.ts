import { describe, expect, it } from 'vitest'
import { compilePlayground, defaultPlaygroundSource } from '../src/index.js'

describe('@loom-lang/playground', () => {
  it('compiles the default source', () => {
    const result = compilePlayground({ source: defaultPlaygroundSource, target: 'react' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.output.code).toContain('PlaygroundComponent')
    }
  })

  it('returns diagnostics for invalid source', () => {
    const result = compilePlayground({ source: '- pug\ndiv\n  :\n    id first\n    id second', target: 'react' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('loom/')
    }
  })
})
