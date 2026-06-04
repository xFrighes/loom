# Svelte Migration

Use Loom in Svelte apps for new or leaf components where the markup is mostly declarative. Keep Svelte-specific syntax, stores, actions, transitions, and load functions in Svelte until each behavior has a clear Loom shape.

## Vite setup

```bash
npm install -D @sveltejs/vite-plugin-svelte vite-plugin-loom @loom-ui/compiler @loom-ui/codemod
```

```typescript
// @loom-doc-snippet
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import loom from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    loom({ target: 'svelte' }),
    svelte(),
  ],
})
```

## Import a `.loom` component

```loom
- props
  name: string
  active: boolean = false
  onToggle: () => void

- view
button.member-chip
  :
    type button
    aria-pressed {active}
  ::
    padding 0.5rem 0.75rem
    border-radius 999px
  @click
    onToggle()
  {name}
```

Use it from a Svelte component:

```svelte
<script lang="ts">
  import MemberChip from './MemberChip.loom'

  let active = false
</script>

<MemberChip name="Ada" {active} onToggle={() => active = !active} />
```

## Props and event callbacks

Prefer callback props for cross-framework parity. They are easy to pass from Svelte and keep emitted React, Vue, and Svelte shapes close.

```loom
- props
  value: string
  onClear: () => void

- view
div.search-pill
  span {value}
  button
    :
      type button
      aria-label "Clear search"
    @click
      onClear()
    Clear
```

## Store interop

Use Svelte stores from `- ts` only when the component is committed to the Svelte target.

```loom
- ts
  import { cart } from '../stores/cart'

- view
section.cart-status
  p Items: {$cart.count}
  button
    :
      type button
    @click
      cart.reset()
    Reset cart
```

For portable components, pass store values as props and pass store updates as callbacks from the Svelte parent.

## Migrating Svelte markup

There is no automated Svelte-to-Loom conversion guarantee. Use HTML paste conversion for static markup drafts:

```bash
loom-codemod snippet.html --from html --stdout
```

Translate Svelte-specific constructs manually:

- `{#if}` and `{#each}` become Loom `if` and `each` blocks.
- `bind:`, `use:`, `transition:`, and `animate:` stay in Svelte until replaced by explicit props, callbacks, or `- ts` logic.
- `$store` reads can remain in Svelte-targeted `- ts`/markup, but shared components should receive values as props.
