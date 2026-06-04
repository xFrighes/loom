# Vue Migration

Use Loom in Vue 3 when you want framework-native SFC output while keeping Vue Router, Pinia, composables, and app-level providers in the existing app.

## Vite setup

```bash
npm install -D @vitejs/plugin-vue vite-plugin-loom @loom-ui/compiler @loom-ui/codemod
```

```typescript
// @loom-doc-snippet
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import loom from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    loom({ target: 'vue' }),
    vue(),
  ],
})
```

## Import a `.loom` component

```loom
- props
  title: string
  selected: boolean = false
  onChoose: () => void

- view
article.result-row
  :
    aria-selected {selected}
  ::
    padding 0.75rem
    border 1px solid #d7dde8
  h3 {title}
  button
    :
      type button
    @click
      onChoose()
    Choose
```

Use the generated Vue component from a Vue SFC:

```vue
<script setup lang="ts">
import ResultRow from './ResultRow.loom'

const choose = () => {
  console.log('chosen')
}
</script>

<template>
  <ResultRow title="Starter plan" :selected="true" :on-choose="choose" />
</template>
```

## Props, events, and stores

At the Vue boundary, callbacks are the most portable interop shape. For components that are meant to stay Vue-only, you can use Vue APIs inside `- ts`.

```loom
- props
  label: string
  onSave: () => void

- view
button
  :
    type button
  @click
    onSave()
  {label}
```

Pinia stays available from `- ts` because Loom compiles to Vue code for this target.

```loom
- ts
  import { storeToRefs } from 'pinia'
  import { useCartStore } from '@/stores/cart'
  const cart = useCartStore()
  const { total } = storeToRefs(cart)

- view
aside.cart-summary
  p Total: {total}
  button
    :
      type button
    @click
      cart.checkout()
    Checkout
```

## Provide and inject

Keep app-level providers in Vue and inject in Loom when the component is Vue-specific.

```loom
- ts
  import { inject } from 'vue'
  const theme = inject('theme', 'light')

- view
button.themed-button
  :
    data-theme {theme}
  Themed action
```

## Migrating from SFCs

Automated Vue SFC to Loom conversion is intentionally conservative. For mostly static template sections, copy the rendered HTML or the template markup into an HTML snippet and convert a draft:

```bash
loom-codemod snippet.html --from html --stdout
```

Translate Vue directives by hand. Keep `v-model`, scoped slots, `Teleport`, transitions, async setup, and component-provided injections in Vue until the target Loom contract is explicit.
