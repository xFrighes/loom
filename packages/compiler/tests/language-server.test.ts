import { describe, expect, it } from 'vitest'
import { buildCompletions, type LoomCompletionItem } from '../src/language-server.js'

function complete(source: string): LoomCompletionItem[] {
  const cursor = source.indexOf('|')
  expect(cursor).toBeGreaterThanOrEqual(0)
  const text = source.slice(0, cursor) + source.slice(cursor + 1)
  const before = source.slice(0, cursor)
  const lines = before.split('\n')
  return buildCompletions(text, {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  })
}

function labels(items: LoomCompletionItem[]): string[] {
  return items.map((item) => item.label)
}

describe('language server completions', () => {
  it('returns rich zone snippets at top-level zone headers', () => {
    const items = complete('- |')

    expect(labels(items)).toContain('- props')
    expect(items.find((item) => item.label === '- props')).toEqual(expect.objectContaining({
      insertTextFormat: 2,
      textEdit: expect.objectContaining({
        newText: expect.stringContaining('- props'),
      }),
    }))
  })

  it('suggests tag-specific attributes and Loom symbols inside data dimensions', () => {
    const items = complete(`- props
  label: string

- state
  email: string = ''

- view
input
  :
    |`)

    expect(labels(items)).toContain('placeholder')
    expect(labels(items)).toContain('email')
    expect(items.find((item) => item.label === 'email')?.textEdit?.newText).toBe('{email}')
  })

  it('suggests event modifiers after an event dot', () => {
    const items = complete(`- view
button
  @keyup.|`)

    expect(labels(items)).toContain('enter')
    expect(labels(items)).toContain('prevent')
  })

  it('suggests CSS declarations and nested rules in style dimensions', () => {
    const items = complete(`- view
section
  ::
    |`)

    expect(labels(items)).toContain('display')
    expect(labels(items)).toContain('&:hover')
    expect(labels(items)).toContain('@media')
  })

  it('discovers local components for markup completions', () => {
    const items = complete(`- ts
  import UserCard from './UserCard'

- view
|`)

    expect(labels(items)).toContain('UserCard')
  })

  it('suggests Loom symbols inside brace expressions', () => {
    const items = complete(`- props
  name: string

- computed
  greeting = 'Hello ' + name

- view
p {|}`)

    expect(labels(items)).toContain('name')
    expect(labels(items)).toContain('greeting')
    expect(items.find((item) => item.label === 'name')?.textEdit?.newText).toBe('name')
  })
})
