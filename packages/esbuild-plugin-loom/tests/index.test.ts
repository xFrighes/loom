import { describe, expect, it } from 'vitest'
import loom, { compileForEsbuild } from '../src/index.js'

describe('esbuild-plugin-loom', () => {
  it('registers an esbuild onLoad handler', () => {
    let registered = false
    loom().setup({
      onLoad(options) {
        registered = options.filter.test('Component.loom')
      },
    })
    expect(registered).toBe(true)
  })

  it('compiles React output for esbuild', () => {
    expect(compileForEsbuild('- pug\ndiv Hello', '/src/Card.loom', 'react').code).toContain('function Card')
  })
})
