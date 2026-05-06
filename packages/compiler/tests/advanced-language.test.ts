import { describe, expect, it } from 'vitest'
import { compile, parse, printLoom } from '../src/index.js'

const source = `- meta
  title: Product page
  description: Launch details
  og:title: Launch

- schema
  props = z.object({ title: z.string() })

- server
  export async function load() {
    return { ok: true }
  }

- tokens
  color.primary: #0055ff
  theme.dark.color.primary: #8ab4ff

- props
  title: string

- pug
section.hero
  :
    src ./hero.svg
  ::
    color var(--loom-color-primary)
    background url("./hero.svg")
  h1 {t('hero.title')}
`

describe('advanced language features', () => {
  it('parses and prints advanced top-level zones', () => {
    const file = parse(source)
    expect(file.meta).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'title', value: 'Product page' }),
      expect.objectContaining({ key: 'og:title', value: 'Launch' }),
    ]))
    expect(file.schema?.declarations[0]).toMatchObject({ name: 'props', expr: 'z.object({ title: z.string() })' })
    expect(file.server?.src).toContain('export async function load')
    expect(file.tokens?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['color', 'primary'], value: '#0055ff' }),
      expect.objectContaining({ theme: 'dark', path: ['color', 'primary'], value: '#8ab4ff' }),
    ]))

    const printed = printLoom(file)
    expect(printed).toContain('- meta')
    expect(printed).toContain('- schema')
    expect(printed).toContain('- server')
    expect(printed).toContain('- tokens')
  })

  it('emits React meta, schema, server, tokens, i18n, CSS, and asset metadata', () => {
    const result = compile(source, {
      componentName: 'ProductPage',
      target: 'react',
      ssr: true,
      schemaAdapter: 'zod',
      i18n: { messages: {} },
      extractCss: true,
      assetOptimization: true,
    })

    expect(result.code).toContain('export function Head()')
    expect(result.code).toContain("import { z } from 'zod'")
    expect(result.code).toContain('export async function load')
    expect(result.css).toContain('--loom-color-primary: #0055ff')
    expect(result.cssAssets?.[0]).toMatchObject({ fileName: 'ProductPage.module.css' })
    expect(result.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: './hero.svg', kind: 'svg' }),
    ]))
    expect(result.i18n).toMatchObject({ keys: ['hero.title'], missing: ['hero.title'] })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'loom/i18n-missing-key' }),
    ]))
  })

  it('uses target-native head output for Vue and Svelte', () => {
    const vue = compile(source, { componentName: 'ProductPage', target: 'vue' })
    const svelte = compile(source, { componentName: 'ProductPage', target: 'svelte' })

    expect(vue.code).toContain('const __loomHead')
    expect(svelte.code).toContain('<svelte:head>')
    expect(svelte.code).toContain('<title>Product page</title>')
  })

  it('applies conservative directive transforms before codegen', () => {
    const result = compile('- pug\np Hello', {
      componentName: 'Directed',
      target: 'react',
      directives: [{
        name: 'append-meta',
        transform(file) {
          file.meta = [{ key: 'title', value: 'Directed' }]
        },
      }],
    })

    expect(result.meta).toEqual({ title: 'Directed' })
    expect(result.code).toContain('export function Head()')
  })
})
