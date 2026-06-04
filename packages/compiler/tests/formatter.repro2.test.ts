import { describe, it, expect } from 'vitest'
import { formatLoom } from '../src/printer.js'

describe('Loom Formatter Round-trip', () => {
  it('should not merge comments with text when inlining', () => {
    const source = `- view
div
  // comment
  text
`
    const formatted = formatLoom(source)
    expect(formatted).toContain('// comment')
    expect(formatted).toContain('text')
    // It should NOT be "div text" and it should not have dropped the comment.
  })
})
