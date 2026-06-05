import { describe, it, expect } from 'vitest'
import { parse, parseWithDiagnostics } from '../src/parser.js'

describe('parser – zones', () => {
  it('parses generics zone', () => {
    const file = parse('- generics\n  T extends Record<string, any>')
    expect(file.generics).toBe('T extends Record<string, any>')
  })

  it('parses props zone', () => {
    const file = parse("- props\n  name: string\n  count: number = 0")
    expect(file.props).toHaveLength(2)
    expect(file.props![0]).toMatchObject({ name: 'name', type: 'string' })
    expect(file.props![1]).toMatchObject({ name: 'count', type: 'number', defaultValue: '0' })
  })

  it('parses ts logic zone', () => {
    const file = parse('- ts\n  const x = 1\n  const y = 2')
    expect(file.logic?.lang).toBe('ts')
    expect(file.logic?.src).toContain('const x = 1')
  })

  it('parses js logic zone', () => {
    const file = parse('- js\n  let count = 0')
    expect(file.logic?.lang).toBe('js')
  })
})

describe('parser – elements', () => {
  it('parses a simple tag', () => {
    const file = parse('- view\ndiv')
    expect(file.markup).toHaveLength(1)
    const el = file.markup![0]
    expect(el.kind).toBe('element')
    if (el.kind === 'element') {
      expect(el.tag).toBe('div')
      expect(el.span?.start).toMatchObject({ line: 2, column: 1 })
    }
  })

  it('parses classes and id from selector', () => {
    const file = parse('- view\ndiv.card.foo#main')
    const el = file.markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.classes).toEqual(['card', 'foo'])
    expect(el.id).toBe('main')
  })

  it('parses inline text', () => {
    const file = parse('- view\np Hello world')
    const el = file.markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.children[0]).toMatchObject({ kind: 'text', value: 'Hello world' })
  })

  it('parses nested children', () => {
    const file = parse('- view\ndiv\n  span\n  p')
    const el = file.markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.children).toHaveLength(2)
  })
})

describe('parser – data dimension', () => {
  it('parses static attribute', () => {
    const src = '- view\ninput\n  :\n    type email'
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.data).toContainEqual(expect.objectContaining({ kind: 'static', name: 'type', value: 'email' }))
  })

  it('parses dynamic attribute', () => {
    const src = '- view\ninput\n  :\n    disabled {isLoading}'
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.data).toContainEqual(expect.objectContaining({ kind: 'dynamic', name: 'disabled', expr: 'isLoading' }))
  })

  it('parses spread attribute', () => {
    const src = "- view\ninput\n  :\n    ...register('email')"
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.data).toContainEqual(expect.objectContaining({ kind: 'spread', expr: "register('email')" }))
  })

  it('parses "as" for polymorphic element', () => {
    const src = "- view\nelement\n  :\n    as {href ? 'a' : 'button'}"
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.data).toContainEqual(expect.objectContaining({ kind: 'as', expr: "href ? 'a' : 'button'" }))
  })
})

describe('parser – style dimension', () => {
  it('parses CSS declarations', () => {
    const src = '- view\ndiv\n  ::\n    padding 1.5rem\n    color red'
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.styles).toContainEqual(expect.objectContaining({ kind: 'decl', prop: 'padding', value: '1.5rem' }))
    expect(el.styles).toContainEqual(expect.objectContaining({ kind: 'decl', prop: 'color', value: 'red' }))
  })

  it('parses nested selectors', () => {
    const src = '- view\ndiv\n  ::\n    color red\n    &:hover\n      color blue'
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    const nested = el.styles?.find(r => r.kind === 'nested')
    expect(nested).toBeTruthy()
    if (nested?.kind === 'nested') {
      expect(nested.selector).toBe('&:hover')
      expect(nested.rules).toContainEqual(expect.objectContaining({ kind: 'decl', prop: 'color', value: 'blue' }))
    }
  })
})

describe('parser – behavior dimension', () => {
  it('parses @click.prevent', () => {
    const src = '- view\nbutton\n  @click.prevent\n    doSomething()'
    const el = parse(src).markup![0]
    if (el.kind !== 'element') throw new Error()
    expect(el.behaviors).toHaveLength(1)
    expect(el.behaviors![0].event).toBe('click')
    expect(el.behaviors![0].modifiers).toEqual(['prevent'])
    expect(el.behaviors![0].body[0].src).toBe('doSomething()')
    expect(el.behaviors![0].span?.start).toMatchObject({ line: 3, column: 3 })
  })
})

describe('parser – control flow', () => {
  it('parses if/else if/else chain', () => {
    const src = '- view\nif x\n  p a\nelse if y\n  p b\nelse\n  p c'
    const nodes = parse(src).markup!
    expect(nodes[0].kind).toBe('if')
    const node = nodes[0]
    if (node.kind !== 'if') throw new Error()
    expect(node.condition).toBe('x')
    expect(node.alternate?.kind).toBe('elseif')
  })

  it('parses each loop', () => {
    const src = '- view\neach user in users\n  p x'
    const node = parse(src).markup![0]
    if (node.kind !== 'each') throw new Error()
    expect(node.item).toBe('user')
    expect(node.list).toBe('users')
  })

  it('parses each with index', () => {
    const src = '- view\neach item, i in list\n  p x'
    const node = parse(src).markup![0]
    if (node.kind !== 'each') throw new Error()
    expect(node.index).toBe('i')
  })

  it('parses explicit each loop keys', () => {
    const node = parse('- view\neach user in users by user.id\n  p {user.name}').markup![0]
    expect(node).toMatchObject({ kind: 'each', list: 'users', keyExpr: 'user.id' })
  })
})

describe('parser – slots', () => {
  it('parses slot-def (standalone slot)', () => {
    const src = '- view\nslot'
    const node = parse(src).markup![0]
    expect(node.kind).toBe('slot-def')
  })

  it('parses named slot-def', () => {
    const src = '- view\nslot:nav'
    const node = parse(src).markup![0]
    expect(node).toMatchObject({ kind: 'slot-def', name: 'nav' })
  })

  it('parses slot-use with children', () => {
    const src = '- view\nLayout\n  slot:nav\n    h1 Title'
    const layout = parse(src).markup![0]
    if (layout.kind !== 'element') throw new Error()
    const slotUse = layout.children[0]
    expect(slotUse).toMatchObject({ kind: 'slot-use', name: 'nav' })
    if (slotUse.kind !== 'slot-use') throw new Error()
    expect(slotUse.children[0]).toMatchObject({ kind: 'element', tag: 'h1' })
    expect(slotUse.span?.start).toMatchObject({ line: 3, column: 3 })
  })
})

describe('parser – implicit view zone', () => {
  it('parses markup without explicit - view switch', () => {
    const file = parse('div\n  p Hello')
    expect(file.markup).toHaveLength(1)
  })
})

describe('parser – diagnostics', () => {
  function codes(src: string) {
    return parseWithDiagnostics(src).diagnostics.map((diagnostic) => diagnostic.code)
  }

  it('reports duplicate top-level zones', () => {
    expect(codes('- props\n  title: string\n\n- props\n  count: number')).toContain('loom/duplicate-zone')
  })

  it('reports unknown zone-looking headers', () => {
    expect(codes('- style\n  color red\n\n- view\np ok')).toContain('loom/unknown-zone')
  })

  it('reports malformed props, state, and computed declarations', () => {
    const result = parseWithDiagnostics('- props\n  title\n\n- state\n  count = 0\n\n- computed\n  doubled =')
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'loom/prop-syntax',
      'loom/state-syntax',
      'loom/computed-syntax',
    ]))
  })

  it('reports malformed selectors and unbalanced expressions', () => {
    const result = parseWithDiagnostics('- view\ndiv.#bad\np {title')
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'loom/selector-syntax',
      'loom/unbalanced-expression',
    ]))
  })

  it('reports malformed each controls and recovers to later markup', () => {
    const result = parseWithDiagnostics('- view\neach item of items\n  p hidden\np visible')
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/each-syntax')
    expect(result.file?.markup?.some((node) => node.kind === 'element' && node.tag === 'p')).toBe(true)
  })

  it('reports malformed dimensions without valid bodies', () => {
    const result = parseWithDiagnostics('- view\ndiv\n  :\n  ::\n  @click')
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'loom/dimension-body',
    ]))
  })

  it('reports malformed slot syntax', () => {
    expect(codes('- view\nslot:')).toContain('loom/slot-syntax')
  })
})
