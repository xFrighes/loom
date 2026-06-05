import { describe, expect, it } from 'vitest'
import { assertCompiles, compileFixture, compileForTargets, loomMatchers } from '../src/index.js'

expect.extend(loomMatchers)

describe('@loom-ui/testing', () => {
  it('exposes a per-target compile helper', () => {
    const source = '- view\nbutton Click'
    const react = compileFixture(source, 'react')
    expect(react.code).toContain('<button>')
  })

  it('compiles a representative fixture across React, Vue, and Svelte', () => {
    const source = [
      '- props',
      '  label: string = "Save"',
      '',
      '- view',
      'button.primary',
      '  {label}',
    ].join('\n')

    const compiled = compileForTargets(source)
    expect(compiled.react.code).toContain('function TestComponent')
    expect(compiled.vue.code).toContain('<template>')
    expect(compiled.svelte.code).toContain('<script lang="ts">')
  })

  it('supports a Vitest matcher for cross-target compilation', () => {
    const source = '- view\ndiv Hello'
    ;(expect(source) as any).toCompileAcrossTargets()
  })

  it('returns all target outputs from assertCompiles', () => {
    const source = '- view\ninput\n  :\n    type email'
    const compiled = assertCompiles(source)
    expect(Object.keys(compiled)).toEqual(['react', 'vue', 'svelte'])
  })

  it('honors target subsets without compiling unrequested targets', () => {
    const source = '- view\ndiv Hello'
    const compiled = compileForTargets(source, ['vue'])

    expect(Object.keys(compiled)).toEqual(['vue'])
    expect(compiled.vue.code).toContain('<template>')
  })

  it('surfaces compile diagnostics through the matcher failure message', () => {
    const source = '- props\n  : string\n- view\ndiv'
    const result = loomMatchers.toCompileAcrossTargets(source)

    expect(result.pass).toBe(false)
    expect(result.message()).toContain('loom/prop-syntax')
  })
})
