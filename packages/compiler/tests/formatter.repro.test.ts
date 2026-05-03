import { describe, it, expect } from 'vitest'
import { formatLoom } from '../src/printer.js'

describe('Loom Formatter Round-trip', () => {
  it('should preserve inline comments after tags', () => {
    const source = `- pug
div // this should be a comment
`
    const formatted = formatLoom(source)
    expect(formatted).toContain('// this should be a comment')
  })
})
