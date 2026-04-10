#!/usr/bin/env node
import { getFoldRanges } from './folds.js'
import { analyze } from './index.js'
import { parse } from './parser.js'
import type { LoomFile, MarkupNode, ElementNode } from './ast.js'

const documents = new Map<string, string>()
let buffer = ''

const readMessages = (chunk: string) => {
  buffer += chunk
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = buffer.slice(0, headerEnd)
    const match = header.match(/Content-Length: (\d+)/i)
    if (!match) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }

    const length = Number(match[1])
    const messageStart = headerEnd + 4
    if (buffer.length < messageStart + length) return

    const payload = buffer.slice(messageStart, messageStart + length)
    buffer = buffer.slice(messageStart + length)
    handleMessage(JSON.parse(payload))
  }
}

const send = (message: any) => {
  const payload = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`)
}

const sendResponse = (id: any, result: any) => send({ jsonrpc: '2.0', id, result })

const sendDiagnostics = (uri: string, diagnostics: any[] = []) =>
  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics },
  })

const handleMessage = (message: any) => {
  const { id, method, params } = message

  if (method === 'initialize') {
    sendResponse(id, {
      capabilities: {
        textDocumentSync: 1, // Full
        foldingRangeProvider: true,
        hoverProvider: true,
        completionProvider: {
          triggerCharacters: ['-', '@', ':', ' ', '\n'],
        },
      },
      serverInfo: {
        name: 'loom-language-server',
        version: '0.1.0',
      },
    })
    return
  }

  if (method === 'initialized') return

  if (method === 'shutdown') {
    sendResponse(id, null)
    return
  }

  if (method === 'exit') {
    process.exit(0)
  }

  if (method === 'textDocument/didOpen') {
    const { uri, text } = params.textDocument
    documents.set(uri, text)
    sendDiagnostics(uri, toLspDiagnostics(text))
    return
  }

  if (method === 'textDocument/didChange') {
    const { uri } = params.textDocument
    const latest = params.contentChanges.at(-1)?.text ?? ''
    documents.set(uri, latest)
    sendDiagnostics(uri, toLspDiagnostics(latest))
    return
  }

  if (method === 'textDocument/foldingRange') {
    const text = documents.get(params.textDocument.uri) ?? ''
    const result = getFoldRanges(text).map((range) => ({
      startLine: range.startLine - 1,
      endLine: Math.max(range.endLine - 1, range.startLine - 1),
      kind: 'region',
    }))
    sendResponse(id, result)
    return
  }

  if (method === 'textDocument/hover') {
    const text = documents.get(params.textDocument.uri) ?? ''
    const result = buildHover(text, params.position)
    sendResponse(id, result)
    return
  }

  if (method === 'textDocument/completion') {
    const text = documents.get(params.textDocument.uri) ?? ''
    const result = buildCompletions(text, params.position)
    sendResponse(id, result)
    return
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', readMessages)

// ─── Diagnostics ─────────────────────────────────────────────────────────────

function toLspDiagnostics(text: string) {
  const { diagnostics } = analyze(text)
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity === 'error' ? 1 : 2,
    message: diagnostic.message,
    code: diagnostic.code,
    range: {
      start: {
        line: diagnostic.span.start.line - 1,
        character: diagnostic.span.start.column - 1,
      },
      end: {
        line: diagnostic.span.end.line - 1,
        character: Math.max(diagnostic.span.end.column - 1, diagnostic.span.start.column - 1),
      },
    },
  }))
}

// ─── Hover ────────────────────────────────────────────────────────────────────

function buildHover(text: string, position: { line: number; character: number }) {
  // LSP positions are 0-based; Loom spans are 1-based.
  const loomLine = position.line + 1
  const loomCol = position.character + 1
  const lines = text.split('\n')
  const currentLine = lines[position.line] ?? ''
  const trimmed = currentLine.trimStart()

  // Zone header hover
  if (/^- /.test(trimmed)) {
    const zoneName = trimmed.slice(2).trim().split(/\s/)[0]
    const doc = ZONE_DOCS[zoneName]
    if (doc) {
      return mkHover(doc)
    }
  }

  // Try AST-based hover
  let file: LoomFile | undefined
  try { file = parse(text) } catch { /* fall through to fold-based hover */ }

  if (file) {
    const found = findNodeAtPosition(file, loomLine, loomCol)
    if (found) {
      return mkHover(describeNode(found.node))
    }
  }

  // Dimension header hover
  if (/^\s*::/.test(currentLine)) {
    return mkHover('**Style dimension** (`::`) — CSS-in-source block.\n\nDeclare CSS properties for this element. Supports nested selectors (`&:hover`, `@media`), `:global(.cls)`, and arbitrary descendant selectors.')
  }
  if (/^\s*:$/.test(currentLine.trim())) {
    return mkHover('**Data dimension** (`:`) — HTML attribute block.\n\nSet static or dynamic attributes:\n- `name value` → static\n- `name {expr}` → dynamic\n- `...{expr}` → spread\n- `as {expr}` → polymorphic tag (`element` only)')
  }
  if (/^\s*@/.test(currentLine)) {
    const behMatch = currentLine.match(/^\s*@(\w+)((?:\.\w+)*)/)
    if (behMatch) {
      const event = behMatch[1]
      const mods = behMatch[2].slice(1).split('.').filter(Boolean)
      return mkHover(describeBehavior(event, mods))
    }
  }

  // Fold preview fallback
  const fold = getFoldRanges(text).find((range) => range.startLine === loomLine)
  if (!fold) return null

  const preview = lines.slice(fold.startLine - 1, fold.endLine).join('\n').trim()
  return mkHover('```loom\n' + preview + '\n```')
}

function mkHover(value: string | string[]) {
  const content = Array.isArray(value) ? value.join('\n\n') : value
  return { contents: { kind: 'markdown', value: content } }
}

const ZONE_DOCS: Record<string, string> = {
  pug: '**Markup zone** (`- pug`) — Indentation-based markup. Uses Loom element syntax: `tag.class#id`, `:` for attrs, `::` for styles, `@event` for handlers.',
  ts: '**TypeScript logic zone** (`- ts`) — Arbitrary TypeScript. Imports are hoisted to the top of the generated file. This zone is emitted as-is.',
  js: '**JavaScript logic zone** (`- js`) — Arbitrary JavaScript. Same rules as `- ts`.',
  props: '**Props zone** (`- props`) — Component props declaration.\n\nSyntax: `name: Type [= default]`',
  generics: '**Generics zone** (`- generics`) — TypeScript generic parameters for the component, e.g. `T extends object`.',
}

function describeBehavior(event: string, mods: string[]): string {
  const modDocs: Record<string, string> = {
    prevent: '`prevent` — calls `e.preventDefault()`',
    stop: '`stop` — calls `e.stopPropagation()`',
    once: '`once` — removes the listener after first invocation (**Vue/Svelte only**)',
    passive: '`passive` — marks the listener as passive (**Vue/Svelte only**)',
    capture: '`capture` — uses capture phase (**Vue/Svelte only**)',
    self: '`self` — fires only when `e.target === e.currentTarget`',
    enter: '`enter` — key filter: Enter',
    escape: '`escape` — key filter: Escape',
    tab: '`tab` — key filter: Tab',
    space: '`space` — key filter: Space',
  }

  const modLines = mods.length > 0
    ? '\n\n**Modifiers:**\n' + mods.map(m => `- ${modDocs[m] ?? `\`${m}\``}`).join('\n')
    : ''
  return `**Event handler** — \`@${event}\`${modLines}`
}

// ─── AST node finder ──────────────────────────────────────────────────────────

type FoundNode = { kind: 'markup'; node: MarkupNode }

function findNodeAtPosition(
  file: LoomFile,
  line: number,
  _col: number,
): FoundNode | null {
  for (const node of file.markup ?? []) {
    const found = findInNode(node, line)
    if (found) return { kind: 'markup', node: found }
  }
  return null
}

function findInNode(node: MarkupNode, line: number): MarkupNode | null {
  if (node.span && node.span.start.line === line) return node

  if (node.kind === 'element') {
    for (const child of node.children) {
      const found = findInNode(child, line)
      if (found) return found
    }
  } else if (node.kind === 'if' || node.kind === 'elseif') {
    for (const child of node.consequent) {
      const found = findInNode(child, line)
      if (found) return found
    }
    if (node.alternate) {
      const found = findInNode(node.alternate, line)
      if (found) return found
    }
  } else if (node.kind === 'else' || node.kind === 'each') {
    const children = node.kind === 'else' ? node.children : node.children
    for (const child of children) {
      const found = findInNode(child, line)
      if (found) return found
    }
  }
  return null
}

function describeNode(node: MarkupNode): string {
  switch (node.kind) {
    case 'element': return describeElement(node)
    case 'if': return `**if** \`${node.condition}\`\n\nConditional block. Renders its children when the condition is truthy.`
    case 'elseif': return `**else if** \`${node.condition}\``
    case 'else': return '**else** — fallback branch of an if/else if chain.'
    case 'each': {
      const idx = node.index ? `, ${node.index}` : ''
      return `**each** \`${node.item}${idx} in ${node.list}\`\n\nLoop over \`${node.list}\`. Add \`: key {expr}\` on the child for stable reconciliation.`
    }
    case 'slot-def': return node.name
      ? `**named slot definition** — \`slot:${node.name}\`\n\nPlaceholder for content passed as the \`${node.name}\` slot.`
      : '**default slot** — placeholder for \`children\` (React) or \`<slot />\` (Vue/Svelte).'
    case 'slot-use': return node.name
      ? `**named slot content** — \`slot:${node.name}\``
      : '**default slot content**'
    case 'text': return `**Text node**\n\n\`\`\`\n${node.value.trim()}\n\`\`\``
    case 'comment': return `**Comment** — \`// ${node.value.trim()}\``
    default: return ''
  }
}

function describeElement(node: ElementNode): string {
  const isComponent = /^[A-Z]/.test(node.tag)
  const isPolymorphic = node.tag === 'element'
  const tag = isPolymorphic ? 'element (polymorphic)' : node.tag

  const parts: string[] = []
  parts.push(isComponent
    ? `**Component** \`<${tag}>\``
    : isPolymorphic
      ? `**Polymorphic element** — resolves tag from \`:as {expr}\``
      : `**HTML element** \`<${tag}>\``)

  if (node.classes.length > 0) {
    parts.push(`Classes: \`${node.classes.join(' ')}\``)
  }
  if (node.id) {
    parts.push(`ID: \`${node.id}\``)
  }
  if (node.data && node.data.length > 0) {
    const attrNames = node.data.map(d => {
      if (d.kind === 'spread') return `...spread`
      if (d.kind === 'as') return `as {expr}`
      return d.kind === 'dynamic' ? `${d.name}={expr}` : `${d.name}`
    })
    parts.push(`Attrs: ${attrNames.join(', ')}`)
  }
  if (node.behaviors && node.behaviors.length > 0) {
    const evts = node.behaviors.map(b => {
      const mods = b.modifiers.length > 0 ? '.' + b.modifiers.join('.') : ''
      return `@${b.event}${mods}`
    })
    parts.push(`Events: ${evts.join(', ')}`)
  }

  return parts.join('\n\n')
}

// ─── Completions ──────────────────────────────────────────────────────────────

const ZONE_COMPLETIONS = ['pug', 'ts', 'js', 'props', 'generics']

const HTML_ELEMENTS = [
  'div', 'span', 'p', 'a', 'button', 'input', 'form', 'label', 'ul', 'ol',
  'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'nav',
  'header', 'footer', 'main', 'aside', 'table', 'tr', 'td', 'th', 'thead',
  'tbody', 'img', 'svg', 'path', 'textarea', 'select', 'option', 'fieldset',
  'legend', 'details', 'summary', 'dialog', 'canvas', 'video', 'audio',
  'element',
]

const CONTROL_KEYWORDS = ['if', 'else', 'else if', 'each', 'slot']

const COMMON_ATTRS = [
  'type', 'value', 'placeholder', 'disabled', 'class', 'id', 'name',
  'href', 'src', 'alt', 'target', 'rel', 'role', 'aria-label', 'aria-hidden',
  'tabindex', 'style', 'title', 'data-testid',
]

const COMMON_EVENTS = [
  'click', 'dblclick', 'submit', 'change', 'input', 'focus', 'blur',
  'keydown', 'keyup', 'mouseenter', 'mouseleave', 'scroll',
]

const MODIFIERS = [
  'prevent', 'stop', 'once', 'passive', 'capture', 'self',
  'enter', 'escape', 'tab', 'space',
]

function buildCompletions(text: string, position: { line: number; character: number }) {
  const lines = text.split('\n')
  const line = lines[position.line] ?? ''
  const beforeCursor = line.slice(0, position.character)
  const trimmed = beforeCursor.trimStart()

  // Zone header: `- |`
  if (/^-\s*$/.test(trimmed) || /^-\s+\w*$/.test(trimmed)) {
    return ZONE_COMPLETIONS.map((z, i) => ({
      label: `- ${z}`,
      kind: 14, // Keyword
      sortText: String(i).padStart(3, '0'),
    }))
  }

  // Behavior: `@event` or `@event.mod`
  const behMatch = trimmed.match(/^@(\w*)(?:\.(\w*))?$/)
  if (behMatch) {
    if (behMatch[2] !== undefined) {
      // completing modifier
      return MODIFIERS.map((m, i) => ({
        label: m,
        kind: 14,
        sortText: String(i).padStart(3, '0'),
      }))
    }
    // completing event name
    return COMMON_EVENTS.map((e, i) => ({
      label: `@${e}`,
      kind: 14,
      sortText: String(i).padStart(3, '0'),
    }))
  }

  // Data attr block (inside `:`)
  const indent = line.match(/^(\s*)/)?.[1] ?? ''
  const prevLines = lines.slice(0, position.line).reverse()
  const inDataBlock = prevLines.some(l => {
    const t = l.trimStart()
    if (/^:\s*$/.test(t) && l.startsWith(indent.slice(0, -2))) return true
    if (l.trim() === '' || /^::/.test(t) || /^@/.test(t)) return false
    return false
  })

  if (inDataBlock) {
    return COMMON_ATTRS.map((a, i) => ({
      label: a,
      kind: 5, // Field
      sortText: String(i).padStart(3, '0'),
    }))
  }

  // HTML element / control keyword completions (at any markup-level indent)
  const items = [
    ...HTML_ELEMENTS.map((e, i) => ({
      label: e,
      kind: 7, // Class
      sortText: 'b' + String(i).padStart(3, '0'),
    })),
    ...CONTROL_KEYWORDS.map((kw, i) => ({
      label: kw,
      kind: 14,
      sortText: 'a' + String(i).padStart(3, '0'),
    })),
  ]
  return items
}
