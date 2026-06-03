# React Migration

Use Loom in React when you want to shrink JSX-heavy leaf components while keeping React as the app shell, router, state layer, and testing surface.

## Vite setup

Install the packages used by the React demo shape:

```bash
npm install -D @vitejs/plugin-react vite-plugin-loom @loom-ui/compiler @loom-ui/codemod
```

Configure Loom before React so `.loom` files resolve through the Loom compiler first.

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

## Import a `.loom` component

Create a complete leaf component first.

```loom
- props
  title: string
  count: number
  onIncrement: () => void

- computed
  isBusy = count > 9

- pug
section.counter-card
  ::
    padding 1rem
    border 1px solid #d7dde8
    border-radius 8px
  h2 {title}
  p Count: {count}
  button
    :
      type button
      disabled {isBusy}
    @click
      onIncrement()
    Increment
```

Use it like any other React component:

```tsx
// @loom-doc-snippet
import { useState } from 'react'
import CounterCard from './CounterCard.loom'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <CounterCard
      title="Open tasks"
      count={count}
      onIncrement={() => setCount((value) => value + 1)}
    />
  )
}
```

## Props and callbacks

Prefer plain props and callback props at the boundary. Keep React context, routers, query clients, and form libraries in React until the Loom component has a stable contract.

```loom
- props
  label: string
  disabled: boolean = false
  onSubmit: () => void

- pug
button.primary-action
  :
    type button
    disabled {disabled}
  @click
    onSubmit()
  {label}
```

## State boundaries

Use `- state` for local UI state that is owned by the component. Keep shared state in React, then pass values and callbacks down.

```loom
- state
  open: boolean = false

- pug
button
  :
    type button
  @click
    open = !open
  Toggle details
if open
  p Details are visible
```

Move logic into `- ts` only when it is already React-specific or depends on existing app APIs.

```loom
- ts
  import { useId } from 'react'
  const inputId = useId()

- pug
label
  :
    for {inputId}
  Name
input
  :
    id {inputId}
```

## Codemod from JSX

Run a report first when converting existing React files:

```bash
loom-codemod src/components/ProfileCard.tsx --report
```

Then generate a draft:

```bash
loom-codemod src/components/ProfileCard.tsx --from jsx --stdout
```

The codemod handles typed props and common JSX markup. Review findings for spread attributes, unsafe HTML, render props, hooks, framework-specific event handling, and object or array mutation. Keep unsupported behavior in React until you can make an explicit Loom or `- ts` version.

For JSX copied from a browser or design system example, paste it into a temporary file or use editor paste conversion:

```bash
loom-codemod snippet.tsx --from jsx --stdout
```
