import type { LoomFile, MetaEntry } from './ast.js'
import type { CompileResult } from './codegen/target.js'
import type { CompilerDiagnostic } from './validate.js'

export type SchemaAdapter = 'zod' | 'valibot'

export type I18nOptions = {
  messages?: Record<string, string>
  functionName?: string
}

export type DirectiveContext = {
  target: 'react' | 'vue' | 'svelte'
  componentName: string
}

export type DirectivePlugin = {
  name: string
  transform?(file: LoomFile, context: DirectiveContext): LoomFile | void
  transformResult?(result: CompileResult, file: LoomFile, context: DirectiveContext): CompileResult | void
}

export type AssetOptimizationOptions = {
  enabled?: boolean
}

export type AdvancedCompileOptions = {
  schemaAdapter?: SchemaAdapter
  i18n?: I18nOptions
  extractCss?: boolean | { fileName?: string }
  tokens?: Record<string, unknown> | string
  assetOptimization?: boolean | AssetOptimizationOptions
  directives?: DirectivePlugin[]
  server?: boolean
  ssr?: boolean
}

export type CssAsset = {
  fileName: string
  source: string
  map?: string
  isModule: boolean
}

export type AssetMetadata = {
  kind: 'image' | 'font' | 'svg' | 'unknown'
  source: string
  owners: string[]
}

export type I18nKeyManifest = {
  keys: string[]
  missing: string[]
}

export type AdvancedMetadata = {
  cssAssets?: CssAsset[]
  assets?: AssetMetadata[]
  i18n?: I18nKeyManifest
  meta?: Record<string, string>
  schema?: { adapter?: SchemaAdapter; declarations: Record<string, string> }
  server?: { enabled: boolean; exports: string[] }
  tokens?: { css: string; count: number }
}

export function applyDirectiveTransforms(
  file: LoomFile,
  options: AdvancedCompileOptions & { target: 'react' | 'vue' | 'svelte'; componentName: string },
): LoomFile {
  let current = file
  for (const directive of options.directives ?? []) {
    const next = directive.transform?.(current, {
      target: options.target,
      componentName: options.componentName,
    })
    if (next) current = next
  }
  return current
}

export function finalizeAdvancedResult(
  result: CompileResult,
  file: LoomFile,
  options: AdvancedCompileOptions & { target: 'react' | 'vue' | 'svelte'; componentName: string },
): CompileResult {
  let next = result
  const warnings: CompilerDiagnostic[] = [...(result.warnings ?? [])]
  const metadata: AdvancedMetadata = {}

  const meta = metaRecord(file.meta)
  if (Object.keys(meta).length > 0) {
    metadata.meta = meta
    next = { ...next, code: emitMeta(next.code, options.target, meta) }
  }

  if (file.schema) {
    const declarations = Object.fromEntries(file.schema.declarations.map((decl) => [decl.name, decl.expr]))
    metadata.schema = { adapter: options.schemaAdapter, declarations }
    if (options.schemaAdapter) {
      next = { ...next, code: emitSchema(next.code, options.schemaAdapter, declarations) }
    } else {
      warnings.push(warn('loom/schema-adapter', 'Schema zone parsed but no schemaAdapter was selected.', file.schema.span))
    }
  }

  if (file.server) {
    const enabled = options.server === true || options.ssr === true
    metadata.server = {
      enabled,
      exports: file.server.statements.filter((stmt) => stmt.kind === 'export').map((stmt) => stmt.src),
    }
    if (enabled) {
      next = { ...next, code: emitServer(next.code, options.target, file.server.src) }
    } else {
      warnings.push(warn('loom/server-disabled', 'Server zone ignored because SSR/server output is disabled.', file.server.span))
    }
  }

  const tokenCss = emitTokenCss(file, options.tokens)
  if (tokenCss) {
    metadata.tokens = { css: tokenCss, count: countTokenDecls(tokenCss) }
    next = { ...next, css: [tokenCss, next.css].filter((part) => part.trim()).join('\n\n') }
  }

  const i18n = collectI18n(next.code, file, options.i18n)
  if (i18n.keys.length > 0) {
    metadata.i18n = i18n
    for (const key of i18n.missing) {
      warnings.push(warn('loom/i18n-missing-key', `Missing i18n key "${key}".`, file.span))
    }
  }

  const assets = collectAssets(file, next.css, options.assetOptimization)
  if (assets.length > 0) metadata.assets = assets

  if (options.extractCss && next.css.trim()) {
    const fileName =
      typeof options.extractCss === 'object' && options.extractCss.fileName
        ? options.extractCss.fileName
        : `${options.componentName}.module.css`
    metadata.cssAssets = [{
      fileName,
      source: next.css,
      isModule: options.target === 'react' || next.css.includes('._'),
    }]
  }

  for (const directive of options.directives ?? []) {
    const transformed = directive.transformResult?.(next, file, {
      target: options.target,
      componentName: options.componentName,
    })
    if (transformed) next = transformed
  }

  return {
    ...next,
    warnings: warnings.length > 0 ? warnings : next.warnings,
    meta: metadata.meta,
    schema: metadata.schema,
    server: metadata.server,
    i18n: metadata.i18n,
    assets: metadata.assets,
    cssAssets: metadata.cssAssets,
    tokens: metadata.tokens,
  }
}

function metaRecord(entries: MetaEntry[] | undefined): Record<string, string> {
  return Object.fromEntries((entries ?? []).map((entry) => [entry.key, entry.value]))
}

function emitMeta(code: string, target: 'react' | 'vue' | 'svelte', meta: Record<string, string>): string {
  const title = meta.title
  const tags = Object.entries(meta).filter(([key]) => key !== 'title')
  if (target === 'svelte') {
    const lines = ['<svelte:head>']
    if (title) lines.push(`  <title>${escapeHtml(title)}</title>`)
    for (const [key, value] of tags) lines.push(`  <meta ${metaAttrName(key)}="${escapeHtml(key)}" content="${escapeHtml(value)}" />`)
    lines.push('</svelte:head>')
    return `${code}\n\n${lines.join('\n')}`
  }
  if (target === 'vue') {
    const payload = {
      ...(title ? { title } : {}),
      meta: tags.map(([key, content]) => ({ [metaAttrName(key)]: key, content })),
    }
    return code.replace('<script setup lang="ts">', `<script setup lang="ts">\nconst __loomHead = ${JSON.stringify(payload)}`)
  }
  const jsx = [
    'export function Head() {',
    '  return (',
    '    <>',
    ...(title ? [`      <title>{${JSON.stringify(title)}}</title>`] : []),
    ...tags.map(([key, value]) => `      <meta ${metaAttrName(key)}=${JSON.stringify(key)} content=${JSON.stringify(value)} />`),
    '    </>',
    '  )',
    '}',
  ].join('\n')
  return `${code}\n\nexport const loomMeta = ${JSON.stringify(meta, null, 2)}\n${jsx}`
}

function emitSchema(code: string, adapter: SchemaAdapter, declarations: Record<string, string>): string {
  const importLine = adapter === 'zod'
    ? "import { z } from 'zod'"
    : "import * as v from 'valibot'"
  const body = Object.entries(declarations)
    .map(([name, expr]) => `export const ${name}Schema = ${expr}`)
    .join('\n')
  return `${importLine}\n${code}\n\n${body}`
}

function emitServer(code: string, target: 'react' | 'vue' | 'svelte', src: string): string {
  if (target === 'svelte') {
    return code.replace('<script context="module" lang="ts">', `<script context="module" lang="ts">\n${src}`)
  }
  return `${code}\n\n${src}`
}

function emitTokenCss(file: LoomFile, projectTokens: AdvancedCompileOptions['tokens']): string {
  const entries = [...(file.tokens?.entries ?? []), ...flattenProjectTokens(projectTokens)]
  if (entries.length === 0) return ''
  const root: string[] = []
  const themes = new Map<string, string[]>()
  for (const entry of entries) {
    const name = `--loom-${entry.path.map(kebab).join('-')}`
    const decl = `  ${name}: ${entry.value};`
    if (entry.theme) {
      const themeDecls = themes.get(entry.theme) ?? []
      themeDecls.push(decl)
      themes.set(entry.theme, themeDecls)
    } else {
      root.push(decl)
    }
  }
  const parts = root.length > 0 ? [`:root {\n${root.join('\n')}\n}`] : []
  for (const [theme, decls] of themes) {
    parts.push(`[data-theme="${theme}"] {\n${decls.join('\n')}\n}`)
    if (theme === 'dark') parts.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${decls.map((decl) => `  ${decl}`).join('\n')}\n  }\n}`)
  }
  return parts.join('\n\n')
}

function flattenProjectTokens(tokens: AdvancedCompileOptions['tokens']): Array<{ path: string[]; value: string; theme?: string }> {
  if (!tokens || typeof tokens === 'string') return []
  const out: Array<{ path: string[]; value: string; theme?: string }> = []
  const visit = (value: unknown, path: string[], theme?: string) => {
    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if ((key === 'theme' || key === 'themes') && nested && typeof nested === 'object') {
          for (const [themeName, themed] of Object.entries(nested)) visit(themed, [], themeName)
        } else {
          visit(nested, [...path, key], theme)
        }
      }
      return
    }
    if (path.length > 0) out.push({ path, value: String(value), theme })
  }
  visit(tokens, [])
  return out
}

function collectI18n(code: string, file: LoomFile, options: I18nOptions | undefined): I18nKeyManifest {
  const keys = new Set<string>()
  const text = `${code}\n${file.markup ? JSON.stringify(file.markup) : ''}`
  const patterns = [
    /\bt\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bi18n:([A-Za-z0-9_.-]+)/g,
    /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) keys.add(match[1])
  }
  const messages = options?.messages ?? {}
  return {
    keys: [...keys].sort(),
    missing: [...keys].filter((key) => !(key in messages)).sort(),
  }
}

function collectAssets(file: LoomFile, css: string, enabled: AdvancedCompileOptions['assetOptimization']): AssetMetadata[] {
  if (!enabled) return []
  const owners: string[] = []
  if (file.markup) owners.push(JSON.stringify(file.markup))
  if (css) owners.push(css)
  const combined = owners.join('\n')
  const found = new Map<string, AssetMetadata>()
  const patterns = [
    /\b(?:src|href)=\\?"([^"]+\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf|otf))\\?"/g,
    /url\((?:'|")?([^'")]+\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf|otf))(?:'|")?\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of combined.matchAll(pattern)) {
      const source = match[1]
      found.set(source, { source, kind: assetKind(source), owners: ['markup', 'style'] })
    }
  }
  return [...found.values()].sort((a, b) => a.source.localeCompare(b.source))
}

function warn(code: string, message: string, span = fallbackSpan()): CompilerDiagnostic {
  return {
    code,
    severity: 'warning',
    message,
    span,
    source: 'codegen',
  }
}

function fallbackSpan() {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
}

function countTokenDecls(css: string): number {
  return (css.match(/--loom-/g) ?? []).length
}

function metaAttrName(key: string): 'property' | 'name' {
  return key.startsWith('og:') || key.startsWith('twitter:') ? 'property' : 'name'
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()
}

function assetKind(source: string): AssetMetadata['kind'] {
  if (/\.svg$/i.test(source)) return 'svg'
  if (/\.(woff2?|ttf|otf)$/i.test(source)) return 'font'
  if (/\.(png|jpe?g|webp|gif)$/i.test(source)) return 'image'
  return 'unknown'
}
