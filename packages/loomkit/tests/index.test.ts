import { describe, expect, it } from 'vitest'
import { createRouteEntry, json, matchRoute, routePathFromFile } from '../src/index.js'

describe('@loom-lang/kit', () => {
  it('derives paths from route files', () => {
    expect(routePathFromFile('src/routes/page.loom')).toBe('/')
    expect(routePathFromFile('src/routes/blog/[slug]/page.loom')).toBe('/blog/[slug]')
  })

  it('matches dynamic routes', () => {
    const entry = createRouteEntry('src/routes/blog/[slug]/page.loom')
    const match = matchRoute('/blog/hello-world', [entry])
    expect(match?.params.slug).toBe('hello-world')
  })

  it('creates JSON responses', async () => {
    const response = json({ ok: true })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ ok: true })
  })
})
