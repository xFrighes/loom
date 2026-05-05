export type RouteSegmentKind = 'static' | 'dynamic' | 'catchall'

export type RouteSegment = {
  kind: RouteSegmentKind
  name: string
}

export type RouteManifestEntry = {
  id: string
  path: string
  file: string
  segments: RouteSegment[]
  layoutFiles: string[]
  loadFile?: string
  errorFile?: string
  loadingFile?: string
}

export type PageLoadEvent = {
  params: Record<string, string>
  url: URL
  request?: Request
}

export type PageLoad<TData = unknown> = (event: PageLoadEvent) => TData | Promise<TData>

export type MatchedRoute = {
  entry: RouteManifestEntry
  params: Record<string, string>
}

export function routePathFromFile(file: string, routesRoot = 'src/routes'): string {
  const normalizedFile = normalizePath(file)
  const normalizedRoot = normalizePath(routesRoot).replace(/\/$/, '')
  const withoutRoot = normalizedFile.startsWith(`${normalizedRoot}/`)
    ? normalizedFile.slice(normalizedRoot.length + 1)
    : normalizedFile
  const directory = withoutRoot.endsWith('/page.loom')
    ? withoutRoot.slice(0, -'/page.loom'.length)
    : withoutRoot.replace(/\/?page\.loom$/, '')
  const parts = directory.split('/').filter(Boolean)
  return `/${parts.map(routePartToPathPart).filter(Boolean).join('/')}`.replace(/\/+$/, '') || '/'
}

export function parseRouteSegments(routePath: string): RouteSegment[] {
  return normalizePath(routePath)
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('[...') && part.endsWith(']')) {
        return { kind: 'catchall', name: part.slice(4, -1) }
      }
      if (part.startsWith('[') && part.endsWith(']')) {
        return { kind: 'dynamic', name: part.slice(1, -1) }
      }
      return { kind: 'static', name: part }
    })
}

export function createRouteEntry(file: string, options: {
  routesRoot?: string
  layoutFiles?: string[]
  loadFile?: string
  errorFile?: string
  loadingFile?: string
} = {}): RouteManifestEntry {
  const path = routePathFromFile(file, options.routesRoot)
  return {
    id: stableRouteId(path),
    path,
    file: normalizePath(file),
    segments: parseRouteSegments(path),
    layoutFiles: options.layoutFiles?.map(normalizePath) ?? [],
    loadFile: options.loadFile ? normalizePath(options.loadFile) : undefined,
    errorFile: options.errorFile ? normalizePath(options.errorFile) : undefined,
    loadingFile: options.loadingFile ? normalizePath(options.loadingFile) : undefined,
  }
}

export function matchRoute(pathname: string, manifest: RouteManifestEntry[]): MatchedRoute | null {
  const urlParts = normalizePath(pathname).split('/').filter(Boolean)
  for (const entry of manifest) {
    const params: Record<string, string> = {}
    if (matchSegments(entry.segments, urlParts, params)) {
      return { entry, params }
    }
  }
  return null
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  return new Response(JSON.stringify(data), { ...init, headers })
}

function matchSegments(segments: RouteSegment[], parts: string[], params: Record<string, string>): boolean {
  let index = 0
  for (const segment of segments) {
    const part = parts[index]
    if (segment.kind === 'catchall') {
      params[segment.name] = parts.slice(index).map(decodeURIComponent).join('/')
      return true
    }
    if (part === undefined) return false
    if (segment.kind === 'static' && segment.name !== part) return false
    if (segment.kind === 'dynamic') params[segment.name] = decodeURIComponent(part)
    index += 1
  }
  return index === parts.length
}

function routePartToPathPart(part: string): string {
  if (part.startsWith('(') && part.endsWith(')')) return ''
  return part
}

function stableRouteId(path: string): string {
  return path === '/' ? 'root' : path.slice(1).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}
