import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import loom, { detectTarget } from '../src/index.js'

function writeFixture(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'loom-plugin-'))
  const file = join(dir, 'App.loom')
  writeFileSync(file, source, 'utf8')
  return file
}

function createResolveContext(resolvedId: string) {
  return {
    resolve: vi.fn().mockResolvedValue({ id: resolvedId }),
  }
}

function createLoadContext() {
  return {
    addWatchFile: vi.fn(),
    error(message: string): never {
      throw new Error(message)
    },
  }
}

function unwrapLoadResult(result: string | { code: string } | null | undefined): string {
  if (!result) return ''
  return typeof result === 'string' ? result : result.code
}

describe('vite-plugin-loom', () => {
  it('detects the target framework from the Vite plugin list', () => {
    expect(detectTarget({ plugins: [{ name: 'vite:react-babel' }] } as any)).toBe('react')
    expect(detectTarget({ plugins: [{ name: 'vite:vue' }] } as any)).toBe('vue')
    expect(detectTarget({ plugins: [{ name: 'vite-plugin-svelte' }] } as any)).toBe('svelte')
  })

  it('routes React .loom imports through a virtual JS module and CSS module id', async () => {
    const sourcePath = writeFixture('- pug\ndiv\n  ::\n    color red')
    const plugin = loom({ target: 'react' })
    plugin.configResolved?.({ plugins: [] } as any)

    const entryId = await plugin.resolveId!.call(
      createResolveContext(sourcePath) as any,
      './App.loom',
      join(tmpdir(), 'main.tsx'),
    )

    expect(entryId).toContain('.js?')
    expect(entryId).toContain('loom-entry=1')

    const code = unwrapLoadResult(await plugin.load!.call(createLoadContext() as any, entryId!))
    const cssId = `${sourcePath.slice(0, -'.loom'.length)}-loom.module.css?loom-style=1&loom-target=react&loom-source=${encodeURIComponent(sourcePath)}`

    expect(code).toContain(`import styles from ${JSON.stringify(cssId)}`)
    expect(code).toContain('React.createElement')

    const css = await plugin.load!.call(createLoadContext() as any, cssId)
    expect(css).toContain('color: red')
  })

  it('routes Vue .loom imports through a virtual .vue module', async () => {
    const sourcePath = writeFixture('- ts\n  import { ref } from \'vue\'\n- pug\ndiv Hello')
    const plugin = loom()
    plugin.configResolved?.({ plugins: [{ name: 'vite:vue' }] } as any)

    const entryId = await plugin.resolveId!.call(
      createResolveContext(sourcePath) as any,
      './App.loom',
      join(tmpdir(), 'main.ts'),
    )

    expect(entryId).toContain('.vue?')

    const code = unwrapLoadResult(await plugin.load!.call(createLoadContext() as any, entryId!))
    expect(code).toContain('<script setup lang="ts">')
    expect(code).toContain('<template>')
  })

  it('routes Svelte .loom imports through a virtual .svelte module', async () => {
    const sourcePath = writeFixture('- ts\n  let count = 0\n- pug\ndiv {count}')
    const plugin = loom()
    plugin.configResolved?.({ plugins: [{ name: 'vite-plugin-svelte' }] } as any)

    const entryId = await plugin.resolveId!.call(
      createResolveContext(sourcePath) as any,
      './App.loom',
      join(tmpdir(), 'main.ts'),
    )

    expect(entryId).toContain('.svelte?')

    const code = unwrapLoadResult(await plugin.load!.call(createLoadContext() as any, entryId!))
    expect(code).toContain('<script lang="ts">')
    expect(code).toContain('{count}')
  })

  it('keeps virtual loom ids stable through resolveId', async () => {
    const sourcePath = writeFixture('- pug\ndiv')
    const plugin = loom({ target: 'react' })
    plugin.configResolved?.({ plugins: [] } as any)

    const entryId = `${sourcePath.slice(0, -'.loom'.length)}-loom.js?loom-entry=1&loom-target=react&loom-source=${encodeURIComponent(sourcePath)}`
    const styleId = `${sourcePath.slice(0, -'.loom'.length)}-loom.module.css?loom-style=1&loom-target=react&loom-source=${encodeURIComponent(sourcePath)}`

    await expect(plugin.resolveId!.call({} as any, entryId, undefined)).resolves.toBe(entryId)
    await expect(plugin.resolveId!.call({} as any, styleId, undefined)).resolves.toBe(styleId)
  })
})
