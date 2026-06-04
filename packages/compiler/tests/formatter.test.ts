import { describe, it, expect } from 'vitest'
import { formatLoom } from '../src/printer.js'

describe('Loom Formatter Round-trip', () => {
  it('should preserve comments inside elements', () => {
    const source = `- view
div
  // This is a comment
  span Hello
`
    const formatted = formatLoom(source)
    expect(formatted).toContain('// This is a comment')
  })

  it('should not inline elements with comment children', () => {
    const source = `- view
div
  // comment
`
    const formatted = formatLoom(source)
    expect(formatted).toContain('// comment')
  })

  it('should preserve top-level comments', () => {
    const source = `- view
// top level
div
`
    const formatted = formatLoom(source)
    expect(formatted).toContain('// top level')
  })
})
