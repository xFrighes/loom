import { readFileSync } from 'node:fs'
import type { LoomTopLevelBlockKind } from '@loom-lang/compiler'

export type ReplaceBlockOp = {
  op: 'replace-block'
  blockId: string
  content: string
  lang?: 'ts' | 'js'
}

export type InsertBlockAfterOp = {
  op: 'insert-block-after'
  afterBlockId?: string | null
  blockKind: LoomTopLevelBlockKind
  content: string
  lang?: 'ts' | 'js'
}

export type DeleteBlockOp = {
  op: 'delete-block'
  blockId: string
}

export type ReplaceNodeOp = {
  op: 'replace-node'
  nodeId: string
  content: string
}

export type DeleteNodeOp = {
  op: 'delete-node'
  nodeId: string
}

export type ReplaceRawRangeOp = {
  op: 'replace-raw-range'
  start: number
  end: number
  content: string
}

export type LoomPatchOp =
  | ReplaceBlockOp
  | InsertBlockAfterOp
  | DeleteBlockOp
  | ReplaceNodeOp
  | DeleteNodeOp
  | ReplaceRawRangeOp

export type LoomPatchBundle = {
  version: 1
  sourcePath?: string
  sourceHash: string
  ops: LoomPatchOp[]
}

export function readPatchBundleFromFile(filePath: string): LoomPatchBundle | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as LoomPatchBundle
  } catch {
    return null
  }
}
