import type { CompilerDiagnostic, LoomMarkupNodeRef, LoomTopLevelBlock } from '@loom-kit/compiler'

export type ProjectionMode = 'outline' | 'edit' | 'index'

export type ProjectionFormat = 'markdown' | 'caveman' | 'ultra'

export type ProjectionSymbols = {
  imports: string[]
  props: string[]
  state: string[]
  computed: string[]
  elements: string[]
  components: string[]
}

export type GlobalContextSymbol = {
  id: string
  kind: keyof ProjectionSymbols
  name: string
  files: string[]
}

export type GlobalContext = {
  symbols: GlobalContextSymbol[]
}

export type TokenEstimates = {
  source: number
  index: number
  outline: number
  edit: number
  cavemanIndex: number
  cavemanOutline: number
  cavemanEdit: number
}

export type LoomProjection = {
  version: 1
  sourcePath: string
  sourceHash: string
  language: 'loom'
  componentName: string
  generatedAt: string
  diagnostics: CompilerDiagnostic[]
  blocks: LoomTopLevelBlock[]
  markupNodes: LoomMarkupNodeRef[]
  symbols: ProjectionSymbols
  tokenEstimates: TokenEstimates
}

export type ProjectionRenderOptions = {
  blocks?: string[]
  format?: ProjectionFormat
  symbols?: 'all' | 'used'
}

export type IndexManifestEntry = {
  sourcePath: string
  sourceHash: string
  cacheFile: string
  language: 'loom'
  tokenEstimates: TokenEstimates
  diagnostics: number
  generatedAt: string
}

export type IndexManifest = {
  version: 1
  root: string
  generatedAt: string
  globalContext: GlobalContext
  files: IndexManifestEntry[]
}

export type IndexResult = {
  manifest: IndexManifest
  indexed: number
  reused: number
  removed: number
}

export type VerifyTargetResult = {
  target: 'react' | 'vue' | 'svelte'
  ok: boolean
  error?: string
}

export type VerifyFileResult = {
  sourcePath: string
  ok: boolean
  diagnostics: CompilerDiagnostic[]
  targets: VerifyTargetResult[]
}
