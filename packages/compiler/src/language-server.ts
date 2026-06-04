#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', readMessages)
}

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
  view: '**Markup zone** (`- view`) — Indentation-based markup. Uses Loom element syntax: `tag.class#id`, `:` for attrs, `::` for styles, `@event` for handlers.',
  ts: '**TypeScript logic zone** (`- ts`) — Arbitrary TypeScript. Imports are hoisted to the top of the generated file. This zone is emitted as-is.',
  js: '**JavaScript logic zone** (`- js`) — Arbitrary JavaScript. Same rules as `- ts`.',
  props: '**Props zone** (`- props`) — Component props declaration.\n\nSyntax: `name: Type [= default]`',
  generics: '**Generics zone** (`- generics`) — TypeScript generic parameters for the component, e.g. `T extends object`.',
  meta: '**Meta zone** (`- meta`) — Head metadata. Syntax: `title: Page title`, `description: ...`, `og:title: ...`.',
  schema: '**Schema zone** (`- schema`) — Runtime validation declarations emitted when `schemaAdapter` is selected.',
  server: '**Server zone** (`- server`) — SSR/server exports. Emitted only with `ssr` or explicit server output.',
  tokens: '**Tokens zone** (`- tokens`) — Design tokens emitted as CSS variables. Syntax: `color.primary: #0055ff`, `theme.dark.color.primary: #8ab4ff`.',
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

type LspPosition = { line: number; character: number }

type CompletionTextEdit = {
  range: { start: LspPosition; end: LspPosition }
  newText: string
}

export type LoomCompletionItem = {
  label: string
  kind: number
  detail?: string
  documentation?: { kind: 'markdown'; value: string }
  insertText?: string
  insertTextFormat?: 1 | 2
  filterText?: string
  sortText?: string
  commitCharacters?: string[]
  textEdit?: CompletionTextEdit
}

type CompletionSpec = {
  label: string
  insertText?: string
  kind: number
  detail: string
  documentation: string
  filterText?: string
  snippet?: boolean
  commitCharacters?: string[]
}

type CompletionMode = 'zone' | 'event' | 'eventModifier' | 'data' | 'style' | 'expression' | 'markup'

type CompletionContext = {
  mode: CompletionMode
  line: string
  beforeCursor: string
  indent: string
  replaceFrom: number
  position: LspPosition
  activeTag?: string
}

const KIND = {
  text: 1,
  function: 3,
  field: 5,
  variable: 6,
  class: 7,
  property: 10,
  value: 12,
  keyword: 14,
  snippet: 15,
  event: 23,
  operator: 24,
} as const

const SNIPPET = 2 as const

const ZONE_COMPLETIONS: CompletionSpec[] = [
  { label: '- view', insertText: '- view\n${1:div}', kind: KIND.keyword, detail: 'Markup zone', documentation: 'Start the Loom markup zone.' },
  { label: '- props', insertText: '- props\n  ${1:name}: ${2:string}', kind: KIND.keyword, detail: 'Props zone', documentation: 'Declare typed component props.' },
  { label: '- state', insertText: '- state\n  ${1:count}: ${2:number} = ${3:0}', kind: KIND.keyword, detail: 'State zone', documentation: 'Declare local reactive state.' },
  { label: '- computed', insertText: '- computed\n  ${1:value} = ${2:expression}', kind: KIND.keyword, detail: 'Computed zone', documentation: 'Declare derived values.' },
  { label: '- ts', insertText: '- ts\n  ${1}', kind: KIND.keyword, detail: 'TypeScript zone', documentation: 'Add arbitrary TypeScript logic.' },
  { label: '- js', insertText: '- js\n  ${1}', kind: KIND.keyword, detail: 'JavaScript zone', documentation: 'Add arbitrary JavaScript logic.' },
  { label: '- generics', insertText: '- generics\n  ${1:T extends Record<string, unknown>}', kind: KIND.keyword, detail: 'Generics zone', documentation: 'Declare component type parameters.' },
  { label: '- meta', insertText: '- meta\n  title: ${1:Page title}\n  description: ${2:Page description}', kind: KIND.keyword, detail: 'Meta zone', documentation: 'Declare page metadata.' },
  { label: '- tokens', insertText: '- tokens\n  color.${1:primary}: ${2:#0055ff}', kind: KIND.keyword, detail: 'Design tokens', documentation: 'Declare design tokens emitted as CSS variables.' },
  { label: '- schema', insertText: '- schema\n  ${1:props} = ${2:z.object({})}', kind: KIND.keyword, detail: 'Schema zone', documentation: 'Declare runtime validation schema entries.' },
  { label: '- server', insertText: '- server\n  ${1}', kind: KIND.keyword, detail: 'Server zone', documentation: 'Declare SSR/server-only exports.' },
  { label: '- onMount', insertText: '- onMount\n  ${1}', kind: KIND.keyword, detail: 'Lifecycle zone', documentation: 'Run logic when the component mounts.' },
  { label: '- onUpdate', insertText: '- onUpdate\n  ${1}', kind: KIND.keyword, detail: 'Lifecycle zone', documentation: 'Run logic when the component updates.' },
  { label: '- onUnmount', insertText: '- onUnmount\n  ${1}', kind: KIND.keyword, detail: 'Lifecycle zone', documentation: 'Run cleanup logic when the component unmounts.' },
]

const MARKUP_SNIPPETS: CompletionSpec[] = [
  { label: 'button action', insertText: 'button.${1:button}\n  @click\n    ${2:handleClick()}\n  ${3:Label}', kind: KIND.snippet, detail: 'Button with click handler', documentation: 'Insert a button, click behavior block, and inline label.', filterText: 'button click action', snippet: true },
  { label: 'input field', insertText: 'label\n  span ${1:Label}\n  input\n    :\n      type ${2:text}\n      value {${3:value}}\n      placeholder ${4:Placeholder}', kind: KIND.snippet, detail: 'Labeled input', documentation: 'Insert a label with a configured input data dimension.', filterText: 'input field label form', snippet: true },
  { label: 'each keyed', insertText: 'each ${1:item}, ${2:index} in ${3:items}\n  ${4:div}\n    :\n      key {${1:item}.id}\n    {${1:item}.${5:name}}', kind: KIND.snippet, detail: 'Keyed loop', documentation: 'Insert an `each` loop with a stable key attribute.', filterText: 'each loop keyed map', snippet: true },
  { label: 'if else', insertText: 'if ${1:condition}\n  ${2:div}\nelse\n  ${3:div}', kind: KIND.snippet, detail: 'Conditional block', documentation: 'Insert an if/else control flow block.', filterText: 'if else conditional', snippet: true },
  { label: 'card section', insertText: 'section.${1:card}\n  ::\n    padding ${2:1rem}\n    border-radius ${3:8px}\n  ${4}', kind: KIND.snippet, detail: 'Styled section', documentation: 'Insert a section with a style dimension.', filterText: 'section card style', snippet: true },
  { label: 'slot named', insertText: 'slot:${1:header}\n  ${2:h2} ${3:Title}', kind: KIND.snippet, detail: 'Named slot', documentation: 'Insert named slot content or a named slot placeholder.', filterText: 'slot named header', snippet: true },
]

const HTML_ELEMENTS: CompletionSpec[] = [
  ['div', 'Generic container'], ['span', 'Inline text container'], ['p', 'Paragraph'], ['a', 'Anchor link'],
  ['button', 'Button'], ['input', 'Input control'], ['form', 'Form'], ['label', 'Form label'],
  ['ul', 'Unordered list'], ['ol', 'Ordered list'], ['li', 'List item'], ['h1', 'Heading 1'],
  ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'],
  ['h6', 'Heading 6'], ['section', 'Section'], ['article', 'Article'], ['nav', 'Navigation'],
  ['header', 'Header'], ['footer', 'Footer'], ['main', 'Main landmark'], ['aside', 'Aside landmark'],
  ['table', 'Table'], ['thead', 'Table head'], ['tbody', 'Table body'], ['tr', 'Table row'],
  ['td', 'Table cell'], ['th', 'Table header cell'], ['img', 'Image'], ['svg', 'SVG root'],
  ['path', 'SVG path'], ['textarea', 'Textarea'], ['select', 'Select'], ['option', 'Option'],
  ['fieldset', 'Fieldset'], ['legend', 'Legend'], ['details', 'Details'], ['summary', 'Summary'],
  ['dialog', 'Dialog'], ['canvas', 'Canvas'], ['video', 'Video'], ['audio', 'Audio'],
  ['element', 'Polymorphic element. Use `: as {expr}` to choose the runtime tag.'],
].map(([label, detail]) => ({
  label,
  insertText: label,
  kind: label === 'element' ? KIND.keyword : KIND.class,
  detail,
  documentation: `Insert Loom markup element \`${label}\`.`,
  commitCharacters: ['.', '#', ' ', '\n'],
}))

const CONTROL_COMPLETIONS: CompletionSpec[] = [
  { label: 'if', insertText: 'if ${1:condition}\n  ${2:div}', kind: KIND.keyword, detail: 'Conditional block', documentation: 'Render children when the condition is truthy.', snippet: true },
  { label: 'else if', insertText: 'else if ${1:condition}\n  ${2:div}', kind: KIND.keyword, detail: 'Conditional branch', documentation: 'Add an else-if branch after an if block.', snippet: true },
  { label: 'else', insertText: 'else\n  ${1:div}', kind: KIND.keyword, detail: 'Fallback branch', documentation: 'Add an else branch after an if or else-if block.', snippet: true },
  { label: 'each', insertText: 'each ${1:item} in ${2:items}\n  ${3:div} {${1:item}}', kind: KIND.keyword, detail: 'Loop block', documentation: 'Loop over a list in markup.', snippet: true },
  { label: 'slot', insertText: 'slot${1::name}', kind: KIND.keyword, detail: 'Slot placeholder/content', documentation: 'Declare a default or named slot.', snippet: true },
  { label: ':', insertText: ':\n  ${1:class} ${2:value}', kind: KIND.operator, detail: 'Data dimension', documentation: 'Add attributes to the current element.', snippet: true },
  { label: '::', insertText: '::\n  ${1:display} ${2:flex}', kind: KIND.operator, detail: 'Style dimension', documentation: 'Add scoped CSS to the current element.', snippet: true },
  { label: '@click', insertText: '@click\n  ${1:handleClick()}', kind: KIND.event, detail: 'Event dimension', documentation: 'Add a click behavior block.', filterText: '@ click event', snippet: true },
]

const COMMON_ATTRS: CompletionSpec[] = [
  { label: 'class', insertText: 'class ${1:name}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Static class attribute.', snippet: true },
  { label: 'id', insertText: 'id ${1:value}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Static id attribute.', snippet: true },
  { label: 'key', insertText: 'key {${1:id}}', kind: KIND.field, detail: 'Reconciliation key', documentation: 'Stable key for loop children.', snippet: true },
  { label: 'as', insertText: 'as {${1:tag}}', kind: KIND.field, detail: 'Polymorphic tag', documentation: 'Runtime tag expression for `element`.', snippet: true },
  { label: '...spread', insertText: '...{${1:props}}', kind: KIND.operator, detail: 'Attribute spread', documentation: 'Spread all attributes from an expression.', filterText: 'spread props attributes', snippet: true },
  { label: 'type', insertText: 'type ${1:button}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Input or button type.', snippet: true },
  { label: 'value', insertText: 'value {${1:value}}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Dynamic value attribute.', snippet: true },
  { label: 'placeholder', insertText: 'placeholder ${1:Text}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Input placeholder text.', snippet: true },
  { label: 'disabled', insertText: 'disabled {${1:isDisabled}}', kind: KIND.field, detail: 'Boolean attribute', documentation: 'Disable a control dynamically.', snippet: true },
  { label: 'href', insertText: 'href ${1:#}', kind: KIND.field, detail: 'Anchor attribute', documentation: 'Link destination.', snippet: true },
  { label: 'src', insertText: 'src ${1:/image.png}', kind: KIND.field, detail: 'Media attribute', documentation: 'Media source URL.', snippet: true },
  { label: 'alt', insertText: 'alt ${1:Description}', kind: KIND.field, detail: 'Image attribute', documentation: 'Accessible image alternative text.', snippet: true },
  { label: 'target', insertText: 'target ${1:_blank}', kind: KIND.field, detail: 'Anchor attribute', documentation: 'Link browsing context.', snippet: true },
  { label: 'rel', insertText: 'rel ${1:noreferrer}', kind: KIND.field, detail: 'Anchor attribute', documentation: 'Link relationship.', snippet: true },
  { label: 'role', insertText: 'role ${1:button}', kind: KIND.field, detail: 'ARIA role', documentation: 'Accessibility role.', snippet: true },
  { label: 'aria-label', insertText: 'aria-label ${1:Label}', kind: KIND.field, detail: 'ARIA attribute', documentation: 'Accessible label.', snippet: true },
  { label: 'aria-hidden', insertText: 'aria-hidden ${1:true}', kind: KIND.field, detail: 'ARIA attribute', documentation: 'Hide decorative content from assistive tech.', snippet: true },
  { label: 'tabindex', insertText: 'tabindex ${1:0}', kind: KIND.field, detail: 'HTML attribute', documentation: 'Keyboard tab order.', snippet: true },
  { label: 'data-testid', insertText: 'data-testid ${1:id}', kind: KIND.field, detail: 'Testing attribute', documentation: 'Stable selector for tests.', snippet: true },
]

const TAG_ATTRS: Record<string, string[]> = {
  a: ['href', 'target', 'rel', 'aria-label'],
  button: ['type', 'disabled', 'aria-label'],
  form: ['method', 'action', 'novalidate'],
  img: ['src', 'alt', 'loading', 'width', 'height'],
  input: ['type', 'name', 'value', 'placeholder', 'disabled', 'checked', 'required'],
  label: ['for'],
  option: ['value', 'selected', 'disabled'],
  select: ['name', 'value', 'disabled', 'required'],
  textarea: ['name', 'value', 'placeholder', 'disabled', 'required', 'rows'],
  video: ['src', 'controls', 'autoplay', 'muted', 'loop', 'poster'],
  audio: ['src', 'controls', 'autoplay', 'muted', 'loop'],
  element: ['as', 'class', 'id'],
}

const COMMON_EVENTS: CompletionSpec[] = [
  ['click', 'Mouse click'], ['dblclick', 'Double click'], ['submit', 'Form submit'], ['change', 'Value change'],
  ['input', 'Input value change'], ['focus', 'Focus'], ['blur', 'Blur'], ['keydown', 'Key down'],
  ['keyup', 'Key up'], ['mouseenter', 'Mouse enter'], ['mouseleave', 'Mouse leave'], ['scroll', 'Scroll'],
  ['pointerdown', 'Pointer down'], ['pointerup', 'Pointer up'], ['pointermove', 'Pointer move'], ['dragstart', 'Drag start'],
  ['drop', 'Drop'], ['load', 'Load'], ['error', 'Error'],
].map(([event, detail]) => ({
  label: `@${event}`,
  insertText: `@${event}\n  \${1:${defaultHandlerForEvent(event)}}`,
  kind: KIND.event,
  detail,
  documentation: `Insert an \`@${event}\` behavior block.`,
  filterText: `${event} @${event}`,
  snippet: true,
}))

const MODIFIERS: CompletionSpec[] = [
  { label: 'prevent', kind: KIND.keyword, detail: 'Prevent default', documentation: 'Calls `e.preventDefault()` before running the handler.' },
  { label: 'stop', kind: KIND.keyword, detail: 'Stop propagation', documentation: 'Calls `e.stopPropagation()` before running the handler.' },
  { label: 'self', kind: KIND.keyword, detail: 'Current target only', documentation: 'Only fires when `e.target === e.currentTarget`.' },
  { label: 'enter', kind: KIND.keyword, detail: 'Enter key filter', documentation: 'Only fires for the Enter key.' },
  { label: 'escape', kind: KIND.keyword, detail: 'Escape key filter', documentation: 'Only fires for the Escape key.' },
  { label: 'tab', kind: KIND.keyword, detail: 'Tab key filter', documentation: 'Only fires for the Tab key.' },
  { label: 'space', kind: KIND.keyword, detail: 'Space key filter', documentation: 'Only fires for the Space key.' },
  { label: 'once', kind: KIND.keyword, detail: 'Once modifier', documentation: 'Vue/Svelte native once behavior. React target drops this with a warning.' },
  { label: 'passive', kind: KIND.keyword, detail: 'Passive modifier', documentation: 'Vue/Svelte passive listener. React target drops this with a warning.' },
  { label: 'capture', kind: KIND.keyword, detail: 'Capture modifier', documentation: 'Vue/Svelte capture listener. React target drops this with a warning.' },
]

const STYLE_COMPLETIONS: CompletionSpec[] = [
  { label: '&:hover', insertText: '&:hover\n  ${1:background} ${2:#f5f5f5}', kind: KIND.snippet, detail: 'Nested hover selector', documentation: 'Add a hover rule for the current element.', snippet: true },
  { label: '@media', insertText: '@media (${1:max-width: 768px})\n  ${2:padding} ${3:0.5rem}', kind: KIND.snippet, detail: 'Media query', documentation: 'Add a responsive nested style rule.', snippet: true },
  { label: ':global', insertText: ':global(${1:.dark}) &\n  ${2:color} ${3:white}', kind: KIND.snippet, detail: 'Global selector', documentation: 'Target global CSS context without scoping.', snippet: true },
  ...[
    ['display', 'flex'], ['position', 'relative'], ['inset', '0'], ['width', '100%'], ['height', '100%'],
    ['margin', '0'], ['padding', '1rem'], ['gap', '0.5rem'], ['grid-template-columns', 'repeat(3, minmax(0, 1fr))'],
    ['align-items', 'center'], ['justify-content', 'center'], ['color', '#111827'], ['background', '#ffffff'],
    ['border', '1px solid #d1d5db'], ['border-radius', '8px'], ['box-shadow', '0 1px 2px rgb(0 0 0 / 0.08)'],
    ['font-size', '1rem'], ['font-weight', '600'], ['line-height', '1.5'], ['overflow', 'hidden'],
    ['opacity', '1'], ['transform', 'translateY(0)'], ['transition', '150ms ease'],
  ].map(([prop, value]) => ({
    label: prop,
    insertText: `${prop} \${1:${value}}`,
    kind: KIND.property,
    detail: 'CSS property',
    documentation: `Insert \`${prop}\` style declaration.`,
    snippet: true,
  })),
]

const EXPRESSION_HELPERS: CompletionSpec[] = [
  { label: 'String()', insertText: 'String(${1:value})', kind: KIND.function, detail: 'JavaScript helper', documentation: 'Convert a value to a string.', snippet: true },
  { label: 'Number()', insertText: 'Number(${1:value})', kind: KIND.function, detail: 'JavaScript helper', documentation: 'Convert a value to a number.', snippet: true },
  { label: 'Boolean()', insertText: 'Boolean(${1:value})', kind: KIND.function, detail: 'JavaScript helper', documentation: 'Convert a value to a boolean.', snippet: true },
  { label: 'items.map()', insertText: '${1:items}.map((${2:item}) => ${3:item})', kind: KIND.function, detail: 'Array map expression', documentation: 'Map over an array expression.', snippet: true, filterText: 'map array items' },
]

export function buildCompletions(text: string, position: LspPosition): LoomCompletionItem[] {
  const lines = text.split('\n')
  const context = getCompletionContext(lines, position)
  const symbols = collectCompletionSymbols(text)
  const replaceRange = {
    start: { line: position.line, character: context.replaceFrom },
    end: position,
  }

  const make = (spec: CompletionSpec, rank: string): LoomCompletionItem => ({
    label: spec.label,
    kind: spec.kind,
    detail: spec.detail,
    documentation: { kind: 'markdown', value: spec.documentation },
    insertText: spec.insertText ?? spec.label,
    insertTextFormat: spec.snippet || spec.insertText?.includes('${') ? SNIPPET : 1,
    filterText: spec.filterText,
    sortText: rank,
    commitCharacters: spec.commitCharacters,
    textEdit: { range: replaceRange, newText: spec.insertText ?? spec.label },
  })

  if (context.mode === 'zone') {
    return ZONE_COMPLETIONS.map((spec, i) => make(spec, `a${pad(i)}`))
  }

  if (context.mode === 'eventModifier') {
    return MODIFIERS.map((spec, i) => make(spec, `a${pad(i)}`))
  }

  if (context.mode === 'event') {
    return COMMON_EVENTS.map((spec, i) => make(spec, `a${pad(i)}`))
  }

  if (context.mode === 'data') {
    return uniqCompletions([
      ...tagAttributeCompletions(context.activeTag),
      ...COMMON_ATTRS,
      ...symbolValueCompletions(symbols, 'attribute'),
    ]).map((spec, i) => make(spec, `a${pad(i)}`))
  }

  if (context.mode === 'style') {
    return STYLE_COMPLETIONS.map((spec, i) => make(spec, `a${pad(i)}`))
  }

  if (context.mode === 'expression') {
    return [
      ...symbolValueCompletions(symbols, 'expression'),
      ...EXPRESSION_HELPERS,
    ].map((spec, i) => make(spec, `a${pad(i)}`))
  }

  return uniqCompletions([
    ...MARKUP_SNIPPETS,
    ...CONTROL_COMPLETIONS,
    ...componentCompletions(symbols.components),
    ...HTML_ELEMENTS,
  ]).map((spec, i) => make(spec, `a${pad(i)}`))
}

function getCompletionContext(lines: string[], position: LspPosition): CompletionContext {
  const line = lines[position.line] ?? ''
  const beforeCursor = line.slice(0, position.character)
  const indent = line.match(/^(\s*)/)?.[1] ?? ''
  const trimmed = beforeCursor.trimStart()
  const replaceFrom = getReplacementStart(beforeCursor)
  const activeTag = findActiveElementTag(lines, position.line, indent.length)

  if (/^-\s*\w*$/.test(trimmed)) {
    return { mode: 'zone', line, beforeCursor, indent, replaceFrom: indent.length, position, activeTag }
  }

  if (isInsideBraceExpression(beforeCursor)) {
    const brace = beforeCursor.lastIndexOf('{')
    return { mode: 'expression', line, beforeCursor, indent, replaceFrom: brace + 1, position, activeTag }
  }

  const eventMatch = trimmed.match(/^@[\w-]*(?:\.[\w-]*)*\.([\w-]*)$/)
  if (eventMatch) {
    return { mode: 'eventModifier', line, beforeCursor, indent, replaceFrom: beforeCursor.lastIndexOf('.') + 1, position, activeTag }
  }
  if (/^@[\w-]*$/.test(trimmed)) {
    return { mode: 'event', line, beforeCursor, indent, replaceFrom: indent.length, position, activeTag }
  }

  const block = findContainingBlock(lines, position.line, indent.length)
  if (block === ':') {
    return { mode: 'data', line, beforeCursor, indent, replaceFrom, position, activeTag }
  }
  if (block === '::') {
    return { mode: 'style', line, beforeCursor, indent, replaceFrom, position, activeTag }
  }
  if (block === '@') {
    return { mode: 'expression', line, beforeCursor, indent, replaceFrom, position, activeTag }
  }

  return { mode: 'markup', line, beforeCursor, indent, replaceFrom, position, activeTag }
}

function getReplacementStart(beforeCursor: string): number {
  const match = beforeCursor.match(/[A-Za-z_$@:.#-][\w$@:.#-]*$/)
  return match?.index ?? beforeCursor.length
}

function isInsideBraceExpression(beforeCursor: string): boolean {
  return beforeCursor.lastIndexOf('{') > beforeCursor.lastIndexOf('}')
}

function findContainingBlock(lines: string[], lineIndex: number, indentLength: number): ':' | '::' | '@' | undefined {
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line.trim() === '') continue

    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    if (indent >= indentLength) continue

    const trimmed = line.trim()
    if (trimmed === ':') return ':'
    if (trimmed === '::') return '::'
    if (/^@[\w-]/.test(trimmed)) return '@'
    return undefined
  }
  return undefined
}

function findActiveElementTag(lines: string[], lineIndex: number, indentLength: number): string | undefined {
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line.trim() === '') continue

    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    if (indent >= indentLength) continue

    const trimmed = line.trim()
    if (trimmed === ':' || trimmed === '::' || /^@/.test(trimmed)) continue
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)/)
    return match?.[1]
  }
  return undefined
}

function collectCompletionSymbols(text: string) {
  const props = new Set<string>()
  const state = new Set<string>()
  const computed = new Set<string>()
  const locals = new Set<string>()
  const components = new Set<string>()

  try {
    const file = parse(text)
    for (const prop of file.props ?? []) props.add(prop.name)
    for (const entry of file.state ?? []) state.add(entry.name)
    for (const entry of file.computed ?? []) computed.add(entry.name)
    for (const node of file.markup ?? []) collectMarkupSymbols(node, locals, components)
  } catch {
    collectSymbolsFallback(text, props, state, computed, components)
  }

  for (const match of text.matchAll(/import\s+(?:\{[^}]*\}\s+from\s+['"][^'"]+['"]|([A-Z][A-Za-z0-9]*)\s+from\s+['"][^'"]+['"])/g)) {
    if (match[1]) components.add(match[1])
    const named = match[0].match(/\{([^}]*)\}/)?.[1]
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()
        if (name && /^[A-Z]/.test(name)) components.add(name)
      }
    }
  }

  return { props, state, computed, locals, components }
}

function collectMarkupSymbols(node: MarkupNode, locals: Set<string>, components: Set<string>) {
  if (node.kind === 'element') {
    if (/^[A-Z]/.test(node.tag)) components.add(node.tag)
    for (const child of node.children) collectMarkupSymbols(child, locals, components)
    return
  }

  if (node.kind === 'each') {
    locals.add(node.item)
    if (node.index) locals.add(node.index)
    for (const child of node.children) collectMarkupSymbols(child, locals, components)
    return
  }

  if (node.kind === 'if' || node.kind === 'elseif') {
    for (const child of node.consequent) collectMarkupSymbols(child, locals, components)
    if (node.alternate) collectMarkupSymbols(node.alternate, locals, components)
    return
  }

  if (node.kind === 'else' || node.kind === 'slot-use') {
    for (const child of node.children) collectMarkupSymbols(child, locals, components)
  }
}

function collectSymbolsFallback(
  text: string,
  props: Set<string>,
  state: Set<string>,
  computed: Set<string>,
  components: Set<string>,
) {
  let zone = ''
  for (const rawLine of text.split('\n')) {
    const zoneMatch = rawLine.match(/^- (props|state|computed|view|ts|js)\b/)
    if (zoneMatch) {
      zone = zoneMatch[1] ?? ''
      continue
    }
    const trimmed = rawLine.trim()
    if (zone === 'props') trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1] && props.add(trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/)![1]!)
    if (zone === 'state') trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1] && state.add(trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/)![1]!)
    if (zone === 'computed') trimmed.match(/^([A-Za-z_$][\w$]*)\s*=/)?.[1] && computed.add(trimmed.match(/^([A-Za-z_$][\w$]*)\s*=/)![1]!)
    const component = trimmed.match(/^([A-Z][A-Za-z0-9]*)/)?.[1]
    if (component) components.add(component)
  }
}

function symbolValueCompletions(
  symbols: ReturnType<typeof collectCompletionSymbols>,
  context: 'attribute' | 'expression',
): CompletionSpec[] {
  const wrap = context === 'attribute'
  const specs: CompletionSpec[] = []
  for (const [source, names] of [
    ['prop', symbols.props],
    ['state', symbols.state],
    ['computed', symbols.computed],
    ['local', symbols.locals],
  ] as const) {
    for (const name of names) {
      specs.push({
        label: name,
        insertText: wrap ? `{${name}}` : name,
        kind: source === 'local' ? KIND.variable : KIND.value,
        detail: `Loom ${source}`,
        documentation: `Insert ${source} symbol \`${name}\`.`,
      })
    }
  }
  return specs
}

function componentCompletions(components: Set<string>): CompletionSpec[] {
  return Array.from(components).sort().map((name) => ({
    label: name,
    insertText: name,
    kind: KIND.class,
    detail: 'Component',
    documentation: `Insert component \`${name}\`.`,
    commitCharacters: ['.', '#', ' ', '\n'],
  }))
}

function tagAttributeCompletions(tag: string | undefined): CompletionSpec[] {
  const attrs = tag ? TAG_ATTRS[tag] ?? [] : []
  return attrs.map((attr) => ({
    label: attr,
    insertText: attr === 'as'
      ? 'as {${1:tag}}'
      : attr === 'key'
        ? 'key {${1:id}}'
        : `${attr} \${1:value}`,
    kind: KIND.field,
    detail: tag ? `<${tag}> attribute` : 'HTML attribute',
    documentation: `Insert \`${attr}\` attribute${tag ? ` for \`${tag}\`` : ''}.`,
    snippet: true,
  }))
}

function uniqCompletions(specs: CompletionSpec[]): CompletionSpec[] {
  const seen = new Set<string>()
  return specs.filter((spec) => {
    const key = spec.label
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function defaultHandlerForEvent(event: string): string {
  if (event === 'submit') return 'handleSubmit()'
  if (event === 'input' || event === 'change') return 'handleChange()'
  if (event === 'keydown' || event === 'keyup') return 'handleKey()'
  return 'handle' + event.slice(0, 1).toUpperCase() + event.slice(1) + '()'
}

function pad(value: number): string {
  return String(value).padStart(3, '0')
}
