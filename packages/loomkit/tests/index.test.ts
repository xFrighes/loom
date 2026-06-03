import { describe, expect, it } from 'vitest'
import { createRouteEntry, json, matchRoute, parseRouteSegments, routePathFromFile } from '../src/index.js'

describe('@loom-ui/kit', () => {
  it('derives paths from route files', () => {
    expect(routePathFromFile('src/routes/page.loom')).toBe('/')
    expect(routePathFromFile('src/routes/blog/[slug]/page.loom')).toBe('/blog/[slug]')
    expect(routePathFromFile('src/routes/(marketing)/pricing/page.loom')).toBe('/pricing')
  })

  it('matches dynamic routes', () => {
    const entry = createRouteEntry('src/routes/blog/[slug]/page.loom')
    const match = matchRoute('/blog/hello-world', [entry])
    expect(match?.params.slug).toBe('hello-world')
  })

  it('prefers more specific routes regardless of manifest order', () => {
    const catchall = createRouteEntry('src/routes/[...path]/page.loom')
    const staticEntry = createRouteEntry('src/routes/docs/page.loom')
    const dynamic = createRouteEntry('src/routes/[slug]/page.loom')

    expect(matchRoute('/docs', [catchall, dynamic, staticEntry])?.entry.id).toBe(staticEntry.id)
    expect(matchRoute('/about', [catchall, dynamic, staticEntry])?.entry.id).toBe(dynamic.id)
    expect(matchRoute('/docs/install', [catchall, dynamic, staticEntry])?.entry.id).toBe(catchall.id)
  })

  it('decodes route params and rejects malformed encoded paths', () => {
    const entry = createRouteEntry('src/routes/blog/[slug]/page.loom')

    expect(matchRoute('/blog/hello%20world', [entry])?.params.slug).toBe('hello world')
    expect(matchRoute('/blog/%E0%A4%A', [entry])).toBeNull()
  })

  it('matches catchall routes and decodes joined params', () => {
    const entry = createRouteEntry('src/routes/docs/[...slug]/page.loom')

    expect(matchRoute('/docs/guides/getting-started', [entry])?.params.slug).toBe('guides/getting-started')
    expect(matchRoute('/docs/guides%20and%20api', [entry])?.params.slug).toBe('guides and api')
  })

  it('parses static, dynamic, and catchall route segments', () => {
    expect(parseRouteSegments('/docs/[slug]/[...rest]')).toEqual([
      { kind: 'static', name: 'docs' },
      { kind: 'dynamic', name: 'slug' },
      { kind: 'catchall', name: 'rest' },
    ])
  })

  it('creates JSON responses', async () => {
    const response = json({ ok: true })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('preserves custom SSR response headers and status', async () => {
    const response = json({ missing: true }, {
      status: 404,
      headers: {
        'cache-control': 'no-store',
      },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toEqual({ missing: true })
  })

  it('does not overwrite an explicit JSON content type', () => {
    const response = json({}, {
      headers: {
        'content-type': 'application/vnd.api+json',
      },
    })

    expect(response.headers.get('content-type')).toBe('application/vnd.api+json')
  })
})
