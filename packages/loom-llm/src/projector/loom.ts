import path from 'node:path'
import { analyze, extractLoomStructure } from '@loom-kit/compiler'
import type { MarkupNode } from '@loom-kit/compiler'
import type {
  LoomProjection,
  ProjectionFormat,
  ProjectionMode,
  ProjectionRenderOptions,
  ProjectionSymbols,
} from '../types.js'
import { hashText } from '../cache.js'
import { estimateTokenCount } from '../tokens.js'

export function createLoomProjection(
  root: string,
  absolutePath: string,
  source: string,
): LoomProjection {
  const sourcePath = toProjectPath(root, absolutePath)
  const structure = extractLoomStructure(source)
  const { diagnostics } = analyze(source)
  const baseProjection: LoomProjection = {
    version: 1,
    sourcePath,
    sourceHash: hashText(source),
    language: 'loom',
    componentName: path.basename(absolutePath, '.loom'),
    generatedAt: new Date().toISOString(),
    diagnostics,
    blocks: structure.blocks,
    markupNodes: structure.markupNodes,
    symbols: collectSymbols(
      structure.file.logic?.src ?? '',
      structure.file.props?.map((prop) => prop.name) ?? [],
      structure.file.state?.map((s) => s.name) ?? [],
      structure.file.computed?.map((c) => c.name) ?? [],
      structure.file.markup ?? [],
    ),
    tokenEstimates: {
      source: 0,
      index: 0,
      outline: 0,
      edit: 0,
      cavemanIndex: 0,
      cavemanOutline: 0,
      cavemanEdit: 0,
    },
  }

  const outline = renderLoomProjection(baseProjection, 'outline')
  const edit = renderLoomProjection(baseProjection, 'edit')
  const index = renderLoomProjection(baseProjection, 'index')
  const cavemanOutline = renderLoomProjection(baseProjection, 'outline', { format: 'caveman' })
  const cavemanEdit = renderLoomProjection(baseProjection, 'edit', { format: 'caveman' })
  const cavemanIndex = renderLoomProjection(baseProjection, 'index', { format: 'caveman' })

  return {
    ...baseProjection,
    tokenEstimates: {
      source: estimateTokenCount(source),
      index: estimateTokenCount(index),
      outline: estimateTokenCount(outline),
      edit: estimateTokenCount(edit),
      cavemanIndex: estimateTokenCount(cavemanIndex),
      cavemanOutline: estimateTokenCount(cavemanOutline),
      cavemanEdit: estimateTokenCount(cavemanEdit),
    },
  }
}

export function renderLoomProjection(
  projection: LoomProjection,
  mode: ProjectionMode,
  options: ProjectionRenderOptions = {},
): string {
  if (isCavemanFormat(options.format)) {
    return renderCavemanProjection(projection, mode, options)
  }
  if (mode === 'index') {
    return renderIndex(projection)
  }
  if (mode === 'outline') {
    return renderOutline(projection)
  }
  return renderEdit(projection, options)
}

function isCavemanFormat(format: ProjectionFormat | undefined): boolean {
  return format === 'caveman' || format === 'ultra'
}

function renderIndex(projection: LoomProjection): string {
  const blocks =
    projection.blocks.length === 0
      ? ['- none']
      : projection.blocks.map((block) => `- [${block.id}] ${block.kind}${block.lang ? `:${block.lang}` : ''} lines=${block.span.start.line}-${block.span.end.line}`)

  return [
    `# File: ${projection.sourcePath}`,
    `Component: ${projection.componentName}`,
    'Mode: index',
    `Source Hash: ${projection.sourceHash}`,
    `Token Estimates: source=${projection.tokenEstimates.source}, index=${projection.tokenEstimates.index}, outline=${projection.tokenEstimates.outline}, edit=${projection.tokenEstimates.edit}, cavemanIndex=${projection.tokenEstimates.cavemanIndex}, cavemanOutline=${projection.tokenEstimates.cavemanOutline}, cavemanEdit=${projection.tokenEstimates.cavemanEdit}`,
    '',
    '## Blocks',
    ...blocks,
  ].join('\n')
}

function renderOutline(projection: LoomProjection): string {
  const diagnostics =
    projection.diagnostics.length === 0
      ? ['- none']
      : projection.diagnostics.map((diagnostic) => `- ${diagnostic.code}: ${diagnostic.message}`)

  const symbols = [
    renderSymbolLine('imports', projection.symbols.imports),
    renderSymbolLine('props', projection.symbols.props),
    renderSymbolLine('state', projection.symbols.state),
    renderSymbolLine('computed', projection.symbols.computed),
    renderSymbolLine('elements', projection.symbols.elements),
    renderSymbolLine('components', projection.symbols.components),
  ]

  const blocks =
    projection.blocks.length === 0
      ? ['- none']
      : projection.blocks.map((block) => `- [${block.id}] ${block.summary}`)

  const markupTree =
    projection.markupNodes.length === 0
      ? ['- none']
      : projection.markupNodes.map(
          (node) => `${'  '.repeat(node.depth)}- [${node.id}] ${node.summary}`,
        )

  return [
    `# File: ${projection.sourcePath}`,
    `Component: ${projection.componentName}`,
    'Mode: outline',
    `Source Hash: ${projection.sourceHash}`,
    `Token Estimates: source=${projection.tokenEstimates.source}, outline=${projection.tokenEstimates.outline}, edit=${projection.tokenEstimates.edit}`,
    '',
    '## Diagnostics',
    ...diagnostics,
    '',
    '## Symbols',
    ...symbols,
    '',
    '## Blocks',
    ...blocks,
    '',
    '## Markup Tree',
    ...markupTree,
  ].join('\n')
}

function renderEdit(projection: LoomProjection, options: ProjectionRenderOptions): string {
  const selectedBlocks =
    options.blocks && options.blocks.length > 0
      ? projection.blocks.filter((block) => options.blocks!.includes(block.id))
      : projection.blocks

  const content =
    selectedBlocks.length === 0
      ? ['(no blocks selected)']
      : selectedBlocks
          .flatMap((block, index) => {
            const body = dedentBlockContent(block.content)
            return [index === 0 ? '## Blocks' : '', `[${block.id}]`, body || '(empty)', '']
          })
          .filter(Boolean)

  return [
    `# File: ${projection.sourcePath}`,
    `Component: ${projection.componentName}`,
    'Mode: edit',
    `Selected Blocks: ${selectedBlocks.length > 0 ? selectedBlocks.map((block) => block.id).join(', ') : '(none)'}`,
    '',
    ...content,
  ].join('\n')
}

function renderCavemanProjection(
  projection: LoomProjection,
  mode: ProjectionMode,
  options: ProjectionRenderOptions,
): string {
  const selectedBlocks = selectBlocks(projection, options)
  const lines = [
    `@${projection.sourcePath}`,
    `#${projection.componentName}|m:${mode}|h:${shortHash(projection.sourceHash)}`,
  ]

  if (mode !== 'edit' || options.symbols !== 'all') {
    const symbols = mode === 'edit' ? filterSymbolsByBlocks(projection.symbols, selectedBlocks) : projection.symbols
    const symbolLine = renderCavemanSymbols(symbols)
    if (symbolLine) lines.push(symbolLine)
  } else {
    const symbolLine = renderCavemanSymbols(projection.symbols)
    if (symbolLine) lines.push(symbolLine)
  }

  const diagnostics = renderCavemanDiagnostics(projection)
  if (diagnostics) lines.push(diagnostics)

  if (mode === 'index') {
    lines.push('B:')
    lines.push(...renderCavemanBlocks(projection.blocks, false))
    return lines.join('\n')
  }

  if (mode === 'outline') {
    lines.push('B:')
    lines.push(...renderCavemanBlocks(projection.blocks, false))
    lines.push('T:')
    lines.push(...renderCavemanMarkupTree(projection))
    return lines.join('\n')
  }

  lines.push(`B:${selectedBlocks.length > 0 ? selectedBlocks.map((block) => block.id).join(',') : '_'}`)
  if (selectedBlocks.length === 0) return lines.join('\n')

  for (const block of selectedBlocks) {
    lines.push(`[${block.id}]`)
    lines.push(dedentBlockContent(block.content) || '_')
  }

  return lines.join('\n')
}

function selectBlocks(projection: LoomProjection, options: ProjectionRenderOptions) {
  return options.blocks && options.blocks.length > 0
    ? projection.blocks.filter((block) => options.blocks!.includes(block.id))
    : projection.blocks
}

function renderCavemanSymbols(symbols: ProjectionSymbols): string {
  return [
    cavemanSymbolPart('I', symbols.imports),
    cavemanSymbolPart('P', symbols.props),
    cavemanSymbolPart('S', symbols.state),
    cavemanSymbolPart('C', symbols.computed),
    cavemanSymbolPart('E', symbols.elements),
    cavemanSymbolPart('K', symbols.components),
  ].filter(Boolean).join('|')
}

function cavemanSymbolPart(label: string, values: string[]): string {
  return values.length > 0 ? `${label}:${values.join(',')}` : ''
}

function renderCavemanDiagnostics(projection: LoomProjection): string {
  if (projection.diagnostics.length === 0) return ''
  return `D:${projection.diagnostics.map((diagnostic) => diagnostic.code).join(',')}`
}

function renderCavemanBlocks(blocks: LoomProjection['blocks'], includeSummary: boolean): string[] {
  if (blocks.length === 0) return [' _']
  return blocks.map((block) => {
    const lang = block.lang ? `:${block.lang}` : ''
    const range = `${block.span.start.line}-${block.span.end.line}`
    return includeSummary
      ? ` ${block.id}|${block.kind}${lang}|L${range}|${compressSummary(block.summary)}`
      : ` ${block.id}|${block.kind}${lang}|L${range}`
  })
}

function renderCavemanMarkupTree(projection: LoomProjection): string[] {
  if (projection.markupNodes.length === 0) return [' _']
  return projection.markupNodes.map((node) => `${' '.repeat(node.depth + 1)}${compressMarkupSummary(node.summary)}`)
}

function filterSymbolsByBlocks(
  symbols: ProjectionSymbols,
  blocks: LoomProjection['blocks'],
): ProjectionSymbols {
  const text = blocks.map((block) => block.content).join('\n')
  return {
    imports: symbols.imports,
    props: filterUsed(symbols.props, text),
    state: filterUsed(symbols.state, text),
    computed: filterUsed(symbols.computed, text),
    elements: symbols.elements,
    components: symbols.components,
  }
}

function filterUsed(values: string[], text: string): string[] {
  return values.filter((value) => new RegExp(`\\b${escapeRegExp(value)}\\b`).test(text))
}

function compressSummary(summary: string): string {
  return summary
    .replace(/^(\d+) props?: /, 'p:')
    .replace(/^(\d+) state variables?: /, 's:')
    .replace(/^(\d+) computed propert(?:y|ies): /, 'c:')
    .replace(/^ts logic importing /, 'ts:')
    .replace(/^js logic importing /, 'js:')
    .replace(/^ts logic block$/, 'ts')
    .replace(/^js logic block$/, 'js')
    .replace(/^(\d+) markup nodes? using /, 'm:')
    .replace(/^element /, '')
    .replace(/ \(\d+ children?\)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function compressMarkupSummary(summary: string): string {
  return compressSummary(summary)
    .replace(/^text "(.+)"$/, '"$1"')
    .replace(/^else if /, 'elif:')
    .replace(/^if /, 'if:')
    .replace(/^each ([^ ]+)(?:, ([^ ]+))? in (.+)$/, (_match, item, index, list) =>
      index ? `each:${item},${index}<-${list}` : `each:${item}<-${list}`,
    )
    .replace(/^slot definition /, 'slot:')
    .replace(/^default slot definition$/, 'slot:_')
    .replace(/^slot content /, 'fill:')
    .replace(/^default slot content$/, 'fill:_')
    .replace(/^comment "(.+)"$/, '//"$1"')
}

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, '').slice(0, 12)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dedentBlockContent(content: string): string {
  const normalized = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/, '')
  const lines = normalized.split('\n')
  const minIndent = lines
    .filter((line) => line.trim() !== '')
    .reduce((min, line) => {
      const indent = line.match(/^[ \t]*/)?.[0].length ?? 0
      return Math.min(min, indent)
    }, Number.POSITIVE_INFINITY)

  if (!Number.isFinite(minIndent)) return normalized.trim()

  return lines.map((line) => (line.trim() === '' ? '' : line.slice(minIndent))).join('\n')
}

function collectSymbols(
  logicSource: string,
  props: string[],
  state: string[],
  computed: string[],
  markup: MarkupNode[],
): ProjectionSymbols {
  const imports = [
    ...new Set(
      [...logicSource.matchAll(/import\s+(?:type\s+)?(?:.+?\s+from\s+)?['"]([^'"]+)['"]/g)].map(
        (match) => match[1]!,
      ),
    ),
  ]
  const elements = new Set<string>()
  const components = new Set<string>()

  const visit = (node: MarkupNode) => {
    switch (node.kind) {
      case 'element':
        if (/^[A-Z]/.test(node.tag) || node.tag === 'element') {
          components.add(node.tag)
        } else {
          elements.add(node.tag)
        }
        node.children.forEach(visit)
        return
      case 'if':
        node.consequent.forEach(visit)
        if (node.alternate) visit(node.alternate)
        return
      case 'elseif':
        node.consequent.forEach(visit)
        if (node.alternate) visit(node.alternate)
        return
      case 'else':
        node.children.forEach(visit)
        return
      case 'each':
      case 'slot-use':
        node.children.forEach(visit)
        return
      default:
        return
    }
  }

  markup.forEach(visit)

  return {
    imports,
    props,
    state,
    computed,
    elements: [...elements],
    components: [...components],
  }
}

function renderSymbolLine(label: string, values: string[]): string {
  return `- ${label}: ${values.length > 0 ? values.join(', ') : 'none'}`
}

function toProjectPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/')
}
