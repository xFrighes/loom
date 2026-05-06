import { compile, type AnalyzeOptions, type AnalyzeResult, type CompileOptions } from './index.js'
import { extractLoomStructure, type LoomTopLevelBlockKind } from './blocks.js'
import { hasErrors, validate } from './validate.js'
import type { CompileResult } from './codegen/target.js'
import type { LoomFile } from './ast.js'

export type ZoneCacheEntry = {
  id: string
  kind: LoomTopLevelBlockKind
  hash: string
}

export type IncrementalCacheStats = {
  parseHits: number
  parseMisses: number
  analysisHits: number
  analysisMisses: number
  codegenHits: number
  codegenMisses: number
}

export type IncrementalCompileResult = CompileResult & {
  cache: {
    hit: boolean
    zones: ZoneCacheEntry[]
    stats: IncrementalCacheStats
  }
}

type ParsedEntry = {
  sourceHash: string
  zoneKey: string
  file: LoomFile
  zones: ZoneCacheEntry[]
}

type AnalysisEntry = AnalyzeResult & {
  sourceHash: string
  zoneKey: string
}

export class IncrementalCache {
  private parsed = new Map<string, ParsedEntry>()
  private analyzed = new Map<string, AnalysisEntry>()
  private generated = new Map<string, CompileResult>()
  private stats: IncrementalCacheStats = {
    parseHits: 0,
    parseMisses: 0,
    analysisHits: 0,
    analysisMisses: 0,
    codegenHits: 0,
    codegenMisses: 0,
  }

  parse(sourceFile: string, source: string): { file: LoomFile; zones: ZoneCacheEntry[] } {
    const sourceHash = hash(source)
    const cached = this.parsed.get(sourceFile)
    if (cached?.sourceHash === sourceHash) {
      this.stats.parseHits += 1
      return { file: cached.file, zones: cached.zones }
    }

    this.stats.parseMisses += 1
    const structure = extractLoomStructure(source)
    const zones = structure.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      hash: hash(block.raw),
    }))
    this.parsed.set(sourceFile, {
      sourceHash,
      zoneKey: createZoneKey(zones),
      file: structure.file,
      zones,
    })
    return { file: structure.file, zones }
  }

  analyze(sourceFile: string, source: string, options: AnalyzeOptions = {}): AnalyzeResult & { zones: ZoneCacheEntry[] } {
    const parsed = this.parse(sourceFile, source)
    const sourceHash = hash(source)
    const zoneKey = createZoneKey(parsed.zones)
    const analysisKey = `${sourceFile}:${JSON.stringify(options)}`
    const cached = this.analyzed.get(analysisKey)
    if (cached?.sourceHash === sourceHash && cached.zoneKey === zoneKey) {
      this.stats.analysisHits += 1
      return { file: cached.file, diagnostics: cached.diagnostics, zones: parsed.zones }
    }

    this.stats.analysisMisses += 1
    const diagnostics = validate(parsed.file, options)
    const result = { sourceHash, zoneKey, file: parsed.file, diagnostics }
    this.analyzed.set(analysisKey, result)
    return { file: parsed.file, diagnostics, zones: parsed.zones }
  }

  compile(sourceFile: string, source: string, options: CompileOptions): IncrementalCompileResult {
    const analysis = this.analyze(sourceFile, source, {
      strictA11y: options.strictA11y,
      security: options.security,
    })
    if (!analysis.file || hasErrors(analysis.diagnostics)) {
      const error = new Error(analysis.diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
      throw error
    }

    const zoneKey = createZoneKey(analysis.zones)
    const codegenKey = JSON.stringify({
      sourceFile,
      zoneKey,
      componentName: options.componentName,
      target: options.target,
      cssImportPath: options.cssImportPath,
      ssr: options.ssr,
      atomicCss: options.atomicCss,
    })
    const cached = this.generated.get(codegenKey)
    if (cached) {
      this.stats.codegenHits += 1
      return {
        ...cached,
        cache: { hit: true, zones: analysis.zones, stats: this.getStats() },
      }
    }

    this.stats.codegenMisses += 1
    const result = compile(source, options)
    this.generated.set(codegenKey, result)
    return {
      ...result,
      cache: { hit: false, zones: analysis.zones, stats: this.getStats() },
    }
  }

  getStats(): IncrementalCacheStats {
    return { ...this.stats }
  }

  clear(): void {
    this.parsed.clear()
    this.analyzed.clear()
    this.generated.clear()
    this.stats = {
      parseHits: 0,
      parseMisses: 0,
      analysisHits: 0,
      analysisMisses: 0,
      codegenHits: 0,
      codegenMisses: 0,
    }
  }
}

export function createIncrementalCache(): IncrementalCache {
  return new IncrementalCache()
}

function createZoneKey(zones: ZoneCacheEntry[]): string {
  return zones.map((zone) => `${zone.id}:${zone.hash}`).join('|')
}

function hash(value: string): string {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}
