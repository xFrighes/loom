import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { compileScript, compileTemplate, parse as parseVueSfc } from '@vue/compiler-sfc'
import { compile as compileSvelte } from 'svelte/compiler'
import { compile } from '../src/index.js'

function expectValidReactTsx(source: string): void {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  })
  const errors =
    result.diagnostics?.filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    ) ?? []
  expect(errors.map((diagnostic) => diagnostic.messageText)).toEqual([])
}

function expectValidVueSfc(source: string): void {
  const parsed = parseVueSfc(source, { filename: 'Generated.vue' })
  expect(parsed.errors).toEqual([])

  if (parsed.descriptor.scriptSetup || parsed.descriptor.script) {
    expect(() => compileScript(parsed.descriptor, { id: 'generated-vue' })).not.toThrow()
  }

  if (parsed.descriptor.template) {
    const result = compileTemplate({
      id: 'generated-vue',
      filename: 'Generated.vue',
      source: parsed.descriptor.template.content,
      compilerOptions: { mode: 'module' },
    })
    expect(result.errors).toEqual([])
  }
}

function expectValidSvelteComponent(source: string): void {
  // Svelte 4 expects TypeScript to be preprocessed before `svelte/compiler`.
  // These syntax checks deliberately stay in the markup/style subset so the
  // framework compiler still validates the generated component structure.
  const preprocessed = source.replace('<script lang="ts">', '<script>')
  expect(() =>
    compileSvelte(preprocessed, { filename: 'Generated.svelte', generate: false }),
  ).not.toThrow()
}

describe('generated framework validity', () => {
  const fixtures = [
    {
      name: 'attrs, event modifiers, control flow, and loops',
      source: `- ts
  const users = [{ id: '1', name: 'Ada' }]
  const isLoading = false
  const submit = () => {}
- view
section.card
  :
    aria-label "People"
  button
    :
      disabled {isLoading}
    @click.prevent
      submit()
    Save
  if users.length
    each user in users
      p
        :
          key {user.id}
        {user.name}
  else
    p Empty`,
    },
    {
      name: 'polymorphic element, slots, escaped text, and scoped styles',
      source: `- ts
  const tag = 'a'
- view
Layout
  slot:nav
    p Navigation
element.link
  :
    as {tag}
    href "/docs"
  ::
    color {tag === 'a' ? 'blue' : 'black'}
    &:hover
      color red
  Click <a>here</a>`,
    },
  ]

  for (const fixture of fixtures) {
    it(`emits valid React TSX for ${fixture.name}`, () => {
      const result = compile(fixture.source, { componentName: 'Generated', target: 'react' })
      expectValidReactTsx(result.code)
    })

    it(`emits valid Vue SFC syntax for ${fixture.name}`, () => {
      const result = compile(fixture.source, { componentName: 'Generated', target: 'vue' })
      expectValidVueSfc(result.code)
    })
  }

  it('emits valid Svelte component syntax for markup, events, control flow, and styles', () => {
    const result = compile(
      `- view
button.card
  @click.prevent
    submit()
  Save
if visible
  p Visible
else
  p Hidden
each user in users
  p {user.name}
section
  ::
    color red
    &:hover
      color blue`,
      { componentName: 'Generated', target: 'svelte' },
    )

    expectValidSvelteComponent(result.code)
  })
})
