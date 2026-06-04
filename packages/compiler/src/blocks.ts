import type { LoomFile, MarkupNode, SourcePosition, SourceSpan } from './ast.js'
import { parse } from './parser.js'

export type LoomTopLevelBlockKind =
  | 'generics'
  | 'props'
  | 'state'
  | 'computed'
  | 'onMount'
  | 'onUpdate'
  | 'onUnmount'
  | 'logic'
  | 'markup'

export type LoomTopLevelBlock = {
  id: string
  kind: LoomTopLevelBlockKind
  order: number
  lang?: 'ts' | 'js'
  explicit: boolean
  span: SourceSpan
  contentSpan: SourceSpan
  raw: string
  content: string
  summary: string
}

export type LoomMarkupNodeRef = {
  id: string
  parentId?: string
  depth: number
  kind: MarkupNode['kind']
  span: SourceSpan
  raw: string
  summary: string
}

export type LoomStructure = {
  file: LoomFile
  blocks: LoomTopLevelBlock[]
  markupNodes: LoomMarkupNodeRef[]
}

type ZoneMatch = {
  name:
    | 'generics'
    | 'props'
    | 'state'
    | 'computed'
    | 'onMount'
    | 'onUpdate'
    | 'onUnmount'
    | 'ts'
    | 'js'
    | 'view'
  lineIndex: number
  startOffset: number
  bodyStartOffset: number
}

export function extractLoomStructure(source: string): LoomStructure {
  const file = parse(source)
  const lineStarts = computeLineStarts(source)
  const sourceLength = source.length
  const zones = scanExplicitZones(source, lineStarts)
  const blocks: LoomTopLevelBlock[] = []

  const zoneMap = new Map(zones.map((zone) => [zone.name, zone]))
  let order = 0

  const addBlock = (
    kind: LoomTopLevelBlockKind,
    lang: 'ts' | 'js' | undefined,
    zone: ZoneMatch,
  ) => {
    blocks.push(buildZoneBlock(source, lineStarts, zone, zones, order++, kind, lang, file))
  }

  if (file.generics && zoneMap.has('generics')) {
    addBlock('generics', undefined, zoneMap.get('generics')!)
  }
  if (file.props && file.props.length > 0 && zoneMap.has('props')) {
    addBlock('props', undefined, zoneMap.get('props')!)
  }
  if (file.state && file.state.length > 0 && zoneMap.has('state')) {
    addBlock('state', undefined, zoneMap.get('state')!)
  }
  if (file.computed && file.computed.length > 0 && zoneMap.has('computed')) {
    addBlock('computed', undefined, zoneMap.get('computed')!)
  }
  if (file.onMount && file.onMount.length > 0 && zoneMap.has('onMount')) {
    addBlock('onMount', undefined, zoneMap.get('onMount')!)
  }
  if (file.onUpdate && file.onUpdate.length > 0 && zoneMap.has('onUpdate')) {
    addBlock('onUpdate', undefined, zoneMap.get('onUpdate')!)
  }
  if (file.onUnmount && file.onUnmount.length > 0 && zoneMap.has('onUnmount')) {
    addBlock('onUnmount', undefined, zoneMap.get('onUnmount')!)
  }
  if (file.logic && zoneMap.has(file.logic.lang)) {
    addBlock('logic', file.logic.lang, zoneMap.get(file.logic.lang)!)
  }

  if (file.markup && file.markup.length > 0) {
    const markupZone = zoneMap.get('view')
    if (markupZone) {
      addBlock('markup', undefined, markupZone)
    } else {
      const firstNode = file.markup[0]
      const lastNode = file.markup[file.markup.length - 1]
      const span = createSpan(
        lineStarts,
        firstNode.span?.start.offset ?? 0,
        lastNode.span?.end.offset ?? sourceLength,
      )
      blocks.push({
        id: 'markup:0',
        kind: 'markup',
        order: order++,
        explicit: false,
        span,
        contentSpan: span,
        raw: source.slice(span.start.offset, span.end.offset),
        content: source.slice(span.start.offset, span.end.offset),
        summary: summarizeBlock('markup', file),
      })
    }
  }

  const markupNodes = extractMarkupNodeRefs(source, file.markup ?? [])
  return { file, blocks, markupNodes }
}

function buildZoneBlock(
  source: string,
  lineStarts: number[],
  zone: ZoneMatch,
  zones: ZoneMatch[],
  order: number,
  kind: LoomTopLevelBlockKind,
  lang: 'ts' | 'js' | undefined,
  file: LoomFile,
): LoomTopLevelBlock {
  const zoneIndex = zones.indexOf(zone)
  const nextZoneStart = zones[zoneIndex + 1]?.startOffset ?? source.length
  const fullRangeEnd = trimTrailingBlankLines(source, zone.startOffset, nextZoneStart)
  const contentRangeEnd = trimTrailingBlankLines(source, zone.bodyStartOffset, nextZoneStart)
  const span = createSpan(lineStarts, zone.startOffset, fullRangeEnd)
  const contentSpan = createSpan(lineStarts, zone.bodyStartOffset, contentRangeEnd)

  return {
    id: `${kind}:0`,
    kind,
    order,
    lang,
    explicit: true,
    span,
    contentSpan,
    raw: source.slice(zone.startOffset, fullRangeEnd),
    content: source.slice(zone.bodyStartOffset, contentRangeEnd),
    summary: summarizeBlock(kind, file),
  }
}

function extractMarkupNodeRefs(source: string, nodes: MarkupNode[]): LoomMarkupNodeRef[] {
  const refs: LoomMarkupNodeRef[] = []

  const visit = (node: MarkupNode, path: string[], depth: number, parentId?: string) => {
    if (!node.span) return
    const id = `markup:0/${path.join('/')}`
    refs.push({
      id,
      parentId,
      depth,
      kind: node.kind,
      span: node.span,
      raw: source.slice(node.span.start.offset, node.span.end.offset),
      summary: summarizeMarkupNode(node),
    })

    const children = getNodeChildren(node)
    const counters: Record<string, number> = {}

    children.forEach((child) => {
      const kindOrTag = child.kind === 'element' ? child.tag : child.kind
      const count = counters[kindOrTag] || 0
      counters[kindOrTag] = count + 1
      visit(child, [...path, `${kindOrTag}:${count}`], depth + 1, id)
    })
  }

  const rootCounters: Record<string, number> = {}
  nodes.forEach((node) => {
    const kindOrTag = node.kind === 'element' ? node.tag : node.kind
    const count = rootCounters[kindOrTag] || 0
    rootCounters[kindOrTag] = count + 1
    visit(node, [`${kindOrTag}:${count}`], 0)
  })
  return refs
}

function summarizeBlock(kind: LoomTopLevelBlockKind, file: LoomFile): string {
  switch (kind) {
    case 'generics':
      return `generic parameters ${file.generics?.trim() ?? ''}`.trim()
    case 'props': {
      const names = (file.props ?? []).map((prop) => prop.name)
      return names.length > 0
        ? `${names.length} prop${names.length === 1 ? '' : 's'}: ${names.join(', ')}`
        : 'props zone'
    }
    case 'state': {
      const names = (file.state ?? []).map((s) => s.name)
      return names.length > 0
        ? `${names.length} state variable${names.length === 1 ? '' : 's'}: ${names.join(', ')}`
        : 'state zone'
    }
    case 'computed': {
      const names = (file.computed ?? []).map((c) => c.name)
      return names.length > 0
        ? `${names.length} computed property${names.length === 1 ? '' : 'ies'}: ${names.join(', ')}`
        : 'computed zone'
    }
    case 'onMount':
      return 'onMount lifecycle zone'
    case 'onUpdate':
      return 'onUpdate lifecycle zone'
    case 'onUnmount':
      return 'onUnmount lifecycle zone'
    case 'logic': {
      const imports = collectImports(file.logic?.src ?? '')
      const lang = file.logic?.lang ?? 'ts'
      return imports.length > 0
        ? `${lang} logic importing ${imports.join(', ')}`
        : `${lang} logic block`
    }
    case 'markup': {
      const tags = [...new Set(collectElementTags(file.markup ?? []))]
      const nodeCount = countMarkupNodes(file.markup ?? [])
      if (tags.length === 0) return `${nodeCount} markup node${nodeCount === 1 ? '' : 's'}`
      return `${nodeCount} markup node${nodeCount === 1 ? '' : 's'} using ${tags.join(', ')}`
    }
  }
}

function summarizeMarkupNode(node: MarkupNode): string {
  switch (node.kind) {
    case 'element': {
      const classes = node.classes.length > 0 ? `.${node.classes.join('.')}` : ''
      const id = node.id ? `#${node.id}` : ''
      return `element ${node.tag}${classes}${id} (${node.children.length} child${node.children.length === 1 ? '' : 'ren'})`
    }
    case 'text':
      return `text "${truncate(node.value.trim(), 48)}"`
    case 'if':
      return `if ${truncate(node.condition, 48)}`
    case 'elseif':
      return `else if ${truncate(node.condition, 48)}`
    case 'else':
      return `else (${node.children.length} child${node.children.length === 1 ? '' : 'ren'})`
    case 'each':
      return `each ${node.item}${node.index ? `, ${node.index}` : ''} in ${truncate(node.list, 48)}`
    case 'slot-def':
      return node.name ? `slot definition ${node.name}` : 'default slot definition'
    case 'slot-use':
      return node.name ? `slot content ${node.name}` : 'default slot content'
    case 'comment':
      return `comment "${truncate(node.value.trim(), 48)}"`
  }
}

function getNodeChildren(node: MarkupNode): MarkupNode[] {
  switch (node.kind) {
    case 'element':
      return node.children
    case 'if':
      return [...node.consequent, ...(node.alternate ? [node.alternate] : [])]
    case 'elseif':
      return [...node.consequent, ...(node.alternate ? [node.alternate] : [])]
    case 'else':
      return node.children
    case 'each':
      return node.children
    case 'slot-use':
      return node.children
    default:
      return []
  }
}

function collectImports(source: string): string[] {
  const imports = new Set<string>()
  const regex = /import\s+(?:type\s+)?(?:.+?\s+from\s+)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(regex)) {
    imports.add(match[1]!)
  }
  return [...imports]
}

function collectElementTags(nodes: MarkupNode[]): string[] {
  const tags: string[] = []
  const visit = (node: MarkupNode) => {
    if (node.kind === 'element') {
      tags.push(node.tag)
      node.children.forEach(visit)
      return
    }

    getNodeChildren(node).forEach(visit)
  }

  nodes.forEach(visit)
  return tags
}

function countMarkupNodes(nodes: MarkupNode[]): number {
  let count = 0
  const visit = (node: MarkupNode) => {
    count += 1
    getNodeChildren(node).forEach(visit)
  }
  nodes.forEach(visit)
  return count
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function scanExplicitZones(source: string, lineStarts: number[]): ZoneMatch[] {
  const lines = source.split('\n')
  const zones: ZoneMatch[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const match = line.match(/^- (generics|props|state|computed|onMount|onUpdate|onUnmount|ts|js|view)\s*$/)
    if (!match) continue

    const startOffset = lineStarts[index]!
    const bodyStartOffset = index + 1 < lineStarts.length ? lineStarts[index + 1]! : source.length
    zones.push({
      name: match[1] as ZoneMatch['name'],
      lineIndex: index,
      startOffset,
      bodyStartOffset,
    })
  }

  return zones
}

function trimTrailingBlankLines(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset
  while (cursor > startOffset) {
    const previousNewline = source.lastIndexOf('\n', cursor - 1)
    const lineStart = previousNewline === -1 ? startOffset : previousNewline + 1
    const line = source.slice(lineStart, cursor)
    if (line.trim() !== '') break
    cursor = previousNewline === -1 ? startOffset : previousNewline
  }
  return cursor
}

function computeLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      starts.push(index + 1)
    }
  }
  return starts
}

function createSpan(lineStarts: number[], startOffset: number, endOffset: number): SourceSpan {
  return {
    start: positionAt(lineStarts, startOffset),
    end: positionAt(lineStarts, endOffset),
  }
}

function positionAt(lineStarts: number[], offset: number): SourcePosition {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]!
    const nextLineStart = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY
    if (offset < lineStart) {
      high = mid - 1
    } else if (offset >= nextLineStart) {
      low = mid + 1
    } else {
      return {
        line: mid + 1,
        column: offset - lineStart + 1,
        offset,
      }
    }
  }

  const lastIndex = Math.max(0, lineStarts.length - 1)
  const lastStart = lineStarts[lastIndex] ?? 0
  return {
    line: lastIndex + 1,
    column: offset - lastStart + 1,
    offset,
  }
}
