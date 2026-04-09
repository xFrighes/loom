import { describe, expect, it } from 'vitest'
import { analyze, formatDiagnostic, validate } from '../src/index.js'
import { parse } from '../src/parser.js'

describe('validation', () => {
  it('reports duplicate attributes', () => {
    const file = parse('- pug\ninput\n  :\n    type email\n    type text')
    const diagnostics = validate(file)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/duplicate-attr' }),
    ]))
  })

  it('reports standalone else/else if placement errors', () => {
    const { diagnostics } = analyze('- pug\nelse\n  p Nope\nelse if x\n  p Nope')
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/control-flow-placement')
  })

  it('reports slot misuse outside component-like parents', () => {
    const { diagnostics } = analyze('- pug\ndiv\n  slot:nav\n    p Title')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/slot-use' }),
    ]))
  })

  it('reports unsupported and incompatible modifiers', () => {
    const { diagnostics } = analyze('- pug\nbutton\n  @click.prevent.passive.enter.escape.foo\n    submit()')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/unsupported-modifier' }),
      expect.objectContaining({ code: 'loom/incompatible-modifiers' }),
    ]))
  })

  it('reports malformed props and returns multiple diagnostics', () => {
    const file = parse('- props\n  : string\n  invalid-name:\n- pug\ndiv')
    const diagnostics = validate(file)
    expect(diagnostics.length).toBeGreaterThanOrEqual(2)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/prop-name' }),
      expect.objectContaining({ code: 'loom/prop-type' }),
    ]))
  })

  it('formats diagnostics with source coordinates', () => {
    const { diagnostics } = analyze('- pug\nelse\n  p Nope')
    expect(formatDiagnostic(diagnostics[0]!)).toContain('loom/control-flow-placement')
    expect(formatDiagnostic(diagnostics[0]!)).toContain('2:1')
  })
})
