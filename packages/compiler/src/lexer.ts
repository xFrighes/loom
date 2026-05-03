import type { SourcePosition, SourceSpan } from './ast.js'

// ─── Token types ─────────────────────────────────────────────────────────────

export const enum TK {
  CONTEXT_SWITCH = 'CONTEXT_SWITCH', // "- pug", "- ts", etc.
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  NEWLINE = 'NEWLINE',
  DIMENSION_DATA = 'DIMENSION_DATA', // standalone ":"
  DIMENSION_STYLE = 'DIMENSION_STYLE', // standalone "::"
  DIMENSION_BEHAVIOR = 'DIMENSION_BEHAVIOR', // "@click.prevent" etc.
  CONTROL_IF = 'CONTROL_IF',
  CONTROL_ELSEIF = 'CONTROL_ELSEIF',
  CONTROL_ELSE = 'CONTROL_ELSE',
  CONTROL_EACH = 'CONTROL_EACH',
  SLOT = 'SLOT', // "slot" or "slot:name"
  TAG = 'TAG', // "div.card#main"
  COMPONENT = 'COMPONENT', // "UserCard"
  TEXT = 'TEXT', // remaining text content
  COMMENT = 'COMMENT', // "// ..."
  RAW_LINE = 'RAW_LINE', // lines inside raw zones (ts/js/generics/props/@body)
  EOF = 'EOF',
}

export type Token = {
  type: TK
  value: string
  line: number
  col: number
  indent: number
  span: SourceSpan
}

// ─── Zone kinds that capture raw content ─────────────────────────────────────

const CONTEXT_SWITCH_NAMES = new Set([
  'generics',
  'props',
  'state',
  'computed',
  'onMount',
  'onUpdate',
  'onUnmount',
  'ts',
  'js',
  'pug',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function measureIndent(line: string): number {
  let i = 0
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i += line[i] === '\t' ? 2 : 1
  }
  return i
}

function stripIndent(line: string, amount: number): string {
  let removed = 0
  let i = 0
  while (i < line.length && removed < amount) {
    if (line[i] === ' ') {
      removed++
      i++
    } else if (line[i] === '\t') {
      removed += 2
      i++
    } else {
      break
    }
  }
  return line.slice(i)
}

/** Classify a trimmed non-empty line into its token type */
function classifyLine(trimmed: string): TK {
  // Context switch
  if (/^- (generics|props|state|computed|onMount|onUpdate|onUnmount|ts|js|pug)(\s|$)/.test(trimmed))
    return TK.CONTEXT_SWITCH
  // Comments
  if (trimmed.startsWith('//')) return TK.COMMENT
  // Dimension openers
  if (trimmed === '::') return TK.DIMENSION_STYLE
  if (trimmed === ':') return TK.DIMENSION_DATA
  if (/^@[\w]/.test(trimmed)) return TK.DIMENSION_BEHAVIOR
  // Control flow
  if (/^if\s/.test(trimmed) || trimmed === 'if') return TK.CONTROL_IF
  if (/^else if\s/.test(trimmed)) return TK.CONTROL_ELSEIF
  if (trimmed === 'else') return TK.CONTROL_ELSE
  if (/^each\s+\w+(\s*,\s*\w+)?\s+in\s+/.test(trimmed)) return TK.CONTROL_EACH
  // Slot
  if (/^slot(:[a-zA-Z][\w-]*)?(\([^)]*\))?$/.test(trimmed)) return TK.SLOT
  // Component (starts with uppercase, must be valid identifier)
  if (/^[A-Z][a-zA-Z0-9]*(\s|$)/.test(trimmed)) return TK.COMPONENT
  // Tag (starts with lowercase letter, or starts with tag+class/id syntax)
  if (/^[a-z][a-zA-Z0-9]*([.#][a-zA-Z0-9_-]*)*(\s|$)/.test(trimmed)) return TK.TAG
  // element keyword (special lowercase component)
  if (trimmed === 'element' || trimmed.startsWith('element ')) return TK.TAG
  // Anything else is text
  return TK.TEXT
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

export type LexerResult = {
  tokens: Token[]
  errors: LexError[]
}

export type LexError = { message: string; line: number; span?: SourceSpan }

export function tokenize(src: string): LexerResult {
  const lines = src.split('\n')
  const tokens: Token[] = []
  const errors: LexError[] = []
  const indentStack: number[] = [0]

  // Track current zone
  let zone: string | null = null
  // Base indent of current zone (for raw zones, we capture lines at higher indent)
  let zoneBaseIndent = 0
  // When inside a dimension block, treat everything as TEXT to avoid misclassification
  let rawUntilIndent: number | null = null

  function position(line: number, column: number, offset: number): SourcePosition {
    return { line, column, offset }
  }

  function span(line: number, startColumn: number, endColumn: number, lineOffset: number): SourceSpan {
    const safeStart = Math.max(1, startColumn)
    const safeEnd = Math.max(safeStart, endColumn)
    return {
      start: position(line, safeStart, lineOffset + safeStart - 1),
      end: position(line, safeEnd, lineOffset + safeEnd - 1),
    }
  }

  function push(type: TK, value: string, line: number, col: number, indent: number, tokenSpan: SourceSpan) {
    tokens.push({ type, value, line, col, indent, span: tokenSpan })
  }

  function currentIndent() {
    return indentStack[indentStack.length - 1]
  }

  function emitIndentChanges(newIndent: number, lineNum: number, lineOffset: number) {
    if (newIndent > currentIndent()) {
      indentStack.push(newIndent)
      push(TK.INDENT, '', lineNum, newIndent + 1, newIndent, span(lineNum, newIndent + 1, newIndent + 1, lineOffset))
    } else {
      while (newIndent < currentIndent()) {
        const prev = indentStack.pop()!
        push(TK.DEDENT, '', lineNum, newIndent + 1, prev, span(lineNum, newIndent + 1, newIndent + 1, lineOffset))
      }
      if (newIndent !== currentIndent()) {
        errors.push({ message: `Inconsistent indentation`, line: lineNum, span: span(lineNum, 1, Math.max(1, newIndent + 1), lineOffset) })
      }
    }
  }

  let lineOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const lineNum = i + 1

    if (rawLine.trim() === '') {
      if (zone && CONTEXT_SWITCH_NAMES.has(zone) && zone !== 'pug') {
        push(TK.RAW_LINE, '', lineNum, 1, 0, span(lineNum, 1, 1, lineOffset))
      } else if (zone === 'pug') {
        push(TK.NEWLINE, '', lineNum, 1, 0, span(lineNum, 1, 1, lineOffset))
      }
      lineOffset += rawLine.length + 1
      continue
    }

    const indent = measureIndent(rawLine)
    const trimmed = rawLine.trim()

    // ── Context switch detection (col 0) ──────────────────────────────────────
    const ctxMatch = trimmed.match(/^- (generics|props|state|computed|onMount|onUpdate|onUnmount|ts|js|pug)(.*)$/)
    if (ctxMatch && indent === 0) {
      // Flush any remaining dedents back to 0
      while (indentStack.length > 1) {
        const prev = indentStack.pop()!
        push(TK.DEDENT, '', lineNum, 1, prev, span(lineNum, 1, 1, lineOffset))
      }
      const zoneName = ctxMatch[1] ?? 'pug'
      zone = zoneName
      zoneBaseIndent = 0 // Will be set on first content line for raw zones
      rawUntilIndent = null
      push(TK.CONTEXT_SWITCH, zoneName, lineNum, indent + 1, 0, span(lineNum, indent + 1, rawLine.length + 1, lineOffset))
      lineOffset += rawLine.length + 1
      continue
    }

    // ── Raw zones (everything but pug) ────────────────────────────────────────
    if (zone && CONTEXT_SWITCH_NAMES.has(zone) && zone !== 'pug') {
      if (zoneBaseIndent === 0) zoneBaseIndent = indent
      const strippedLine = stripIndent(rawLine, zoneBaseIndent)
      push(
        TK.RAW_LINE,
        strippedLine,
        lineNum,
        Math.max(1, zoneBaseIndent + 1),
        indent,
        span(lineNum, Math.max(1, zoneBaseIndent + 1), rawLine.length + 1, lineOffset),
      )
      lineOffset += rawLine.length + 1
      continue
    }

    // ── Pug zone (or pre-zone text) ───────────────────────────────────────────
    if (zone === 'pug' || zone === null) {
      emitIndentChanges(indent, lineNum, lineOffset)
      
      if (rawUntilIndent !== null && indent <= rawUntilIndent) {
        rawUntilIndent = null
      }

      let tk = classifyLine(trimmed)
      if (rawUntilIndent !== null) {
        tk = TK.TEXT
      }

      if (tk === TK.COMMENT) {
        push(TK.COMMENT, trimmed.slice(2).trim(), lineNum, indent + 1, indent, span(lineNum, indent + 1, rawLine.length + 1, lineOffset))
        lineOffset += rawLine.length + 1
        continue
      }

      push(tk, trimmed, lineNum, indent + 1, indent, span(lineNum, indent + 1, rawLine.length + 1, lineOffset))
      
      if (tk === TK.DIMENSION_DATA || tk === TK.DIMENSION_STYLE || tk === TK.DIMENSION_BEHAVIOR) {
        rawUntilIndent = indent
      }
    }

    lineOffset += rawLine.length + 1
  }

  // Close any remaining indents
  while (indentStack.length > 1) {
    const prev = indentStack.pop()!
    push(TK.DEDENT, '', lines.length, 1, prev, span(lines.length, 1, 1, lineOffset))
  }

  push(TK.EOF, '', lines.length + 1, 1, 0, {
    start: position(lines.length + 1, 1, src.length),
    end: position(lines.length + 1, 1, src.length),
  })

  return { tokens, errors }
}
