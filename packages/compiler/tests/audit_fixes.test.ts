import { describe, it, expect } from 'vitest'
import { compile, analyze } from '../src/index.js'
import { findTopLevelEquals } from '../src/expr.js'

describe('Audit Fixes: React Compound Assignments', () => {
  it('should transform compound assignments in React logic', () => {
    const src = `
- state
  count: number = 0
- pug
  button
    @click
      count += 1
      count -= 5
      count *= 2
`.trim()
    const result = compile(src, { componentName: 'Test', target: 'react' })
    expect(result.code).toContain('setCount(prev => prev + (1))')
    expect(result.code).toContain('setCount(prev => prev - (5))')
    expect(result.code).toContain('setCount(prev => prev * (2))')
  })

  it('should not transform shadowed variables', () => {
    const src = `
- state
  count: number = 0
- pug
  button
    @click
      const count = 10
      console.log(count)
      [1, 2, 3].forEach(count => {
        console.log(count)
      })
`.trim()
    const result = compile(src, { componentName: 'Test', target: 'react' })
    expect(result.code).not.toContain('setCount(')
    expect(result.code).not.toContain('setCount(prev')
    expect(result.code).toContain('const count = 10')
  })
})

describe('Audit Fixes: Arrow Function Divergence', () => {
  it('should not treat arrow functions as assignments', () => {
    const src = 'x => x * 2'
    const idx = findTopLevelEquals(src)
    expect(idx).toBe(-1)
  })
})

describe('Audit Fixes: Vue Directive Injection', () => {
  it('should not incorrectly replace tags inside attributes', () => {
    const src = `
- pug
  if show
    div
      :
        title div
`.trim()
    const result = compile(src, { componentName: 'Test', target: 'vue' })
    expect(result.code).toContain('<div v-if="show" title="div" />')
  })

  it('should not transform shadowed variables in Vue', () => {
    const src = `
- state
  count: number = 0
- pug
  button
    @click
      const count = 10
      console.log(count)
`.trim()
    const result = compile(src, { componentName: 'Test', target: 'vue' })
    expect(result.code).not.toContain('count.value')
    expect(result.code).toContain('const count = 10')
  })
})

describe('Audit Fixes: Compile Options Validation', () => {
  it('rejects component names that would generate invalid JavaScript', () => {
    expect(() => compile('- pug\ndiv', { componentName: 'bad-name', target: 'react' })).toThrow(
      /Invalid componentName/,
    )
  })

  it('rejects unknown targets from JavaScript callers', () => {
    expect(() =>
      compile('- pug\ndiv', { componentName: 'Test', target: 'solid' as 'react' }),
    ).toThrow(/Unknown target: solid/)
  })
})
