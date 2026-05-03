import { describe, expect, it } from 'vitest'
import { extractLoomStructure, parse, printLoom } from '../src/index.js'

describe('printer and block extraction', () => {
  const source = [
    '- generics',
    '  T',
    '',
    '- props',
    '  title: string',
    '',
    '- ts',
    "  import { ref } from 'vue'",
    '  const count = ref(0)',
    '',
    '- pug',
    '  div.card',
    '    span Hello',
  ].join('\n')

  it('prints a canonical loom file', () => {
    const printed = printLoom(parse(source))
    expect(printed).toContain('- generics')
    expect(printed).toContain('- props')
    expect(printed).toContain('- ts')
    expect(printed).toContain('- pug')
    expect(printed.endsWith('\n')).toBe(true)
  })

  it('extracts stable top-level blocks and markup node ids', () => {
    const structure = extractLoomStructure(source)
    expect(structure.blocks.map((block) => block.id)).toEqual([
      'generics:0',
      'props:0',
      'logic:0',
      'markup:0',
    ])
    expect(structure.blocks.find((block) => block.id === 'logic:0')?.summary).toContain(
      'importing vue',
    )
    expect(structure.markupNodes.map((node) => node.id)).toEqual([
      'markup:0/div:0',
      'markup:0/div:0/span:0',
      'markup:0/div:0/span:0/text:0',
    ])
  })

  it('preserves comments when printing inline-capable elements', () => {
    const printed = printLoom(parse('- pug\n  p\n    // important\n    Hello'))
    expect(printed).toContain('// important')
    expect(printed).toContain('Hello')
  })
})
