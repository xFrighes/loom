import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCodemodArgs,
  convertSnippetForEditor,
  summarizeCodemodWarnings,
  type CodemodRunner,
} from '../src/commands.js'
import { isSupportedPreviewTarget, resolveLoomTools, resolveToolPath } from '../src/config.js'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('vscode-loom package', () => {
  it('contributes the Loom language, grammar, snippets, commands, and settings', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

    expect(manifest.contributes.languages[0].id).toBe('loom')
    expect(manifest.contributes.languages[0].extensions).toContain('.loom')
    expect(manifest.contributes.grammars[0].path).toBe('./syntaxes/loom.tmLanguage.json')
    expect(manifest.contributes.snippets[0].path).toBe('./snippets/loom.json')
    const commandIds = manifest.contributes.commands.map((command: { command: string }) => command.command)
    expect(commandIds).toContain('loom.preview')
    expect(commandIds).toContain('loom.pasteAsLoomHtml')
    expect(commandIds).toContain('loom.pasteAsLoomJsx')
    expect(commandIds).toContain('loom.convertSelectionToLoomHtml')
    expect(manifest.contributes.configuration.properties['loom.languageServer.path']).toBeDefined()
    expect(manifest.contributes.configuration.properties['loom.compiler.path']).toBeDefined()
    expect(manifest.contributes.configuration.properties['loom.codemod.path']).toEqual(expect.objectContaining({
      default: 'loom-codemod',
      type: 'string',
    }))
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
      codemodPath: './bin/loom-codemod',
      previewTarget: 'vue',
    }, '/repo')).toEqual({
      languageServerPath: '/repo/bin/server',
      compilerPath: '/repo/bin/loomc',
      codemodPath: '/repo/bin/loom-codemod',
      previewTarget: 'vue',
    })
  })

  it('builds codemod command arguments for editor conversions', () => {
    expect(buildCodemodArgs('/tmp/Snippet.html', 'html')).toEqual([
      '/tmp/Snippet.html',
      '--from',
      'html',
      '--stdout',
    ])
    expect(buildCodemodArgs('/tmp/Snippet.tsx', 'jsx')).toEqual([
      '/tmp/Snippet.tsx',
      '--from',
      'jsx',
      '--stdout',
    ])
  })

  it('runs editor conversions through the configured codemod path', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const runner: CodemodRunner = async (command, args) => {
      calls.push({ command, args })
      return {
        stdout: '- pug\nbutton\n',
        stderr: '[warning] loom-migrate/html-comment: HTML comments were preserved.\n',
      }
    }

    const result = await convertSnippetForEditor({
      codemodPath: './bin/loom-codemod',
      from: 'html',
      source: '<button>Save</button>',
      runner,
    })

    expect(result).toEqual({
      ok: true,
      source: '- pug\nbutton',
      warningSummary: '[warning] loom-migrate/html-comment: HTML comments were preserved.',
    })
    expect(calls[0]?.command).toBe('./bin/loom-codemod')
    expect(calls[0]?.args).toContain('--from')
    expect(calls[0]?.args).toContain('html')
    expect(calls[0]?.args).toContain('--stdout')
  })

  it('returns a failed editor conversion without source when codemod fails', async () => {
    const runner: CodemodRunner = async () => {
      throw Object.assign(new Error('Command failed'), {
        stderr: 'Error converting Snippet.tsx: unsupported JSX spread\n',
      })
    }

    const result = await convertSnippetForEditor({
      codemodPath: 'loom-codemod',
      from: 'jsx',
      source: '<Button {...props} />',
      runner,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Error converting Snippet.tsx: unsupported JSX spread',
    })
  })

  it('summarizes codemod warnings from stderr', () => {
    expect(summarizeCodemodWarnings([
      '[warning] one',
      '[warning] two',
    ].join('\n'))).toBe('[warning] one (+1 more)')
  })

  it('validates preview target names', () => {
    expect(isSupportedPreviewTarget('react')).toBe(true)
    expect(isSupportedPreviewTarget('vue')).toBe(true)
    expect(isSupportedPreviewTarget('svelte')).toBe(true)
    expect(isSupportedPreviewTarget('solid')).toBe(false)
  })
})
