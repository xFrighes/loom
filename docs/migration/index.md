# Migration Guides

Loom migration works best as an incremental adoption path. Keep your existing React, Vue, or Svelte app in place, add `.loom` support to the bundler, then move leaf components first.

## Choose a path

- [React migration](./react.md): strongest automated path when source components are JSX or TSX.
- [Vue migration](./vue.md): practical for Vue 3 apps that already use Vite, Pinia, and `provide`/`inject`.
- [Svelte migration](./svelte.md): conservative path for new or leaf components, with manual translation for Svelte-specific syntax.

## Shared workflow

1. Install the framework plugin you already use, `vite-plugin-loom`, and `@loom-ui/compiler`.
2. Add `loom({ target })` before the framework plugin in `vite.config.ts`.
3. Start with leaf UI: buttons, cards, empty states, badges, and presentational list rows.
4. Keep state ownership explicit. Pass values and callbacks across the framework boundary before moving shared stores or lifecycle code.
5. Use the codemod or editor paste tools to produce a first draft, then review every unsupported pattern.
6. Run your normal framework tests and `bun run verify` in this workspace before marking migration work complete.

```loom
- props
  label: string
  onSelect: () => void

- pug
button.choice
  :
    type button
  @click
    onSelect()
  {label}
```

## Vite setup pattern

Use the same plugin shape in each framework and only change the target.

```typescript
// @loom-doc-snippet
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import loom from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    loom({ target: 'react' }),
    react(),
  ],
})
```

## Codemod and editor commands

Use `loom-codemod` for JSX or static HTML drafts:

```bash
loom-codemod src/components/Button.tsx --from jsx --stdout
loom-codemod snippet.html --from html --stdout
loom-codemod src/components/Button.tsx --report
```

In VS Code, use the Loom paste commands for copied JSX or HTML when a migration starts from a design system example or browser-rendered markup. Treat converted output as a draft, not as reviewed production code.

## Known limits

- React JSX conversion is the most automated path. Vue SFC and Svelte component syntax still need manual translation when they use framework directives, slots, stores, or lifecycle APIs.
- Static HTML paste conversion handles tags, classes, ids, attributes, text, and simple nesting. Dynamic bindings are emitted as reviewable migration comments or need hand translation.
- Complex object and array mutations should stay in framework code or be rewritten as portable assignment-based Loom state.
- Context, stores, lifecycle hooks, async data, and unsafe HTML decisions should stay explicit in framework code or in a `- ts` zone.
