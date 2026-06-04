import { describe, expect, it } from 'vitest'
import { createIncrementalCache } from '../src/index.js'

const source = `- props
  title: string = "Loom"

- view
section.card
  h1 {title}
`

describe('Incremental Cache v2', () => {
  it('caches parse, analysis, and target codegen by zone hash', () => {
    const cache = createIncrementalCache()

    const first = cache.compile('App.loom', source, {
      componentName: 'App',
      target: 'react',
    })
    const second = cache.compile('App.loom', source, {
      componentName: 'App',
      target: 'react',
    })

    expect(first.cache.hit).toBe(false)
    expect(second.cache.hit).toBe(true)
    expect(second.cache.stats.parseHits).toBe(1)
    expect(second.cache.stats.analysisHits).toBe(1)
    expect(second.cache.stats.codegenHits).toBe(1)
    expect(second.cache.zones.map((zone) => zone.kind)).toContain('props')
    expect(second.cache.zones.map((zone) => zone.kind)).toContain('markup')
  })

  it('invalidates codegen when a zone changes', () => {
    const cache = createIncrementalCache()

    cache.compile('App.loom', source, { componentName: 'App', target: 'react' })
    const changed = cache.compile('App.loom', source.replace('Loom', 'Cache'), {
      componentName: 'App',
      target: 'react',
    })

    expect(changed.cache.hit).toBe(false)
    expect(changed.cache.stats.codegenMisses).toBe(2)
  })
})
