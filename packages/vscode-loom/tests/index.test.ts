import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSupportedPreviewTarget, resolveLoomTools, resolveToolPath } from '../src/config.js'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('vscode-loom package', () => {
  it('contributes the Loom language, grammar, snippets, commands, and settings', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

    expect(manifest.contributes.languages[0].id).toBe('loom')
    expect(manifest.contributes.languages[0].extensions).toContain('.loom')
    expect(manifest.contributes.grammars[0].path).toBe('./syntaxes/loom.tmLanguage.json')
    expect(manifest.contributes.snippets[0].path).toBe('./snippets/loom.json')
    expect(manifest.contributes.commands.map((command: { command: string }) => command.command)).toContain('loom.preview')
    expect(manifest.contributes.configuration.properties['loom.languageServer.path']).toBeDefined()
    expect(manifest.contributes.configuration.properties['loom.compiler.path']).toBeDefined()
  })

  it('ships snippets for zones, state/events, and dimensions', () => {
    const snippets = JSON.parse(readFileSync(path.join(packageRoot, 'snippets/loom.json'), 'utf8'))

    expect(snippets.Component.body.join('\n')).toContain('- props')
    expect(snippets.Component.body.join('\n')).toContain('- pug')
    expect(snippets.State.body.join('\n')).toContain('@click')
    expect(snippets['Style Dimension'].body.join('\n')).toContain('::')
    expect(snippets['Data Dimension'].body.join('\n')).toContain(':')
  })

  it('resolves configured tool paths relative to the workspace', () => {
    expect(resolveToolPath('/usr/bin/loomc', '/repo')).toBe('/usr/bin/loomc')
    expect(resolveToolPath('./node_modules/.bin/loomc', '/repo')).toBe('/repo/node_modules/.bin/loomc')
    expect(resolveToolPath('loomc', '/repo')).toBe('loomc')

    expect(resolveLoomTools({
      languageServerPath: './bin/server',
      compilerPath: './bin/loomc',
      previewTarget: 'vue',
    }, '/repo')).toEqual({
      languageServerPath: '/repo/bin/server',
      compilerPath: '/repo/bin/loomc',
      previewTarget: 'vue',
    })
  })

  it('validates preview target names', () => {
    expect(isSupportedPreviewTarget('react')).toBe(true)
    expect(isSupportedPreviewTarget('vue')).toBe(true)
    expect(isSupportedPreviewTarget('svelte')).toBe(true)
    expect(isSupportedPreviewTarget('solid')).toBe(false)
  })
})
