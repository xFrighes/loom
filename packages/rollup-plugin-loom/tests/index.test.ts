import { describe, expect, it } from 'vitest'
import loom, { compileForRollup } from '../src/index.js'

describe('rollup-plugin-loom', () => {
  it('exposes a Rollup transform plugin', () => {
    const plugin = loom({ target: 'react' })
    expect(plugin.name).toBe('rollup-plugin-loom')
    expect(plugin.transform('- view\ndiv Hello', '/src/Button.loom')?.code).toContain('function Button')
  })

  it('compiles Vue and Svelte targets', () => {
    expect(compileForRollup('- view\ndiv', '/src/View.loom', 'vue').code).toContain('<template>')
    expect(compileForRollup('- view\ndiv', '/src/View.loom', 'svelte').code).toContain('<script')
  })
})
