import { readFileSync, writeFileSync } from 'node:fs'
import { extractLoomStructure } from '@loom-kit/compiler'
import type {
  LoomMarkupNodeRef,
  LoomTopLevelBlock,
  LoomTopLevelBlockKind,
  SourceSpan,
} from '@loom-kit/compiler'
import { hashText } from '../cache.js'
import { verifyLoomSource } from '../indexer.js'
import type { VerifyFileResult } from '../types.js'
import type { LoomPatchBundle, LoomPatchOp } from './ops.js'
import { assertValidPatchBundle } from './validate.js'

type ApplyOptions = {
  force?: boolean
}

type ApplyResult = {
  nextSource: string
  verification: VerifyFileResult
}

type TextEdit = {
  start: number
  end: number
  replacement: string
  originalIndex: number
}

export function previewApplyPatchBundle(
  source: string,
  sourcePath: string,
  bundle: LoomPatchBundle,
  options: ApplyOptions = {},
): ApplyResult {
  assertValidPatchBundle(bundle)

  const currentHash = hashText(source)
  if (!options.force && currentHash !== bundle.sourceHash) {
    throw new Error(
      `File has drifted. Rejecting patch. Expected ${bundle.sourceHash}, got ${currentHash}. Please prompt the LLM to regenerate the patch against the latest source.`,
    )
  }

  const nextSource = applyOperations(source, bundle.ops)

  const verification = verifyLoomSource(nextSource, sourcePath)
  if (!verification.ok) {
    throw new Error(formatVerificationFailure(verification))
  }

  return { nextSource, verification }
}

export function applyPatchBundleToFile(
  filePath: string,
  bundle: LoomPatchBundle,
  options: ApplyOptions = {},
): ApplyResult {
  const source = readFileSync(filePath, 'utf8')
  const result = previewApplyPatchBundle(source, filePath, bundle, options)
  writeFileSync(filePath, result.nextSource, 'utf8')
  return result
}

function applyOperations(source: string, ops: LoomPatchOp[]): string {
  const structure = extractLoomStructure(source)
  const blocks = new Map(structure.blocks.map((block) => [block.id, block]))
  const nodes = new Map(structure.markupNodes.map((node) => [node.id, node]))
  const edits = ops.map((op, index) => ({
    ...createEdit(source, op, blocks, nodes),
    originalIndex: index,
  }))
  return applyNonOverlappingEdits(source, edits)
}

function createEdit(
  source: string,
  op: LoomPatchOp,
  blocks: Map<string, LoomTopLevelBlock>,
  nodes: Map<string, LoomMarkupNodeRef>,
): Omit<TextEdit, 'originalIndex'> {
  switch (op.op) {
    case 'replace-block': {
      const block = blocks.get(op.blockId)
      if (!block) throw new Error(`Unknown block id: ${op.blockId}`)
      const replacement = serializeTopLevelBlock(block.kind, op.content, op.lang ?? block.lang)
      return { start: block.span.start.offset, end: block.span.end.offset, replacement }
    }

    case 'insert-block-after': {
      const replacement = serializeTopLevelBlock(op.blockKind, op.content, op.lang)
      if (!op.afterBlockId) {
        return source.trim().length === 0
          ? { start: 0, end: source.length, replacement }
          : {
              start: source.replace(/\s*$/, '').length,
              end: source.length,
              replacement: `\n\n${replacement}`,
            }
      }

      const block = blocks.get(op.afterBlockId)
      if (!block) throw new Error(`Unknown block id: ${op.afterBlockId}`)
      return {
        start: block.span.end.offset,
        end: block.span.end.offset,
        replacement: `\n\n${replacement}`,
      }
    }

    case 'delete-block': {
      const block = blocks.get(op.blockId)
      if (!block) throw new Error(`Unknown block id: ${op.blockId}`)
      return { start: block.span.start.offset, end: block.span.end.offset, replacement: '' }
    }

    case 'replace-node': {
      const node = nodes.get(op.nodeId)
      if (!node) throw new Error(`Unknown node id: ${op.nodeId}`)
      const range = expandNodeRange(source, node.span)
      const replacement = normalizeNodeSnippet(
        op.content,
        range.inline ? 0 : node.span.start.column - 1,
      )
      return { start: range.start, end: range.end, replacement }
    }

    case 'delete-node': {
      const node = nodes.get(op.nodeId)
      if (!node) throw new Error(`Unknown node id: ${op.nodeId}`)
      const range = expandNodeRange(source, node.span)
      return { start: range.start, end: range.end, replacement: '' }
    }

    case 'replace-raw-range': {
      if (op.end > source.length) {
        throw new Error(`Raw range end ${op.end} exceeds source length ${source.length}.`)
      }
      return { start: op.start, end: op.end, replacement: op.content }
    }
  }
}

function applyNonOverlappingEdits(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start
    if (a.end !== b.end) return b.end - a.end
    return b.originalIndex - a.originalIndex
  })

  let previousStart = source.length + 1
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error(`Invalid edit range ${edit.start}:${edit.end}.`)
    }
    if (edit.end > previousStart) {
      throw new Error(
        `Patch bundle contains overlapping edit ranges: ${edit.start}-${edit.end} overlaps with previous edit starting at ${previousStart}.`,
      )
    }
    previousStart = edit.start
  }

  return sorted.reduce(
    (nextSource, edit) => replaceRange(nextSource, edit.start, edit.end, edit.replacement),
    source,
  )
}

function serializeTopLevelBlock(
  kind: LoomTopLevelBlockKind,
  content: string,
  lang?: 'ts' | 'js',
): string {
  const body = stripKnownHeader(content).trimEnd()
  switch (kind) {
    case 'generics':
      return body ? `- generics\n${indentBlock(body)}` : '- generics'
    case 'props':
      return body ? `- props\n${indentBlock(body)}` : '- props'
    case 'state':
      return body ? `- state\n${indentBlock(body)}` : '- state'
    case 'computed':
      return body ? `- computed\n${indentBlock(body)}` : '- computed'
    case 'onMount':
      return body ? `- onMount\n${indentBlock(body)}` : '- onMount'
    case 'onUpdate':
      return body ? `- onUpdate\n${indentBlock(body)}` : '- onUpdate'
    case 'onUnmount':
      return body ? `- onUnmount\n${indentBlock(body)}` : '- onUnmount'
    case 'logic': {
      const resolvedLang = lang ?? 'ts'
      return body ? `- ${resolvedLang}\n${indentBlock(body)}` : `- ${resolvedLang}`
    }
    case 'markup':
      return body ? `- view\n${indentBlock(body)}` : '- view'
    default:
      return body
  }
}

function normalizeNodeSnippet(content: string, indent: number): string {
  const stripped = stripKnownHeader(content)
  const normalized = dedentBlock(stripped).trimEnd()
  if (!normalized) return ''
  const prefix = ' '.repeat(Math.max(0, indent))
  return normalized
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${prefix}${line}`))
    .join('\n')
}

function stripKnownHeader(content: string): string {
  const normalized = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const lines = normalized.split('\n')
  const first = lines[0]?.trim()
  if (first && /^- (generics|props|ts|js|view)$/.test(first)) {
    return lines.slice(1).join('\n')
  }
  return normalized
}

function indentBlock(content: string): string {
  const dedented = dedentBlock(content)
  return dedented
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n')
}

function dedentBlock(content: string): string {
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

function expandNodeRange(
  source: string,
  span: SourceSpan,
): { start: number; end: number; inline: boolean } {
  const lineStart = source.lastIndexOf('\n', Math.max(0, span.start.offset - 1)) + 1
  const prefix = source.slice(lineStart, span.start.offset)
  const inline = prefix.trim() !== ''
  const start = inline ? span.start.offset : lineStart

  const lineEnd = findLineEnd(source, span.end.offset)
  const suffix = source.slice(span.end.offset, lineEnd)
  let end = suffix.trim() === '' ? lineEnd : span.end.offset

  if (!inline && end < source.length && source[end] === '\n') {
    end += 1
  }

  return { start, end, inline }
}

function findLineEnd(source: string, offset: number): number {
  const newline = source.indexOf('\n', offset)
  return newline === -1 ? source.length : newline
}

function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function formatVerificationFailure(result: VerifyFileResult): string {
  const diagnostics = result.diagnostics.map(
    (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
  )
  const targetErrors = result.targets
    .filter((target) => !target.ok)
    .map((target) => `${target.target}: ${target.error}`)
  return ['Patched source failed verification.', ...diagnostics, ...targetErrors].join('\n')
}
