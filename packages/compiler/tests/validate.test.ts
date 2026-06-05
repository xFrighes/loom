import { describe, expect, it } from 'vitest'
import { analyze, formatDiagnostic, validate } from '../src/index.js'
import { parse } from '../src/parser.js'

describe('validation', () => {
  it('reports duplicate attributes', () => {
    const file = parse('- view\ninput\n  :\n    type email\n    type text')
    const diagnostics = validate(file)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/duplicate-attr' }),
    ]))
  })

  it('reports standalone else/else if placement errors', () => {
    const { diagnostics } = analyze('- view\nelse\n  p Nope\nelse if x\n  p Nope')
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/control-flow-placement')
  })

  it('reports slot misuse outside component-like parents', () => {
    const { diagnostics } = analyze('- view\ndiv\n  slot:nav\n    p Title')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/slot-use' }),
    ]))
  })

  it('reports unsupported and incompatible modifiers', () => {
    const { diagnostics } = analyze('- view\nbutton\n  @click.prevent.passive.enter.escape.foo\n    submit()')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/unsupported-modifier' }),
      expect.objectContaining({ code: 'loom/incompatible-modifiers' }),
    ]))
  })

  it('reports malformed props and returns multiple diagnostics', () => {
    const { diagnostics } = analyze('- props\n  : string\n  invalid-name:\n- view\ndiv')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/prop-syntax' }),
    ]))
  })

  it('reports malformed state declarations before codegen', () => {
    const { diagnostics } = analyze('- state\n  : number = 0\n  total-count:\n- view\ndiv')

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/state-syntax' }),
    ]))
  })

  it('reports malformed computed declarations before codegen', () => {
    const { diagnostics } = analyze('- computed\n  : count + 1\n  total-count = \n- view\ndiv')

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/computed-syntax' }),
    ]))
  })

  it('formats diagnostics with source coordinates', () => {
    const { diagnostics } = analyze('- view\nelse\n  p Nope')
    expect(formatDiagnostic(diagnostics[0]!)).toContain('loom/control-flow-placement')
    expect(formatDiagnostic(diagnostics[0]!)).toContain('2:1')
  })

  it('reports child markup under void elements', () => {
    const file = parse('- view\ninput\n  button Submit')
    const diagnostics = validate(file)

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/void-element-children' }),
    ]))
  })

  it('allows void elements followed by correctly indented siblings', () => {
    const file = parse('- view\ninput\nbutton Submit')
    const diagnostics = validate(file)

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('loom/void-element-children')
  })

  it('warns about non-standard markup indentation style', () => {
    const { diagnostics } = analyze('- view\ndiv\n   button Submit')

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/indentation-style', severity: 'warning' }),
    ]))
  })

  it('warns about non-portable state member mutations', () => {
    const { diagnostics } = analyze(`- state
  items: string[] = []

- view
button
  @click
    items.push('x')
`)

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/reactivity-mutation', severity: 'warning' }),
    ]))
  })
})
