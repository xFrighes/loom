import { describe, expect, it } from 'vitest'
import LoomRspackPlugin, { compileForRspack, createRspackRule } from '../src/index.js'

describe('rspack-plugin-loom', () => {
  it('creates a .loom rule', () => {
    const rule = createRspackRule({ target: 'react' })
    expect(rule.test.test('Component.loom')).toBe(true)
  })

  it('applies its loader rule to compiler options', () => {
    const compiler = {}
    new LoomRspackPlugin().apply(compiler)
    expect((compiler as any).options.module.rules).toHaveLength(1)
  })

  it('compiles target output', () => {
    expect(compileForRspack('- pug\ndiv', '/src/Widget.loom').code).toContain('function Widget')
  })
})
