import { existsSync, globSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { analyze, compile } from '@loom-kit/compiler'
import type { CompilerDiagnostic } from '@loom-kit/compiler'
import {
  ensureCacheLayout,
  hashText,
  readManifest,
  readProjection,
  resolveCacheRoot,
  writeManifest,
  writeProjection,
} from './cache.js'
import { createLoomProjection } from './projector/loom.js'
import type {
  GlobalContext,
  IndexManifest,
  IndexManifestEntry,
  IndexResult,
  LoomProjection,
  ProjectionSymbols,
  VerifyFileResult,
  VerifyTargetResult,
} from './types.js'

type SharedOptions = {
  root?: string
  cacheDir?: string
}

type IndexOptions = SharedOptions & {
  inputs?: string[]
}

type ProjectionLookupOptions = SharedOptions & {
  input: string
}

import { tryRustIndexWorkspace } from './rust-indexer.js'

export function indexWorkspace(options: IndexOptions = {}): IndexResult {
  const root = resolveRoot(options.root)
  const rustResult = tryRustIndexWorkspace({ ...options, root })
  if (rustResult) {
    return rustResult
  }

  const cacheRoot = resolveCacheRoot(root, options.cacheDir)
  ensureCacheLayout(cacheRoot)

  const existingManifest = readManifest(cacheRoot)
  const existingEntries = new Map(
    (existingManifest?.files ?? []).map((entry) => [entry.sourcePath, entry]),
  )
  const files = collectLoomFiles(root, options.inputs)
  const nextEntries: IndexManifestEntry[] = []
  let indexed = 0
  let reused = 0

  for (const absolutePath of files) {
    const source = readFileSync(absolutePath, 'utf8')
    const sourceHash = hashText(source)
    const sourcePath = toProjectPath(root, absolutePath)
    const cachedEntry = existingEntries.get(sourcePath)

    if (
      cachedEntry &&
      cachedEntry.sourceHash === sourceHash &&
      readProjection(cacheRoot, cachedEntry.cacheFile)
    ) {
      nextEntries.push(cachedEntry)
      reused += 1
      continue
    }

    const projection = createLoomProjection(root, absolutePath, source)
    const cacheFile = writeProjection(cacheRoot, projection)
    nextEntries.push({
      sourcePath,
      sourceHash: projection.sourceHash,
      cacheFile,
      language: 'loom',
      tokenEstimates: projection.tokenEstimates,
      diagnostics: projection.diagnostics.length,
      generatedAt: projection.generatedAt,
    })
    indexed += 1
  }

  if (options.inputs && options.inputs.length > 0) {
    for (const entry of existingEntries.values()) {
      if (!nextEntries.some((candidate) => candidate.sourcePath === entry.sourcePath)) {
        nextEntries.push(entry)
      }
    }
  }

  nextEntries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))

  const manifest: IndexManifest = {
    version: 1,
    root,
    generatedAt: new Date().toISOString(),
    globalContext: buildGlobalContext(cacheRoot, nextEntries),
    files: nextEntries,
  }

  writeManifest(cacheRoot, manifest)

  const removed =
    existingEntries.size === 0 || (options.inputs && options.inputs.length > 0)
      ? 0
      : Math.max(0, existingEntries.size - nextEntries.length)

  return { manifest, indexed, reused, removed }
}

export function ensureProjectionForPath(options: ProjectionLookupOptions): LoomProjection {
  const root = resolveRoot(options.root)
  const cacheRoot = resolveCacheRoot(root, options.cacheDir)
  const absolutePath = resolveInputPath(root, options.input)
  const sourcePath = toProjectPath(root, absolutePath)
  const source = readFileSync(absolutePath, 'utf8')
  const sourceHash = hashText(source)
  const manifest = readManifest(cacheRoot)
  const existingEntry = manifest?.files.find((entry) => entry.sourcePath === sourcePath)

  if (existingEntry && existingEntry.sourceHash === sourceHash) {
    const cachedProjection = readProjection(cacheRoot, existingEntry.cacheFile)
    if (cachedProjection) return cachedProjection
  }

  const projection = createLoomProjection(root, absolutePath, source)
  const cacheFile = writeProjection(cacheRoot, projection)
  const nextEntries = new Map((manifest?.files ?? []).map((entry) => [entry.sourcePath, entry]))
  nextEntries.set(sourcePath, {
    sourcePath,
    sourceHash: projection.sourceHash,
    cacheFile,
    language: 'loom',
    tokenEstimates: projection.tokenEstimates,
    diagnostics: projection.diagnostics.length,
    generatedAt: projection.generatedAt,
  })

  const files = [...nextEntries.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  )
  writeManifest(cacheRoot, {
    version: 1,
    root,
    generatedAt: new Date().toISOString(),
    globalContext: buildGlobalContext(cacheRoot, files),
    files,
  })

  return projection
}

export function verifyWorkspace(options: IndexOptions = {}): VerifyFileResult[] {
  const root = resolveRoot(options.root)
  const files = collectLoomFiles(root, options.inputs)
  return files.map((absolutePath) =>
    verifyLoomSource(readFileSync(absolutePath, 'utf8'), toProjectPath(root, absolutePath)),
  )
}

export function verifyLoomSource(source: string, sourcePath: string): VerifyFileResult {
  const { diagnostics } = analyze(source)
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error')

  const targets: VerifyTargetResult[] = hasErrors
    ? []
    : (['react', 'vue', 'svelte'] as const).map((target) => {
        try {
          compile(source, {
            componentName: path.basename(sourcePath, '.loom'),
            target,
            sourceFile: sourcePath,
          })
          return { target, ok: true }
        } catch (error) {
          return {
            target,
            ok: false,
            error: formatCompileError(error),
          }
        }
      })

  return {
    sourcePath,
    ok: !hasErrors && targets.every((target) => target.ok),
    diagnostics,
    targets,
  }
}

export function formatDiagnostics(diagnostics: CompilerDiagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
}

function collectLoomFiles(root: string, inputs?: string[]): string[] {
  if (inputs && inputs.length > 0) {
    const files = inputs.flatMap((input) => collectFromInput(root, resolveInputPath(root, input)))
    return [...new Set(files)].sort()
  }

  return walkForLoomFiles(root).sort()
}

function collectFromInput(root: string, absolutePath: string): string[] {
  if (!existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${absolutePath}`)
  }

  const entry = path.resolve(absolutePath)
  const stats = lstatSync(entry)
  if (stats.isDirectory()) {
    return walkForLoomFiles(entry)
  }
  if (entry.endsWith('.loom')) return [entry]
  return []
}

function walkForLoomFiles(directory: string): string[] {
  return globSync('**/*.loom', {
    cwd: directory,
    exclude: [...IGNORED_DIRECTORIES].map((name) => `**/${name}/**`),
  }).map((entry) => path.join(directory, String(entry)))
}

function resolveRoot(root?: string): string {
  return path.resolve(root ?? process.cwd())
}

function resolveInputPath(root: string, input: string): string {
  const absolute = path.resolve(root, input)
  const relative = path.relative(root, absolute)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return absolute
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the workspace root: ${input}`)
  }
  return absolute
}

function toProjectPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/')
}

function formatCompileError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function buildGlobalContext(cacheRoot: string, entries: IndexManifestEntry[]): GlobalContext {
  const refs = new Map<string, { kind: keyof ProjectionSymbols; name: string; files: Set<string> }>()

  for (const entry of entries) {
    const projection = readProjection(cacheRoot, entry.cacheFile)
    if (!projection) continue

    for (const kind of GLOBAL_SYMBOL_KINDS) {
      for (const name of projection.symbols[kind]) {
        const key = `${kind}:${name}`
        const existing = refs.get(key)
        if (existing) {
          existing.files.add(entry.sourcePath)
        } else {
          refs.set(key, { kind, name, files: new Set([entry.sourcePath]) })
        }
      }
    }
  }

  const symbols = [...refs.values()]
    .filter((ref) => ref.files.size > 1)
    .sort((left, right) => {
      const kindOrder = GLOBAL_SYMBOL_KINDS.indexOf(left.kind) - GLOBAL_SYMBOL_KINDS.indexOf(right.kind)
      return kindOrder !== 0 ? kindOrder : left.name.localeCompare(right.name)
    })
    .map((ref, index) => ({
      id: `G${index + 1}`,
      kind: ref.kind,
      name: ref.name,
      files: [...ref.files].sort(),
    }))

  return { symbols }
}

const GLOBAL_SYMBOL_KINDS = [
  'imports',
  'props',
  'state',
  'computed',
  'elements',
  'components',
] satisfies (keyof ProjectionSymbols)[]

const IGNORED_DIRECTORIES = new Set(['.git', '.loom-llm', 'dist', 'node_modules'])
