import { parse } from './parser.js'
import type {
  LoomFile,
  PropDecl,
  MarkupNode,
  ElementNode,
  StyleRule,
  StyleBlock,
  BehaviorBlock,
  DataAttr,
  IfNode,
  ElseIfNode,
  ElseNode,
  EachNode,
} from './ast.js'

/**
 * Format a Loom source file to its canonical representation.
 *
 * - Zone headers are normalised (`- pug`, `- ts`, `- props`, `- generics`).
 * - Markup uses consistent 2-space indentation.
 * - JS/TS logic content is preserved verbatim (reformatting is delegated to
 *   external tools such as Prettier).
 * - Formatting is idempotent: formatting an already-formatted file is a no-op.
 *
 * Falls back to whitespace-only cleanup when the source cannot be parsed.
 */
export function formatLoom(source: string): string {
  let file: LoomFile
  try {
    file = parse(String(source ?? ''))
  } catch {
    return formatWhitespaceOnly(source)
  }
  return printFile(file)
}

// ─── File printer ─────────────────────────────────────────────────────────────

function printFile(file: LoomFile): string {
  const sections: string[] = []

  if (file.generics) {
    sections.push(`- generics\n  ${file.generics.trim()}`)
  }

  if (file.props && file.props.length > 0) {
    const propLines = file.props.map(printProp)
    sections.push(`- props\n${propLines.join('\n')}`)
  }

  if (file.logic) {
    const body = preserveLogicContent(file.logic.src)
    sections.push(`- ${file.logic.lang}\n${body}`)
  }

  if (file.markup && file.markup.length > 0) {
    const markupLines = file.markup.flatMap(n => printNode(n, '  '))
    sections.push(`- pug\n${markupLines.join('\n')}`)
  }

  if (sections.length === 0) return '\n'

  return sections.join('\n\n') + '\n'
}

// ─── Props printer ────────────────────────────────────────────────────────────

function printProp(p: PropDecl): string {
  const def = p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''
  return `  ${p.name}: ${p.type}${def}`
}

// ─── Logic content ────────────────────────────────────────────────────────────

/**
 * Re-indent logic zone content to exactly 2-space base indent, preserving
 * relative indentation within the block.
 */
function preserveLogicContent(src: string): string {
  const raw = src.replace(/\n+$/, '') // strip trailing newlines
  const lines = raw.split('\n')

  // Find the minimum non-empty indent
  const minIndent = lines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => {
      const spaces = l.match(/^[ \t]*/)?.[0].length ?? 0
      return Math.min(min, spaces)
    }, Infinity)

  const base = minIndent === Infinity ? 0 : minIndent

  return lines
    .map(l => {
      if (l.trim() === '') return ''
      const stripped = l.slice(base)
      return `  ${stripped}`
    })
    .join('\n')
}

// ─── Markup node printer ──────────────────────────────────────────────────────

function printNode(node: MarkupNode, indent: string): string[] {
  switch (node.kind) {
    case 'element': return printElement(node, indent)
    case 'text': return [`${indent}${node.value.trim()}`]
    case 'if': return printIf(node, indent)
    case 'elseif': return printElseIf(node, indent)
    case 'else': return printElse(node, indent)
    case 'each': return printEach(node, indent)
    case 'slot-def': return [node.name ? `${indent}slot:${node.name}` : `${indent}slot`]
    case 'slot-use': return printSlotUse(node, indent)
    case 'comment': return [`${indent}// ${node.value.trim()}`]
    default: return []
  }
}

function printElement(node: ElementNode, indent: string): string[] {
  const lines: string[] = []
  const childIndent = indent + '  '

  // Tag line: tag.class#id
  let tagLine = node.tag
  if (node.classes.length > 0) tagLine += '.' + node.classes.join('.')
  if (node.id) tagLine += '#' + node.id

  // Inline text child (single text node with no other children)
  const inlineText = getInlineText(node)
  if (inlineText !== null) {
    lines.push(`${indent}${tagLine} ${inlineText}`)
  } else {
    lines.push(`${indent}${tagLine}`)
  }

  // Data dimension
  const dataAttrs = node.data?.filter(d => d.kind !== 'as') ?? []
  const asAttr = node.data?.find(d => d.kind === 'as')

  if (asAttr && asAttr.kind === 'as') {
    lines.push(`${childIndent}:`)
    lines.push(`${childIndent}  as {${asAttr.expr}}`)
    if (dataAttrs.length > 0) {
      for (const attr of dataAttrs) {
        lines.push(`${childIndent}  ${printDataAttr(attr)}`)
      }
    }
  } else if (dataAttrs.length > 0) {
    lines.push(`${childIndent}:`)
    for (const attr of dataAttrs) {
      lines.push(`${childIndent}  ${printDataAttr(attr)}`)
    }
  }

  // Style dimension
  if (node.styles && node.styles.length > 0) {
    lines.push(`${childIndent}::`)
    lines.push(...printStyleBlock(node.styles, childIndent + '  '))
  }

  // Behavior dimension
  for (const beh of node.behaviors ?? []) {
    lines.push(...printBehavior(beh, childIndent))
  }

  // Children (skip inline text, already handled)
  if (inlineText === null) {
    for (const child of node.children) {
      lines.push(...printNode(child, childIndent))
    }
  }

  return lines
}

/** Return the inline text value if the node has exactly one plain text child, otherwise null. */
function getInlineText(node: ElementNode): string | null {
  if (
    node.data?.length ||
    node.styles?.length ||
    node.behaviors?.length
  ) return null

  const visible = node.children.filter(c => c.kind !== 'comment')
  if (visible.length !== 1) return null
  const child = visible[0]
  if (child.kind !== 'text') return null
  const trimmed = child.value.trim()
  // Don't inline if there are multiple words that look like they span lines
  if (trimmed.includes('\n')) return null
  return trimmed
}

// ─── Data attr printer ────────────────────────────────────────────────────────

function printDataAttr(attr: DataAttr): string {
  switch (attr.kind) {
    case 'static':
      return attr.value === '' ? attr.name : `${attr.name} ${attr.value}`
    case 'dynamic':
      return `${attr.name} {${attr.expr}}`
    case 'spread':
      return `...${attr.expr}`
    case 'as':
      return `as {${attr.expr}}`
  }
}

// ─── Style block printer ─────────────────────────────────────────────────────

function printStyleBlock(block: StyleBlock, indent: string): string[] {
  const lines: string[] = []
  for (const rule of block) {
    lines.push(...printStyleRule(rule, indent))
  }
  return lines
}

function printStyleRule(rule: StyleRule, indent: string): string[] {
  if (rule.kind === 'decl') {
    return [`${indent}${rule.prop} ${rule.value}`]
  }
  // nested rule
  const lines: string[] = [`${indent}${rule.selector}`]
  lines.push(...printStyleBlock(rule.rules, indent + '  '))
  return lines
}

// ─── Behavior printer ────────────────────────────────────────────────────────

function printBehavior(beh: BehaviorBlock, indent: string): string[] {
  const lines: string[] = []
  const modSuffix = beh.modifiers.length > 0 ? '.' + beh.modifiers.join('.') : ''
  lines.push(`${indent}@${beh.event}${modSuffix}`)
  const bodyLines = beh.body.trim().split('\n')
  for (const bl of bodyLines) {
    if (bl.trim()) lines.push(`${indent}  ${bl.trim()}`)
  }
  return lines
}

// ─── Control flow printers ───────────────────────────────────────────────────

function printIf(node: IfNode, indent: string): string[] {
  const lines: string[] = [`${indent}if ${node.condition}`]
  for (const child of node.consequent) {
    lines.push(...printNode(child, indent + '  '))
  }
  if (node.alternate) {
    lines.push(...printNode(node.alternate, indent))
  }
  return lines
}

function printElseIf(node: ElseIfNode, indent: string): string[] {
  const lines: string[] = [`${indent}else if ${node.condition}`]
  for (const child of node.consequent) {
    lines.push(...printNode(child, indent + '  '))
  }
  if (node.alternate) {
    lines.push(...printNode(node.alternate, indent))
  }
  return lines
}

function printElse(node: ElseNode, indent: string): string[] {
  const lines: string[] = [`${indent}else`]
  for (const child of node.children) {
    lines.push(...printNode(child, indent + '  '))
  }
  return lines
}

function printEach(node: EachNode, indent: string): string[] {
  const indexPart = node.index ? `, ${node.index}` : ''
  const lines: string[] = [`${indent}each ${node.item}${indexPart} in ${node.list}`]
  for (const child of node.children) {
    lines.push(...printNode(child, indent + '  '))
  }
  return lines
}

function printSlotUse(
  node: import('./ast.js').SlotUseNode,
  indent: string,
): string[] {
  const header = node.name ? `${indent}slot:${node.name}` : `${indent}slot`
  const lines: string[] = [header]
  for (const child of node.children) {
    lines.push(...printNode(child, indent + '  '))
  }
  return lines
}

// ─── Whitespace-only fallback ─────────────────────────────────────────────────

function formatWhitespaceOnly(source: string): string {
  const lines = String(source ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))

  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return `${lines.join('\n')}\n`
}
