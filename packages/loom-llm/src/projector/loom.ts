import path from 'node:path'
import { analyze, extractLoomStructure } from '@loom-lang/compiler'
import type { MarkupNode } from '@loom-lang/compiler'
import type {
  LoomProjection,
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
    tokenEstimates: { source: 0, outline: 0, edit: 0 },
  }

  const outline = renderLoomProjection(baseProjection, 'outline')
  const edit = renderLoomProjection(baseProjection, 'edit')

  return {
    ...baseProjection,
    tokenEstimates: {
      source: estimateTokenCount(source),
      outline: estimateTokenCount(outline),
      edit: estimateTokenCount(edit),
    },
  }
}

export function renderLoomProjection(
  projection: LoomProjection,
  mode: ProjectionMode,
  options: ProjectionRenderOptions = {},
): string {
  if (mode === 'outline') {
    return renderOutline(projection)
  }
  return renderEdit(projection, options)
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
