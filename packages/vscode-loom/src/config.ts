import path from 'node:path'

export type LoomExtensionSettings = {
  languageServerPath?: string
  compilerPath?: string
  codemodPath?: string
  previewTarget?: 'react' | 'vue' | 'svelte'
}

export type ResolvedLoomTools = {
  languageServerPath: string
  compilerPath: string
  codemodPath: string
  previewTarget: 'react' | 'vue' | 'svelte'
}

export function resolveLoomTools(settings: LoomExtensionSettings, workspaceRoot?: string): ResolvedLoomTools {
  return {
    languageServerPath: resolveToolPath(settings.languageServerPath ?? 'loom-language-server', workspaceRoot),
    compilerPath: resolveToolPath(settings.compilerPath ?? 'loomc', workspaceRoot),
    codemodPath: resolveToolPath(settings.codemodPath ?? 'loom-codemod', workspaceRoot),
    previewTarget: settings.previewTarget ?? 'react',
  }
}

export function resolveToolPath(value: string, workspaceRoot?: string): string {
  if (path.isAbsolute(value)) return value
  if (value.includes('/') || value.includes('\\')) {
    return path.resolve(workspaceRoot ?? process.cwd(), value)
  }
  return value
}

export function isSupportedPreviewTarget(value: string): value is ResolvedLoomTools['previewTarget'] {
  return value === 'react' || value === 'vue' || value === 'svelte'
}
