import { describe, expect, it } from 'vitest'
import {
  createLoomTailwindExtractor,
  extractTailwindCandidates,
  extractTailwindClassList,
} from '../src/index.js'

describe('@loom-ui/tailwind', () => {
  it('extracts shorthand classes and static class attrs', () => {
    const source = [
      '- pug',
      'div.rounded.border',
      '  :',
      '    class bg-sky-500 text-white px-4',
    ].join('\n')

    expect(extractTailwindClassList(source)).toEqual([
      'rounded',
      'border',
      'bg-sky-500',
      'text-white',
      'px-4',
    ])
  })

  it('keeps dynamic class expressions as metadata instead of fake static candidates', () => {
    const source = [
      '- pug',
      'div',
      '  :',
      "    class {isActive ? 'text-green-500' : 'text-slate-500'}",
    ].join('\n')

    const result = extractTailwindCandidates(source)
    expect(result.classes).toEqual([])
    expect(result.dynamicExpressions).toEqual(["isActive ? 'text-green-500' : 'text-slate-500'"])
  })

  it('returns an extractor shape compatible with Tailwind content hooks', () => {
    const extractor = createLoomTailwindExtractor()
    expect(extractor.extensions).toEqual(['loom'])
    expect(extractor.extract('- pug\ndiv.card')).toEqual(['card'])
  })

  it('extracts classes from control-flow branches, loops, and slot content', () => {
    const source = [
      '- pug',
      'Layout.shell',
      '  slot:nav',
      '    a.nav-link',
      '      :',
      '        className hover:text-sky-500',
      '  if isEmpty',
      '    p.text-slate-500 Empty',
      '  else',
      '    each item in items',
      '      article.card',
      '        :',
      '          class shadow-sm',
    ].join('\n')

    expect(extractTailwindClassList(source)).toEqual([
      'shell',
      'nav-link',
      'hover:text-sky-500',
      'text-slate-500',
      'card',
      'shadow-sm',
    ])
  })

  it('fails closed on invalid loom input', () => {
    expect(extractTailwindCandidates('- pug\nelse')).toEqual({
      classes: [],
      dynamicExpressions: [],
    })
  })
})
