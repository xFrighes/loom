# Incremental Adoption Guide

Loom is designed to be introduced incrementally into existing codebases. This guide outlines the steps to add Loom to a project, using a Vue 3 application as an example, and provides strategies for sharing state and context between Loom and your existing framework.

## 1. Setup

### Install Dependencies

Add the necessary Loom packages to your project.

```bash
npm install -D @loom-ui/compiler @loom-ui/vite-plugin-loom
```

### Configure Vite

Update your `vite.config.ts` to include the Loom plugin.

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { loom } from '@loom-ui/vite-plugin-loom'

export default defineConfig({
  plugins: [
    vue(),
    loom({
      target: 'vue', // Specify the target engine (vue, react, or svelte)
    }),
  ],
})
```

## 2. Your First `.loom` Component

Create a simple Loom component in your project.

```loom
// src/components/Counter.loom
- props
  initialCount: number = 0

- ts
  import { ref } from 'vue'
  const count = ref(initialCount)

- pug
  div.counter
    p Count: {count}
    button
      @click
        count.value++
      Increment
```

## 3. Usage in Vue

You can import and use your Loom component directly in your Vue components.

```vue
<!-- src/App.vue -->
<script setup>
import Counter from './components/Counter.loom'
</script>

<template>
  <div id="app">
    <h1>Welcome to My Vue App</h1>
    <Counter :initial-count="10" />
  </div>
</template>
```

## 4. State Management Strategies

Sharing state between Loom and Vue is seamless because Loom compiles to standard Vue 3 components.

### Using Vue's `ref` and `reactive`

Loom's `- ts` zone can use Vue's reactivity APIs directly.

```loom
// src/components/SharedCounter.loom
- props
  count: number
  onIncrement: () => void

- pug
  div
    p Shared Count: {count}
    button
      @click
        onIncrement()
      Increment
```

### Pinia or Vuex

You can use Pinia or Vuex stores within Loom components.

```loom
// src/components/StoreCounter.loom
- ts
  import { useCounterStore } from '@/stores/counter'
  const store = useCounterStore()

- pug
  div
    p Store Count: {store.count}
    button
      @click
        store.increment()
      Increment
```

## 5. Sharing Context

Loom supports Vue's `provide` and `inject` for context sharing.

### Providing from Vue, Injecting in Loom

```vue
<!-- src/App.vue -->
<script setup>
import { provide } from 'vue'
provide('theme', 'dark')
</script>
```

```loom
// src/components/ThemedButton.loom
- ts
  import { inject } from 'vue'
  const theme = inject('theme', 'light')

- pug
  button.btn
    :
      class {theme}
    | Click Me
```

## 6. Migration Path

To migrate an entire project to Loom, follow these recommended steps:

1.  **Leaf Components:** Start by rewriting small, leaf-level components (buttons, inputs, icons) in Loom.
2.  **Stateful Components:** Gradually move to components with more complex logic.
3.  **Layouts and Pages:** Once the core components are in Loom, consider using Loom for layouts and pages.
4.  **Full LoomKit Integration:** Finally, evaluate if switching to LoomKit's file-system-based routing and SSR features is beneficial for your project.

### Paste conversion

Use the codemod for copy-pasted JSX or HTML snippets before hand-editing:

```bash
loom-codemod Button.tsx --from jsx --stdout
loom-codemod snippet.html --from html --stdout
```

HTML conversion handles static tags, classes, ids, attributes, text, and simple nesting. Unsupported constructs are preserved as migration comments so they can be reviewed explicitly.

### Reactivity boundaries

Portable Loom state supports direct assignment, `++`, `--`, compound assignment, computed expressions, and event-handler mutations of declared `- state` variables. Complex object or array mutations such as `items.push(...)` are reported because React, Vue, and Svelte do not share the same update semantics.

When logic is framework-specific or too dynamic for portable lowering, keep it in the existing framework APIs inside `- ts` or `- js` and compile Loom to that target.

## Summary

Loom's interoperability with React, Vue, and Svelte makes it an excellent choice for incremental adoption. By following these steps and strategies, you can begin leveraging Loom's concise syntax and meta-framework features without the need for a full rewrite.
