import { parse } from './parser.js'
import type {
  BehaviorBlock,
  ComputedDecl,
  DataAttr,
  EachNode,
  ElementNode,
  ElseIfNode,
  ElseNode,
  IfNode,
  LoomFile,
  MarkupNode,
  PropDecl,
  SlotUseNode,
  StateDecl,
  StyleBlock,
  StyleRule,
} from './ast.js'

/**
 * Format a Loom source file to its canonical representation.
 */
export function formatLoom(source: string): string {
  let file: LoomFile
  try {
    file = parse(String(source ?? ''))
  } catch {
    return formatWhitespaceOnly(source)
  }
  return printLoom(file)
}

export function printLoom(file: LoomFile): string {
  const sections: string[] = []

  if (file.generics) {
    sections.push(`- generics\n  ${file.generics.trim()}`)
  }

  if (file.meta && file.meta.length > 0) {
    sections.push(`- meta\n${file.meta.map((entry) => `  ${entry.key}: ${entry.value}`).join('\n')}`)
  }

  if (file.schema?.src.trim()) {
    sections.push(`- schema\n${reindentLogicBlock(file.schema.src)}`)
  }

  if (file.server?.src.trim()) {
    sections.push(`- server\n${reindentLogicBlock(file.server.src)}`)
  }

  if (file.tokens && file.tokens.entries.length > 0) {
    sections.push(`- tokens\n${file.tokens.entries.map((entry) => {
      const prefix = entry.theme ? `theme.${entry.theme}.` : ''
      return `  ${prefix}${entry.path.join('.')}: ${entry.value}`
    }).join('\n')}`)
  }

  if (file.props && file.props.length > 0) {
    const propLines = file.props.map(printProp)
    sections.push(`- props\n${propLines.join('\n')}`)
  }

  if (file.state && file.state.length > 0) {
    const stateLines = file.state.map(printState)
    sections.push(`- state\n${stateLines.join('\n')}`)
  }

  if (file.computed && file.computed.length > 0) {
    const computedLines = file.computed.map(printComputed)
    sections.push(`- computed\n${computedLines.join('\n')}`)
  }

  if (file.onMount && file.onMount.length > 0) {
    const body = reindentLogicBlock(file.onMount.map((s) => s.src).join('\n'))
    sections.push(`- onMount\n${body}`)
  }

  if (file.onUpdate && file.onUpdate.length > 0) {
    const body = reindentLogicBlock(file.onUpdate.map((s) => s.src).join('\n'))
    sections.push(`- onUpdate\n${body}`)
  }

  if (file.onUnmount && file.onUnmount.length > 0) {
    const body = reindentLogicBlock(file.onUnmount.map((s) => s.src).join('\n'))
    sections.push(`- onUnmount\n${body}`)
  }

  if (file.logic) {
    const body = reindentLogicBlock(file.logic.src)
    sections.push(`- ${file.logic.lang}\n${body}`)
  }

  if (file.markup && file.markup.length > 0) {
    sections.push(printMarkupBlock(file.markup))
  }

  if (sections.length === 0) return '\n'

  return sections.join('\n\n') + '\n'
}

export function printMarkupBlock(nodes: MarkupNode[]): string {
  const markupLines = nodes.flatMap((node) => printMarkupNodeLines(node, '  '))
  return `- pug\n${markupLines.join('\n')}`
}

export function printMarkupNodes(nodes: MarkupNode[], indent = ''): string {
  return nodes.flatMap((node) => printMarkupNodeLines(node, indent)).join('\n')
}

export function printMarkupNode(node: MarkupNode, indent = ''): string {
  return printMarkupNodeLines(node, indent).join('\n')
}

export function reindentLogicBlock(src: string): string {
  const raw = src.replace(/\n+$/, '')
  const lines = raw.split('\n')

  const minIndent = lines
    .filter((line) => line.trim().length > 0)
    .reduce((min, line) => {
      const spaces = line.match(/^[ \t]*/)?.[0].length ?? 0
      return Math.min(min, spaces)
    }, Infinity)

  const base = minIndent === Infinity ? 0 : minIndent

  return lines
    .map((line) => {
      if (line.trim() === '') return ''
      return `  ${line.slice(base)}`
    })
    .join('\n')
}

function printProp(prop: PropDecl): string {
  const defaultValue = prop.defaultValue !== undefined ? ` = ${prop.defaultValue}` : ''
  return `  ${prop.name}: ${prop.type}${defaultValue}`
}

function printState(state: StateDecl): string {
  const defaultValue = state.defaultValue !== undefined ? ` = ${state.defaultValue}` : ''
  return `  ${state.name}: ${state.type}${defaultValue}`
}

function printComputed(computed: ComputedDecl): string {
  return `  ${computed.name}: ${computed.expr}`
}

function printMarkupNodeLines(node: MarkupNode, indent: string): string[] {
  switch (node.kind) {
    case 'element':
      return printElement(node, indent)
    case 'text':
      return [`${indent}${node.value.trim()}`]
    case 'if':
      return printIf(node, indent)
    case 'elseif':
      return printElseIf(node, indent)
    case 'else':
      return printElse(node, indent)
    case 'each':
      return printEach(node, indent)
    case 'slot-def':
      return [node.name ? `${indent}slot:${node.name}` : `${indent}slot`]
    case 'slot-use':
      return printSlotUse(node, indent)
    case 'comment':
      return [`${indent}// ${node.value.trim()}`]
    default:
      return []
  }
}

function printElement(node: ElementNode, indent: string): string[] {
  const lines: string[] = []
  const childIndent = indent + '  '

  let tagLine = node.tag
  if (node.classes.length > 0) tagLine += '.' + node.classes.join('.')
  if (node.id) tagLine += `#${node.id}`

  const inlineText = getInlineText(node)
  if (inlineText !== null) {
    lines.push(`${indent}${tagLine} ${inlineText}`)
  } else {
    lines.push(`${indent}${tagLine}`)
  }

  const dataAttrs = node.data?.filter((attr) => attr.kind !== 'as') ?? []
  const asAttr = node.data?.find((attr) => attr.kind === 'as')

  if (asAttr && asAttr.kind === 'as') {
    lines.push(`${childIndent}:`)
    lines.push(`${childIndent}  as {${asAttr.expr}}`)
    for (const attr of dataAttrs) {
      lines.push(`${childIndent}  ${printDataAttr(attr)}`)
    }
  } else if (dataAttrs.length > 0) {
    lines.push(`${childIndent}:`)
    for (const attr of dataAttrs) {
      lines.push(`${childIndent}  ${printDataAttr(attr)}`)
    }
  }

  if (node.styles && node.styles.length > 0) {
    lines.push(`${childIndent}::`)
    lines.push(...printStyleBlock(node.styles, childIndent + '  '))
  }

  for (const behavior of node.behaviors ?? []) {
    lines.push(...printBehavior(behavior, childIndent))
  }

  if (inlineText === null) {
    for (const child of node.children) {
      lines.push(...printMarkupNodeLines(child, childIndent))
    }
  }

  return lines
}

function getInlineText(node: ElementNode): string | null {
  if (node.data?.length || node.styles?.length || node.behaviors?.length) {
    return null
  }

  if (node.children.length !== 1) return null

  const child = node.children[0]
  if (child.kind !== 'text') return null

  const trimmed = child.value.trim()
  if (trimmed.includes('\n')) return null
  return trimmed
}

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
    case 'bind':
      return attr.name === attr.expr ? `bind:${attr.name}` : `bind:${attr.name} ${attr.expr}`
    default: {
      const _exhaustive: never = attr
      return _exhaustive
    }
  }
}

function printStyleBlock(block: StyleBlock, indent: string): string[] {
  return block.flatMap((rule) => printStyleRule(rule, indent))
}

function printStyleRule(rule: StyleRule, indent: string): string[] {
  if (rule.kind === 'decl') {
    return [`${indent}${rule.prop} ${rule.value}`]
  }

  const lines: string[] = [`${indent}${rule.selector}`]
  lines.push(...printStyleBlock(rule.rules, indent + '  '))
  return lines
}

function printBehavior(behavior: BehaviorBlock, indent: string): string[] {
  const modifierSuffix = behavior.modifiers.length > 0 ? `.${behavior.modifiers.join('.')}` : ''
  const lines = [`${indent}@${behavior.event}${modifierSuffix}`]

  const bodySrc = behavior.body.map((s) => s.src).join('\n')
  for (const line of bodySrc.trim().split('\n')) {
    if (line.trim()) {
      lines.push(`${indent}  ${line.trim()}`)
    }
  }

  return lines
}

function printIf(node: IfNode, indent: string): string[] {
  const lines: string[] = [`${indent}if ${node.condition}`]
  for (const child of node.consequent) {
    lines.push(...printMarkupNodeLines(child, indent + '  '))
  }
  if (node.alternate) {
    lines.push(...printMarkupNodeLines(node.alternate, indent))
  }
  return lines
}

function printElseIf(node: ElseIfNode, indent: string): string[] {
  const lines: string[] = [`${indent}else if ${node.condition}`]
  for (const child of node.consequent) {
    lines.push(...printMarkupNodeLines(child, indent + '  '))
  }
  if (node.alternate) {
    lines.push(...printMarkupNodeLines(node.alternate, indent))
  }
  return lines
}

function printElse(node: ElseNode, indent: string): string[] {
  const lines: string[] = [`${indent}else`]
  for (const child of node.children) {
    lines.push(...printMarkupNodeLines(child, indent + '  '))
  }
  return lines
}

function printEach(node: EachNode, indent: string): string[] {
  const indexPart = node.index ? `, ${node.index}` : ''
  const lines: string[] = [`${indent}each ${node.item}${indexPart} in ${node.list}`]
  for (const child of node.children) {
    lines.push(...printMarkupNodeLines(child, indent + '  '))
  }
  return lines
}

function printSlotUse(node: SlotUseNode, indent: string): string[] {
  const header = node.name ? `${indent}slot:${node.name}` : `${indent}slot`
  const lines: string[] = [header]
  for (const child of node.children) {
    lines.push(...printMarkupNodeLines(child, indent + '  '))
  }
  return lines
}

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
