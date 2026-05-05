import { describe, it, expect } from 'vitest'
import { tokenize, TK } from '../src/lexer.js'

function types(src: string) {
  return tokenize(src).tokens.map(t => t.type)
}

function tokens(src: string) {
  return tokenize(src).tokens
}

describe('lexer', () => {
  it('emits CONTEXT_SWITCH for zone markers', () => {
    const toks = tokens('- pug\n- ts\n- props\n- generics\n- js')
    const switches = toks.filter(t => t.type === TK.CONTEXT_SWITCH)
    expect(switches.map(t => t.value)).toEqual(['pug', 'ts', 'props', 'generics', 'js'])
  })

  it('emits TAG for lowercase tags', () => {
    const toks = tokens('- pug\ndiv')
    expect(toks.some(t => t.type === TK.TAG && t.value === 'div')).toBe(true)
  })

  it('emits COMPONENT for PascalCase', () => {
    const toks = tokens('- pug\nUserCard')
    expect(toks.some(t => t.type === TK.COMPONENT && t.value === 'UserCard')).toBe(true)
  })

  it('emits COMPONENT for PascalCase selectors with classes', () => {
    const toks = tokens('- pug\nLayout.shell')
    expect(toks.some(t => t.type === TK.COMPONENT && t.value === 'Layout.shell')).toBe(true)
  })

  it('emits DIMENSION_DATA for standalone ":"', () => {
    const src = '- pug\ndiv\n  :'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.DIMENSION_DATA)).toBe(true)
  })

  it('emits DIMENSION_STYLE for standalone "::"', () => {
    const src = '- pug\ndiv\n  ::'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.DIMENSION_STYLE)).toBe(true)
  })

  it('emits DIMENSION_BEHAVIOR for "@click"', () => {
    const src = '- pug\nbutton\n  @click'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.DIMENSION_BEHAVIOR && t.value === '@click')).toBe(true)
  })

  it('emits CONTROL_IF/ELSEIF/ELSE', () => {
    const src = '- pug\nif x\n  p a\nelse if y\n  p b\nelse\n  p c'
    const tks = types(src)
    expect(tks).toContain(TK.CONTROL_IF)
    expect(tks).toContain(TK.CONTROL_ELSEIF)
    expect(tks).toContain(TK.CONTROL_ELSE)
  })

  it('emits CONTROL_EACH', () => {
    const src = '- pug\neach item in items\n  p x'
    expect(types(src)).toContain(TK.CONTROL_EACH)
  })

  it('emits SLOT token', () => {
    const toks = tokens('- pug\nslot:nav')
    expect(toks.some(t => t.type === TK.SLOT && t.value === 'slot:nav')).toBe(true)
  })

  it('emits INDENT/DEDENT pairs', () => {
    const src = '- pug\ndiv\n  span\np'
    const tks = types(src)
    expect(tks).toContain(TK.INDENT)
    expect(tks).toContain(TK.DEDENT)
  })

  it('captures RAW_LINE in ts zone', () => {
    const src = '- ts\nconst x = 1'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.RAW_LINE && t.value.includes('const x = 1'))).toBe(true)
  })

  it('emits COMMENT for "//" lines', () => {
    const src = '- pug\n// this is a comment'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.COMMENT && t.value === 'this is a comment')).toBe(true)
  })

  it('handles "element" keyword as TAG', () => {
    const src = '- pug\nelement'
    const toks = tokens(src)
    expect(toks.some(t => t.type === TK.TAG && t.value === 'element')).toBe(true)
  })
})
