import { describe, it, expect } from 'vitest'
import { compile } from '../src/index.js'

// ─── React ────────────────────────────────────────────────────────────────────

describe('React codegen', () => {
  function react(src: string) {
    return compile(src, { componentName: 'Test', target: 'react' }).code
  }

  it('renders a simple element', () => {
    const out = react('- pug\ndiv Hello')
    expect(out).toContain('<div>')
    expect(out).toContain('Hello')
  })

  it('applies class selector', () => {
    const out = react('- pug\ndiv.card')
    expect(out).toContain('card')
  })

  it('renders static data attr', () => {
    const out = react('- pug\ninput\n  :\n    type email')
    expect(out).toContain('type="email"')
  })

  it('renders dynamic data attr', () => {
    const out = react('- pug\ninput\n  :\n    disabled {isLoading}')
    expect(out).toContain('disabled={isLoading}')
  })

  it('renders spread attr', () => {
    const out = react("- pug\ninput\n  :\n    ...register('email')")
    expect(out).toContain("{...register('email')}")
  })

  it('renders @click.prevent', () => {
    const out = react('- pug\nbutton\n  @click.prevent\n    submit()')
    expect(out).toContain('onClick=')
    expect(out).toContain('preventDefault')
    expect(out).toContain('submit()')
  })

  it('renders @keyup.enter', () => {
    const out = react("- pug\ninput\n  @keyup.enter\n    search()")
    expect(out).toContain('onKeyUp=')
    expect(out).toContain('Enter')
  })

  it('renders if/else as ternary', () => {
    const out = react('- pug\nif x\n  p A\nelse\n  p B')
    expect(out).toContain('x ?')
    expect(out).toContain('<p>')
  })

  it('renders each loop as .map()', () => {
    const out = react('- pug\neach user in users\n  p x')
    expect(out).toContain('users.map(')
    expect(out).toContain('user')
  })

  it('wraps multiple root nodes in fragment', () => {
    const out = react('- pug\ndiv a\nspan b')
    expect(out).toContain('<>')
    expect(out).toContain('</>')
  })

  it('renders polymorphic element', () => {
    const out = react("- pug\nelement\n  :\n    as {href ? 'a' : 'button'}")
    expect(out).toContain('React.createElement')
  })

  it('preserves escaped static attrs in polymorphic props', () => {
    const out = react("- pug\nelement\n  :\n    as {'button'}\n    title Bob's")
    expect(out).toContain(`"title": "Bob's"`)
  })

  it('builds props signature', () => {
    const out = react("- props\n  name: string\n  count: number = 0\n- pug\ndiv")
    expect(out).toContain('name: string')
    expect(out).toContain('count = 0')
  })

  it('includes generics in function signature', () => {
    const out = react('- generics\n  T\n- pug\ndiv')
    expect(out).toContain('<T>')
  })

  it('extracts logic zone imports', () => {
    const out = react("- ts\n  import { useState } from 'react'\n  const [x] = useState(false)\n- pug\ndiv")
    expect(out).toContain("import { useState } from 'react'")
    expect(out).toContain('useState(false)')
  })

  it('renders slot-def as {props.children}', () => {
    const out = react('- pug\ndiv\n  slot')
    expect(out).toContain('{props.children}')
  })

  it('renders named slot-def as {props.name}', () => {
    const out = react('- pug\ndiv\n  slot:nav')
    expect(out).toContain('{props.nav}')
  })

  it('keeps a props object available when slots are referenced', () => {
    const out = react('- props\n  title: string\n- pug\ndiv\n  slot\n  slot:nav')
    expect(out).toContain('function Test(props:')
    expect(out).toContain('const { title } = props')
    expect(out).toContain('{props.children}')
    expect(out).toContain('{props.nav}')
  })

  it('renders inline HTML with dangerouslySetInnerHTML', () => {
    const out = react('- pug\np Click <a href="/terms">Terms</a>')
    expect(out).toContain('dangerouslySetInnerHTML')
  })

  it('generates CSS module import when :: is used', () => {
    const out = react('- pug\ndiv\n  ::\n    color red')
    expect(out).toContain("import styles from")
    const { css } = compile('- pug\ndiv\n  ::\n    color red', { componentName: 'Test', target: 'react' })
    expect(css).toContain('color: red')
  })

  it('preserves authored classes alongside scoped classes', () => {
    const out = react('- pug\ndiv.card\n  ::\n    color red')
    expect(out).toContain('"card"')
    expect(out).toContain("styles['_div_2_1_")
  })
})

// ─── Vue ──────────────────────────────────────────────────────────────────────

describe('Vue codegen', () => {
  function vue(src: string) {
    return compile(src, { componentName: 'Test', target: 'vue' }).code
  }

  it('emits <script setup> block', () => {
    expect(vue('- pug\ndiv')).toContain('<script setup lang="ts">')
  })

  it('emits <template> block', () => {
    expect(vue('- pug\ndiv')).toContain('<template>')
  })

  it('renders dynamic binding with ":"', () => {
    const out = vue('- pug\ninput\n  :\n    disabled {isLoading}')
    expect(out).toContain(':disabled="isLoading"')
  })

  it('renders spread as v-bind', () => {
    const out = vue('- pug\ndiv\n  :\n    ...obj')
    expect(out).toContain('v-bind="obj"')
  })

  it('escapes static attribute values', () => {
    const out = vue('- pug\ndiv\n  :\n    title 5 > "x" & < y')
    expect(out).toContain('title="5 &gt; &quot;x&quot; &amp; &lt; y"')
  })

  it('renders @click.prevent natively', () => {
    const out = vue('- pug\nbutton\n  @click.prevent\n    submit()')
    expect(out).toContain('@click.prevent')
  })

  it('renders if/else with v-if/v-else', () => {
    const out = vue('- pug\nif x\n  p A\nelse\n  p B')
    expect(out).toContain('v-if')
    expect(out).toContain('v-else')
  })

  it('renders each with v-for', () => {
    const out = vue('- pug\neach user in users\n  p x')
    expect(out).toContain('v-for="(user) in users"')
  })

  it('renders defineProps', () => {
    const out = vue('- props\n  name: string\n- pug\ndiv')
    expect(out).toContain('defineProps')
    expect(out).toContain('name: string')
  })

  it('renders polymorphic as <component :is>', () => {
    const out = vue("- pug\nelement\n  :\n    as {href ? 'a' : 'button'}")
    expect(out).toContain('<component')
    expect(out).toContain(':is=')
  })

  it('renders slot-def as <slot />', () => {
    const out = vue('- pug\ndiv\n  slot')
    expect(out).toContain('<slot />')
  })

  it('emits <style module> when :: is present', () => {
    const out = vue('- pug\ndiv\n  ::\n    color red')
    expect(out).toContain('<style module>')
    expect(out).toContain('color: red')
  })

  it('preserves authored classes alongside module-scoped classes', () => {
    const out = vue('- pug\ndiv.card\n  ::\n    color red')
    expect(out).toContain("['card', $style[")
  })
})

// ─── Svelte ───────────────────────────────────────────────────────────────────

describe('Svelte codegen', () => {
  function svelte(src: string) {
    return compile(src, { componentName: 'Test', target: 'svelte' }).code
  }

  it('emits <script lang="ts">', () => {
    expect(svelte('- pug\ndiv')).toContain('<script lang="ts">')
  })

  it('renders export let props', () => {
    const out = svelte('- props\n  name: string\n  count: number = 0\n- pug\ndiv')
    expect(out).toContain('export let name: string')
    expect(out).toContain('export let count: number = 0')
  })

  it('renders on:click|preventDefault', () => {
    const out = svelte('- pug\nbutton\n  @click.prevent\n    submit()')
    expect(out).toContain('on:click|preventDefault=')
  })

  it('escapes static attribute values', () => {
    const out = svelte('- pug\ndiv\n  :\n    title 5 > "x" & < y')
    expect(out).toContain('title="5 &gt; &quot;x&quot; &amp; &lt; y"')
  })

  it('renders {#if} blocks', () => {
    const out = svelte('- pug\nif x\n  p A\nelse\n  p B')
    expect(out).toContain('{#if x}')
    expect(out).toContain('{:else}')
    expect(out).toContain('{/if}')
  })

  it('renders {#each} blocks', () => {
    const out = svelte('- pug\neach user in users\n  p x')
    expect(out).toContain('{#each users as user')
    expect(out).toContain('{/each}')
  })

  it('renders <slot /> for slot-def', () => {
    const out = svelte('- pug\ndiv\n  slot')
    expect(out).toContain('<slot />')
  })

  it('renders <svelte:element> for polymorphic', () => {
    const out = svelte("- pug\nelement\n  :\n    as {href ? 'a' : 'button'}")
    expect(out).toContain('<svelte:element')
  })

  it('renders {@html} for inline HTML', () => {
    const out = svelte('- pug\np Click <a>here</a>')
    expect(out).toContain('@html')
  })

  it('embeds styles in <style> block', () => {
    const out = svelte('- pug\ndiv\n  ::\n    color red')
    expect(out).toContain('<style>')
    expect(out).toContain('color: red')
  })
})

// ─── CSS codegen ──────────────────────────────────────────────────────────────

describe('CSS extraction', () => {
  it('expands nested &:hover', () => {
    const src = '- pug\ndiv\n  ::\n    color red\n    &:hover\n      color blue'
    const { css } = compile(src, { componentName: 'Test', target: 'react' })
    expect(css).toContain('color: red')
    expect(css).toContain(':hover')
    expect(css).toContain('color: blue')
  })

  it('expands @media queries', () => {
    const src = '- pug\ndiv\n  ::\n    padding 1rem\n    @media (max-width: 768px)\n      padding 0.5rem'
    const { css } = compile(src, { componentName: 'Test', target: 'react' })
    expect(css).toContain('@media (max-width: 768px)')
    expect(css).toContain('padding: 0.5rem')
  })

  it('handles :global() escape', () => {
    const src = '- pug\ndiv\n  ::\n    color red\n    :global(.dark-mode) &\n      color white'
    const { css } = compile(src, { componentName: 'Test', target: 'react' })
    expect(css).toContain('.dark-mode')
  })

  it('is deterministic across repeated builds', () => {
    const src = '- pug\ndiv.card\n  ::\n    color red'
    const first = compile(src, { componentName: 'Test', target: 'react' }).css
    const second = compile(src, { componentName: 'Test', target: 'react' }).css
    expect(first).toBe(second)
  })
})

// ─── bind: two-way binding ────────────────────────────────────────────────────

describe('bind: two-way binding', () => {
  it('renders bind:value as value+onChange in React for state vars', () => {
    const src = [
      '- state',
      '  query: string = ""',
      '',
      '- pug',
      'input',
      '  :',
      '    bind:value query',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'react' }).code
    expect(out).toContain('value={query}')
    expect(out).toContain('onChange=')
    expect(out).toContain('setQuery')
  })

  it('renders bind:value as v-model in Vue', () => {
    const src = [
      '- pug',
      'input',
      '  :',
      '    bind:value query',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'vue' }).code
    expect(out).toContain('v-model="query"')
  })

  it('renders bind:checked as v-model:checked in Vue', () => {
    const src = [
      '- pug',
      'input',
      '  :',
      '    bind:checked isActive',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'vue' }).code
    expect(out).toContain('v-model:checked="isActive"')
  })

  it('renders bind:value as bind:value={expr} in Svelte', () => {
    const src = [
      '- pug',
      'input',
      '  :',
      '    bind:value query',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'svelte' }).code
    expect(out).toContain('bind:value={query}')
  })

  it('renders bind:checked in Svelte', () => {
    const src = [
      '- pug',
      'input',
      '  :',
      '    bind:checked isActive',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'svelte' }).code
    expect(out).toContain('bind:checked={isActive}')
  })
})

// ─── Scoped slots ─────────────────────────────────────────────────────────────

describe('scoped slots', () => {
  it('emits render prop signature for scoped slot-def in React', () => {
    const src = [
      '- pug',
      'ul',
      '  slot:row(item)',
    ].join('\n')
    const out = compile(src, { componentName: 'List', target: 'react' }).code
    expect(out).toContain('row?:')
    expect(out).toContain('item: any')
    expect(out).toContain("props.row?.({ item })")
  })

  it('emits slot props in Vue for scoped slot-def', () => {
    const src = [
      '- pug',
      'ul',
      '  slot:row(item)',
    ].join('\n')
    const out = compile(src, { componentName: 'List', target: 'vue' }).code
    expect(out).toContain('<slot name="row" :item="item" />')
  })

  it('emits slot shorthand in Svelte for scoped slot-def', () => {
    const src = [
      '- pug',
      'ul',
      '  slot:row(item)',
    ].join('\n')
    const out = compile(src, { componentName: 'List', target: 'svelte' }).code
    expect(out).toContain('<slot name="row" {item} />')
  })

  it('emits scoped template in Vue for slot-use with params', () => {
    const src = [
      '- pug',
      'List',
      '  slot:row(item)',
      '    li {item}',
    ].join('\n')
    const out = compile(src, { componentName: 'Page', target: 'vue' }).code
    expect(out).toContain('#row="{ item }"')
  })

  it('emits let: directives in Svelte for slot-use with params', () => {
    const src = [
      '- pug',
      'List',
      '  slot:row(item)',
      '    li {item}',
    ].join('\n')
    const out = compile(src, { componentName: 'Page', target: 'svelte' }).code
    expect(out).toContain('let:item')
  })

  it('emits render prop function in React for slot-use with params', () => {
    const src = [
      '- pug',
      'List',
      '  slot:row(item)',
      '    li {item}',
    ].join('\n')
    const out = compile(src, { componentName: 'Page', target: 'react' }).code
    expect(out).toContain('({ item }) =>')
  })
})

// ─── SSR mode ─────────────────────────────────────────────────────────────────

describe('SSR mode', () => {
  it('prepends use server directive in React', () => {
    const src = '- pug\ndiv Hello'
    const out = compile(src, { componentName: 'Test', target: 'react', ssr: true }).code
    expect(out.trimStart().startsWith("'use server'")).toBe(true)
  })

  it('omits client hooks in React SSR output', () => {
    const src = [
      '- state',
      '  count: number = 0',
      '',
      '- pug',
      'div {count}',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'react', ssr: true }).code
    expect(out).not.toContain('useState')
  })

  it('omits style module block in Vue SSR output', () => {
    const src = [
      '- pug',
      'div',
      '  ::',
      '    color red',
    ].join('\n')
    const out = compile(src, { componentName: 'Test', target: 'vue', ssr: true }).code
    expect(out).not.toContain('<style module>')
  })

  it('emits module context block in Svelte SSR output', () => {
    const src = '- pug\ndiv Hello'
    const out = compile(src, { componentName: 'Test', target: 'svelte', ssr: true }).code
    expect(out).toContain('<script context="module"')
  })
})
