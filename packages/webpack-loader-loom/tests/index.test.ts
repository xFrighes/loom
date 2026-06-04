import { describe, expect, it } from 'vitest'
import loader, { compileForWebpack } from '../src/index.js'

describe('webpack-loader-loom', () => {
  it('compiles with default React target', () => {
    expect(compileForWebpack('- view\ndiv Hello', '/src/Panel.loom').code).toContain('function Panel')
  })

  it('supports synchronous loader invocation', () => {
    const code = loader.call({ resourcePath: '/src/Panel.loom' }, '- view\ndiv Hello')
    expect(code).toContain('function Panel')
  })
})
