import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexWorkspace } from '../src/index.js'

describe('cross-package workspace indexing', () => {
  it('indexes package components, props, and imports across workspaces', () => {
    const root = path.join(tmpdir(), `loom-workspace-${randomUUID()}`)
    mkdirSync(path.join(root, 'packages/ui/src'), { recursive: true })
    mkdirSync(path.join(root, 'packages/app/src'), { recursive: true })
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }), 'utf8')
    writeFileSync(path.join(root, 'packages/ui/package.json'), JSON.stringify({ name: '@demo/ui' }), 'utf8')
    writeFileSync(path.join(root, 'packages/app/package.json'), JSON.stringify({ name: '@demo/app' }), 'utf8')
    writeFileSync(path.join(root, 'packages/ui/src/Card.loom'), '- props\n  title: string\n\n- pug\narticle\n  h2 {title}', 'utf8')
    writeFileSync(path.join(root, 'packages/app/src/App.loom'), "- ts\n  import { Card } from '@demo/ui'\n\n- pug\nmain\n  Card\n    :\n      title \"Hello\"", 'utf8')

    const index = indexWorkspace(root)

    expect(index.packages.map((pkg) => pkg.name)).toEqual(['@demo/app', '@demo/ui'])
    expect(index.components.map((component) => component.name)).toEqual(['App', 'Card'])
    expect(index.components.find((component) => component.name === 'Card')?.props[0]?.name).toBe('title')
    expect(index.components.find((component) => component.name === 'App')?.imports).toContain('@demo/ui')
    expect(index.diagnostics).toEqual([])
  })

  it('reports unresolved component contracts across packages', () => {
    const root = path.join(tmpdir(), `loom-workspace-missing-${randomUUID()}`)
    mkdirSync(path.join(root, 'packages/app/src'), { recursive: true })
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }), 'utf8')
    writeFileSync(path.join(root, 'packages/app/package.json'), JSON.stringify({ name: '@demo/app' }), 'utf8')
    writeFileSync(path.join(root, 'packages/app/src/App.loom'), '- pug\nmain\n  MissingCard', 'utf8')

    const index = indexWorkspace(root)

    expect(index.diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/workspace-unresolved-component')
  })
})
