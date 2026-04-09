import { tokenize, TK, type Token } from './lexer.js'
import { findTopLevelEquals, findTopLevelWhitespace, unwrapBalancedBraces } from './expr.js'
import type {
  LoomFile,
  PropDecl,
  MarkupNode,
  ElementNode,
  DataAttr,
  StyleRule,
  CSSDecl,
  NestedRule,
  BehaviorBlock,
  ControlNode,
  IfNode,
  ElseIfNode,
  ElseNode,
  EachNode,
  TextNode,
  SlotDefNode,
  SlotUseNode,
  CommentNode,
  StyleBlock,
  SourceSpan,
} from './ast.js'

// ─── Parse errors ─────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    public readonly message: string,
    public readonly span: SourceSpan,
  ) {
    super(`Line ${span.start.line}:${span.start.column}: ${message}`)
  }

  get line() {
    return this.span.start.line
  }
}

// ─── Token stream helper ──────────────────────────────────────────────────────

class TokenStream {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  consume(): Token {
    const t = this.tokens[this.pos]
    this.pos++
    return t
  }

  /** Skip NEWLINE tokens */
  skipNewlines() {
    while (this.peek().type === TK.NEWLINE) this.consume()
  }

  is(type: TK, offset = 0): boolean {
    return this.peek(offset).type === type
  }

  expect(type: TK): Token {
    const t = this.peek()
    if (t.type !== type) {
      throw new ParseError(`Expected ${type} but got ${t.type} ("${t.value}")`, t.span)
    }
    return this.consume()
  }
}

function mergeSpans(...spans: Array<SourceSpan | undefined>): SourceSpan | undefined {
  const defined = spans.filter((span): span is SourceSpan => span !== undefined)
  if (defined.length === 0) return undefined

  return defined.reduce((acc, span) => ({
    start:
      span.start.offset < acc.start.offset
        ? span.start
        : acc.start,
    end:
      span.end.offset > acc.end.offset
        ? span.end
        : acc.end,
  }))
}

function spanFromNodes(nodes: Array<{ span?: SourceSpan }>): SourceSpan | undefined {
  return mergeSpans(...nodes.map((node) => node.span))
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function parse(src: string): LoomFile {
  const { tokens, errors } = tokenize(src)
  if (errors.length > 0) {
    const error = errors[0]
    throw new ParseError(error.message, error.span ?? tokens[0]?.span ?? {
      start: { line: error.line, column: 1, offset: 0 },
      end: { line: error.line, column: 1, offset: 0 },
    })
  }

  const stream = new TokenStream(tokens)
  return parseFile(stream)
}

// ─── File-level parser ────────────────────────────────────────────────────────

function parseFile(s: TokenStream): LoomFile {
  const file: LoomFile = {}
  const rawZones: Map<string, Token[]> = new Map()

  while (!s.is(TK.EOF)) {
    s.skipNewlines()
    if (s.is(TK.EOF)) break

    if (s.is(TK.CONTEXT_SWITCH)) {
      const switchTok = s.consume()
      const zoneName = switchTok.value

      if (zoneName === 'pug') {
        s.skipNewlines()
        file.markup = parseMarkupChildren(s, 0)
      } else {
        const lines: Token[] = []
        while (!s.is(TK.EOF) && !s.is(TK.CONTEXT_SWITCH)) {
          if (s.is(TK.RAW_LINE)) {
            lines.push(s.consume())
          } else if (s.is(TK.NEWLINE)) {
            lines.push(s.consume())
          } else {
            lines.push(s.consume())
          }
        }
        rawZones.set(zoneName, lines)
      }
    } else {
      file.markup = parseMarkupChildren(s, 0)
      break
    }
  }

  if (rawZones.has('generics')) {
    const genericsTokens = rawZones.get('generics')!
    file.generics = joinRawZone(genericsTokens).trim()
    file.span = mergeSpans(file.span, mergeSpans(...genericsTokens.map((token) => token.span)))
  }

  if (rawZones.has('props')) {
    file.props = parsePropsZone(rawZones.get('props')!)
  }

  if (rawZones.has('ts')) {
    const tokens = trimTrailingBlankTokens(rawZones.get('ts')!)
    file.logic = {
      lang: 'ts',
      src: joinRawZone(tokens),
      span: mergeSpans(...tokens.map((token) => token.span)),
    }
  } else if (rawZones.has('js')) {
    const tokens = trimTrailingBlankTokens(rawZones.get('js')!)
    file.logic = {
      lang: 'js',
      src: joinRawZone(tokens),
      span: mergeSpans(...tokens.map((token) => token.span)),
    }
  }

  file.span = mergeSpans(file.span, spanFromNodes(file.props ?? []), file.logic?.span, spanFromNodes(file.markup ?? []))

  return file
}

function trimTrailingBlankTokens(lines: Token[]): Token[] {
  let end = lines.length
  while (end > 0 && lines[end - 1].value.trim() === '') end--
  return lines.slice(0, end)
}

function joinRawZone(lines: Token[]): string {
  return lines.map((line) => line.value).join('\n')
}

// ─── Props zone parser ────────────────────────────────────────────────────────

function parsePropsZone(lines: Token[]): PropDecl[] {
  const props: PropDecl[] = []
  for (const line of lines) {
    const trimmed = line.value.trim()
    if (!trimmed || trimmed.startsWith('//')) continue

    const eqIdx = findTopLevelEquals(trimmed)
    let typePart: string
    let defaultValue: string | undefined

    if (eqIdx !== -1) {
      typePart = trimmed.slice(0, eqIdx).trim()
      defaultValue = trimmed.slice(eqIdx + 1).trim()
    } else {
      typePart = trimmed
    }

    const colonIdx = typePart.indexOf(':')
    if (colonIdx === -1) {
      // prop without explicit type
      props.push({ span: line.span, name: typePart.trim(), type: 'any', defaultValue })
    } else {
      const name = typePart.slice(0, colonIdx).trim()
      const type = typePart.slice(colonIdx + 1).trim()
      props.push({ span: line.span, name, type, defaultValue })
    }
  }
  return props
}

// ─── Markup parser ────────────────────────────────────────────────────────────

/**
 * Parse sibling markup nodes at `baseIndent`.
 * Returns when it encounters a token at indent < baseIndent, a DEDENT, or EOF.
 */
function parseMarkupChildren(s: TokenStream, baseIndent: number): MarkupNode[] {
  return parseMarkupChildrenWithOptions(s, baseIndent, false)
}

function parseMarkupChildrenWithOptions(
  s: TokenStream,
  baseIndent: number,
  allowControlContinuation: boolean,
): MarkupNode[] {
  const nodes: MarkupNode[] = []

  while (true) {
    s.skipNewlines()
    if (s.is(TK.EOF) || s.is(TK.CONTEXT_SWITCH)) break
    if (s.is(TK.DEDENT)) break

    const tok = s.peek()

    // Stop if this token is at a shallower indent than our expected base
    if (tok.indent < baseIndent) break

    switch (tok.type) {
      case TK.COMMENT: {
        const t = s.consume()
        nodes.push({ kind: 'comment', value: t.value, span: t.span } as CommentNode)
        break
      }

      case TK.CONTROL_IF: {
        nodes.push(parseIf(s))
        break
      }

      case TK.CONTROL_ELSEIF:
      case TK.CONTROL_ELSE:
        if (allowControlContinuation) return nodes
        nodes.push(tok.type === TK.CONTROL_ELSEIF ? parseElseIf(s) : parseElseNode(s))
        break

      case TK.CONTROL_EACH: {
        nodes.push(parseEach(s))
        break
      }

      case TK.SLOT: {
        nodes.push(parseSlot(s))
        break
      }

      case TK.TAG:
      case TK.COMPONENT: {
        nodes.push(parseElement(s))
        break
      }

      case TK.TEXT: {
        const t = s.consume()
        nodes.push({ kind: 'text', value: t.value, span: t.span } as TextNode)
        break
      }

      default:
        // Unknown token at this level — skip to avoid infinite loop
        s.consume()
    }
  }

  return nodes
}

// ─── Element parser ───────────────────────────────────────────────────────────

function parseElement(s: TokenStream): ElementNode {
  const tagTok = s.consume() // TAG or COMPONENT
  const { tag, classes, id, inlineText } = parseTagSelector(tagTok.value, tagTok.span)
  const elemIndent = tagTok.indent

  const node: ElementNode = {
    span: tagTok.span,
    kind: 'element',
    tag,
    classes,
    id,
    children: [],
  }

  // If there's inline text after the tag (e.g. "p Hello world"), add as text child
  if (inlineText) {
    node.children.push({
      kind: 'text',
      value: inlineText.value,
      span: inlineText.span,
    } as TextNode)
  }

  // Look for dimensions and children in the indented block
  s.skipNewlines()

  if (s.is(TK.INDENT)) {
    s.consume() // eat INDENT
    parseDimensionsAndChildren(s, node, elemIndent)
    if (s.is(TK.DEDENT)) s.consume()
  }

  node.span = mergeSpans(node.span, spanFromNodes(node.data ?? []), spanFromNodes(node.styles ?? []), spanFromNodes(node.behaviors ?? []), spanFromNodes(node.children))

  return node
}

function parseDimensionsAndChildren(s: TokenStream, node: ElementNode, _parentIndent: number) {
  while (true) {
    s.skipNewlines()
    if (s.is(TK.EOF) || s.is(TK.DEDENT) || s.is(TK.CONTEXT_SWITCH)) break

    const tok = s.peek()

    if (tok.type === TK.DIMENSION_DATA) {
      s.consume() // ":"
      node.data = parseDataDimension(s)
    } else if (tok.type === TK.DIMENSION_STYLE) {
      s.consume() // "::"
      node.styles = parseStyleDimension(s)
    } else if (tok.type === TK.DIMENSION_BEHAVIOR) {
      if (!node.behaviors) node.behaviors = []
      node.behaviors.push(parseBehaviorDimension(s))
    } else {
      // Child nodes
      const children = parseMarkupChildren(s, tok.indent)
      node.children.push(...children)
      break
    }
  }
}

// ─── Tag selector parser ──────────────────────────────────────────────────────

type TagSelectorResult = {
  tag: string
  classes: string[]
  id?: string
  inlineText?: {
    value: string
    span: SourceSpan
  }
}

function parseTagSelector(raw: string, lineSpan?: SourceSpan): TagSelectorResult {
  let selectorEnd = 0
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === ' ') {
      selectorEnd = i
      break
    }
    selectorEnd = i + 1
  }

  const selector = raw.slice(0, selectorEnd)
  const inlineTextRaw = raw.slice(selectorEnd)
  const inlineTextValue = inlineTextRaw.trim()
  const inlineText = inlineTextValue && lineSpan
    ? {
        value: inlineTextValue,
        span: {
          start: {
            line: lineSpan.start.line,
            column: lineSpan.start.column + inlineTextRaw.indexOf(inlineTextValue),
            offset: lineSpan.start.offset + inlineTextRaw.indexOf(inlineTextValue),
          },
          end: lineSpan.end,
        },
      }
    : undefined

  const parts = selector.split(/(?=[.#])/)
  let tag = parts[0] || 'div'
  if (tag === '' || tag === '.' || tag === '#') tag = 'div'

  const classes: string[] = []
  let id: string | undefined

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    if (part.startsWith('.')) classes.push(part.slice(1))
    else if (part.startsWith('#')) id = part.slice(1)
  }

  return { tag, classes, id, inlineText }
}

// ─── Data dimension parser ────────────────────────────────────────────────────

function parseDataDimension(s: TokenStream): DataAttr[] {
  const attrs: DataAttr[] = []

  s.skipNewlines()
  if (!s.is(TK.INDENT)) return attrs
  s.consume() // INDENT

  while (!s.is(TK.DEDENT) && !s.is(TK.EOF)) {
    s.skipNewlines()
    if (s.is(TK.DEDENT) || s.is(TK.EOF)) break

    const tok = s.consume()
    const line = tok.value.trim()

    if (!line) continue

    if (line.startsWith('...')) {
      attrs.push({ kind: 'spread', expr: line.slice(3), span: tok.span })
      continue
    }

    if (line.startsWith('as ')) {
      const expr = unwrapBalancedBraces(line.slice(3))
      if (expr !== null) {
        attrs.push({ kind: 'as', expr, span: tok.span })
        continue
      }
    }

    const spaceIdx = findTopLevelWhitespace(line)
    if (spaceIdx !== -1) {
      const name = line.slice(0, spaceIdx)
      const value = line.slice(spaceIdx + 1).trim()
      const dynamicExpr = unwrapBalancedBraces(value)
      if (dynamicExpr !== null) {
        attrs.push({ kind: 'dynamic', name, expr: dynamicExpr, span: tok.span })
        continue
      }

      if (value.startsWith('"') && value.endsWith('"')) {
        attrs.push({ kind: 'static', name, value: value.slice(1, -1), span: tok.span })
        continue
      }

      attrs.push({ kind: 'static', name, value, span: tok.span })
      continue
    }

    attrs.push({ kind: 'static', name: line, value: '', span: tok.span })
  }

  if (s.is(TK.DEDENT)) s.consume()
  return attrs
}

// ─── Style dimension parser ───────────────────────────────────────────────────

function parseStyleDimension(s: TokenStream): StyleBlock {
  s.skipNewlines()
  if (!s.is(TK.INDENT)) return []
  s.consume() // INDENT
  const rules = parseStyleRules(s)
  if (s.is(TK.DEDENT)) s.consume()
  return rules
}

function parseStyleRules(s: TokenStream): StyleRule[] {
  const rules: StyleRule[] = []

  while (!s.is(TK.DEDENT) && !s.is(TK.EOF)) {
    s.skipNewlines()
    if (s.is(TK.DEDENT) || s.is(TK.EOF)) break

    const tok = s.peek()
    const line = tok.value.trim()

    if (!line) { s.consume(); continue }

    // Nested selector or @media: starts with &, @, or :global
    if (line.startsWith('&') || line.startsWith('@') || line.startsWith(':global')) {
      s.consume() // consume the selector token
      s.skipNewlines()

      const nestedRules: StyleRule[] = []
      if (s.is(TK.INDENT)) {
        s.consume()
        nestedRules.push(...parseStyleRules(s))
        if (s.is(TK.DEDENT)) s.consume()
      }

      rules.push({
        kind: 'nested',
        selector: line,
        rules: nestedRules,
        span: mergeSpans(tok.span, spanFromNodes(nestedRules)),
      } as NestedRule)
    } else {
      s.consume()
      const spaceIdx = findTopLevelWhitespace(line)
      if (spaceIdx !== -1) {
        rules.push({
          kind: 'decl',
          prop: line.slice(0, spaceIdx),
          value: line.slice(spaceIdx + 1).trim(),
          span: tok.span,
        } as CSSDecl)
      }
    }
  }

  return rules
}

// ─── Behavior dimension parser ────────────────────────────────────────────────

function parseBehaviorDimension(s: TokenStream): BehaviorBlock {
  const tok = s.consume() // DIMENSION_BEHAVIOR token e.g. "@click.prevent"
  const raw = tok.value.slice(1) // strip "@"

  const [eventPart, ...modParts] = raw.split('.')
  const event = eventPart
  const modifiers = modParts

  const bodyLines: string[] = []
  const bodySpans: SourceSpan[] = []
  s.skipNewlines()
  if (s.is(TK.INDENT)) {
    s.consume()
    while (!s.is(TK.DEDENT) && !s.is(TK.EOF)) {
      if (s.is(TK.NEWLINE)) {
        bodyLines.push('')
        bodySpans.push(s.consume().span)
        continue
      }
      const t = s.consume()
      bodyLines.push(t.value)
      bodySpans.push(t.span)
    }
    if (s.is(TK.DEDENT)) s.consume()
  }

  const body = trimTrailingBlankLinesArr(bodyLines).join('\n')
  return {
    event,
    modifiers,
    body,
    span: mergeSpans(tok.span, ...bodySpans),
  }
}

function trimTrailingBlankLinesArr(lines: string[]): string[] {
  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end--
  return lines.slice(0, end)
}

// ─── Control flow parsers ─────────────────────────────────────────────────────

function parseIf(s: TokenStream): IfNode {
  const tok = s.consume() // CONTROL_IF
  const condition = tok.value.replace(/^if\s+/, '').trim()

  s.skipNewlines()
  let consequent: MarkupNode[] = []
  if (s.is(TK.INDENT)) {
    s.consume()
    consequent = parseMarkupChildrenWithOptions(s, 0, true)
    if (s.is(TK.DEDENT)) s.consume()
  }

  s.skipNewlines()
  let alternate: IfNode['alternate']

  if (s.is(TK.CONTROL_ELSEIF)) {
    alternate = parseElseIf(s)
  } else if (s.is(TK.CONTROL_ELSE)) {
    alternate = parseElseNode(s)
  }

  return {
    kind: 'if',
    condition,
    consequent,
    alternate,
    span: mergeSpans(tok.span, spanFromNodes(consequent), alternate?.span),
  }
}

function parseElseIf(s: TokenStream): ElseIfNode {
  const tok = s.consume() // CONTROL_ELSEIF
  const condition = tok.value.replace(/^else if\s+/, '').trim()

  s.skipNewlines()
  let consequent: MarkupNode[] = []
  if (s.is(TK.INDENT)) {
    s.consume()
    consequent = parseMarkupChildrenWithOptions(s, 0, true)
    if (s.is(TK.DEDENT)) s.consume()
  }

  s.skipNewlines()
  let alternate: ElseIfNode['alternate']

  if (s.is(TK.CONTROL_ELSEIF)) {
    alternate = parseElseIf(s)
  } else if (s.is(TK.CONTROL_ELSE)) {
    alternate = parseElseNode(s)
  }

  return {
    kind: 'elseif',
    condition,
    consequent,
    alternate,
    span: mergeSpans(tok.span, spanFromNodes(consequent), alternate?.span),
  }
}

function parseElseNode(s: TokenStream): ElseNode {
  const tok = s.consume() // CONTROL_ELSE
  s.skipNewlines()
  let children: MarkupNode[] = []
  if (s.is(TK.INDENT)) {
    s.consume()
    children = parseMarkupChildren(s, 0)
    if (s.is(TK.DEDENT)) s.consume()
  }
  return { kind: 'else', children, span: mergeSpans(tok.span, spanFromNodes(children)) }
}

function parseEach(s: TokenStream): EachNode {
  const tok = s.consume() // CONTROL_EACH
  const m = tok.value.match(/^each\s+(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+)$/)
  if (!m) throw new ParseError(`Malformed each: "${tok.value}"`, tok.span)

  const item = m[1]
  const index = m[2]
  const list = m[3].trim()

  s.skipNewlines()
  let children: MarkupNode[] = []
  if (s.is(TK.INDENT)) {
    s.consume()
    children = parseMarkupChildren(s, 0)
    if (s.is(TK.DEDENT)) s.consume()
  }

  return {
    kind: 'each',
    item,
    index,
    list,
    children,
    span: mergeSpans(tok.span, spanFromNodes(children)),
  }
}

// ─── Slot parser ──────────────────────────────────────────────────────────────

function parseSlot(s: TokenStream): SlotDefNode | SlotUseNode {
  const tok = s.consume() // SLOT token e.g. "slot" or "slot:nav"
  const nameMatch = tok.value.match(/^slot:(.+)$/)
  const name = nameMatch ? nameMatch[1] : undefined

  s.skipNewlines()

  // If there are children, it's a slot-use (passing content to a named slot)
  if (s.is(TK.INDENT)) {
    s.consume()
    const children = parseMarkupChildren(s, 0)
    if (s.is(TK.DEDENT)) s.consume()
    return { kind: 'slot-use', name, children, span: mergeSpans(tok.span, spanFromNodes(children)) } as SlotUseNode
  }

  return { kind: 'slot-def', name, span: tok.span } as SlotDefNode
}
