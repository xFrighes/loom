import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { IndexManifest, LoomProjection } from './types.js'

export const CACHE_VERSION = 1

export function hashText(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`
}

export function resolveCacheRoot(root: string, cacheDir = '.loom-llm'): string {
  return path.isAbsolute(cacheDir) ? cacheDir : path.join(root, cacheDir)
}

export function ensureCacheLayout(cacheRoot: string): void {
  mkdirSync(path.join(cacheRoot, 'projections'), { recursive: true })
}

export function readManifest(cacheRoot: string): IndexManifest | null {
  const manifestPath = path.join(cacheRoot, 'index.json')
  if (!existsSync(manifestPath)) return null
  return readJsonFile<IndexManifest>(manifestPath)
}

export function writeManifest(cacheRoot: string, manifest: IndexManifest): void {
  ensureCacheLayout(cacheRoot)
  writeFileSync(
    path.join(cacheRoot, 'index.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
}

export function writeProjection(cacheRoot: string, projection: LoomProjection): string {
  ensureCacheLayout(cacheRoot)
  const cacheFile = createProjectionCacheFile(projection.sourcePath)
  const destination = path.join(cacheRoot, cacheFile)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')
  return cacheFile
}

export function readProjection(cacheRoot: string, cacheFile: string): LoomProjection | null {
  const projectionPath = path.join(cacheRoot, cacheFile)
  if (!existsSync(projectionPath)) return null
  return readJsonFile<LoomProjection>(projectionPath)
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function createProjectionCacheFile(sourcePath: string): string {
  const slug = sourcePath
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\//g, '__')
  const suffix = createHash('sha1').update(sourcePath).digest('hex').slice(0, 12)
  return path.posix.join('projections', `${slug}-${suffix}.json`)
}
