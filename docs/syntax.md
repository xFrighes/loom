# Loom Syntax Reference

Loom is an indentation-based meta-syntax that compiles to React TSX, Vue 3 SFC, or Svelte. A `.loom` file is divided into **zones** introduced by `- zonename` headers at column 0.

---

## Indentation safety

Markup structure is defined by indentation. The compiler accepts existing files conservatively, but diagnostics warn when markup indentation uses tabs, mixed whitespace, or non-2-space levels.

Void HTML elements cannot contain children. If a line is accidentally indented under `input`, `img`, `br`, `hr`, `meta`, `link`, or another void element, Loom reports `loom/void-element-children` because the child is almost always meant to be a sibling.

```loom
- pug
input
button Submit
```

Use the formatter to normalize indentation before reviewing structural changes.

---

## Zones

| Header | Purpose |
|---|---|
| `- pug` | Markup zone (Loom's template language) |
| `- ts` | TypeScript logic zone |
| `- js` | JavaScript logic zone |
| `- props` | Component props declarations |
| `- generics` | TypeScript generic parameters |

Zones are separated by a blank line. Any content before the first zone header is treated as markup.

```loom
- props
  name: string
  count: number = 0

- ts
  import { useState } from 'react'
  const [x, setX] = useState(false)

- pug
  div.container
    h1 Hello {name}
```

---

## Markup zone (`- pug`)

### Tags

Elements use a CSS-selector-like syntax:

```
tag
tag.class
tag.class1.class2
tag#id
tag.class#id
```

Component names start with an uppercase letter:

```
UserCard
MyButton.active
```

### Inline text

A single text value can appear after the tag on the same line:

```
h1 Hello world
p Count: {count}
span {value}
```

Curly-brace interpolation `{expr}` embeds a JavaScript/TypeScript expression.

### Inline HTML

A text node containing HTML tags is passed through the framework's raw-HTML mechanism:

- React → `dangerouslySetInnerHTML`
- Vue → `v-html`
- Svelte → `{@html ...}`

---

## `:` — Data dimension

The `:` block declares HTML attributes:

```
input
  :
    type email
    placeholder Enter your email
    value {email}
    disabled {isLoading}
    ...{register('email')}
```

| Syntax | Meaning |
|---|---|
| `name value` | Static attribute: `name="value"` |
| `name` | Boolean attribute: `name` (no value) |
| `name {expr}` | Dynamic attribute bound to `expr` |
| `...{expr}` | Spread all attributes from `expr` |
| `as {expr}` | Polymorphic tag (only on `element`) |

---

## `::` — Style dimension

The `::` block declares CSS scoped to that element:

```
div.card
  ::
    padding 1rem
    border-radius 8px
    &:hover
      background #f5f5f5
    @media (max-width: 768px)
      padding 0.5rem
    :global(.dark-mode) &
      background #333
```

### CSS output by target

| Feature | React | Vue 3 | Svelte |
|---|---|---|---|
| Mechanism | CSS Modules (`.module.css`) | `<style module>` | `<style>` (native scoping) |
| Class injection | `styles['_hash']` via import | `:class="$style['_hash']"` | `class="generated-name"` |
| Authored classes (`.foo`) | Preserved alongside scoped class | Preserved | Preserved |
| Nested selectors (`&:hover`) | Expanded manually by Loom | Expanded manually by Loom | Expanded manually by Loom |
| `:global(...)` | Emitted unscoped | Emitted unscoped | Emitted unscoped |
| `@media` / `@supports` | Wrapped block | Wrapped block | Wrapped block |
| Output location | Separate `.module.css` file (via virtual module) | Inlined in `<style module>` | Inlined in `<style>` |

CSS output is **deterministic** — the same source always produces the same class names and rules.

---

## `@` — Behavior dimension

The `@` block binds an event handler:

```
button
  @click
    doSomething()

input
  @keyup.enter
    search()

form
  @submit.prevent
    handleSubmit()
```

Syntax: `@eventName[.modifier...]` followed by the handler body (indented).

### Event modifiers

| Modifier | React | Vue 3 | Svelte 4 | Description |
|---|---|---|---|---|
| `prevent` | ✓ manual | ✓ `.prevent` | ✓ `\|prevent` | `e.preventDefault()` |
| `stop` | ✓ manual | ✓ `.stop` | ✓ `\|stopPropagation` | `e.stopPropagation()` |
| `self` | ✓ manual | ✓ `.self` | ✓ `\|self` | Only fires when `e.target === e.currentTarget` |
| `once` | ✗ dropped ⚠ | ✓ `.once` | ✓ `\|once` | Remove listener after first call |
| `passive` | ✗ dropped ⚠ | ✓ `.passive` | ✓ `\|passive` | Mark as passive (no `preventDefault`) |
| `capture` | ✗ dropped ⚠ | ✓ `.capture` | ✓ `\|capture` | Use capture phase |
| `enter` | ✓ key filter | ✓ `.enter` | — | Fire only on Enter key |
| `escape` | ✓ key filter | ✓ `.escape` | — | Fire only on Escape key |
| `tab` | ✓ key filter | — | — | Fire only on Tab key |
| `space` | ✓ key filter | — | — | Fire only on Space key |

⚠ Modifiers marked "dropped" compile without error but emit a **warning** in the `CompileResult.warnings` array. Use Vue or Svelte if you need native support for these modifiers.

---

## `if` / `else if` / `else`

```
if count > 5
  p.big Count is big!
else if count < 0
  p.negative Count is negative
else
  p Keep clicking...
```

### Output by target

| Target | Mechanism |
|---|---|
| React | Nested ternary expression `condition ? (...) : (...)` |
| Vue 3 | `v-if`, `v-else-if`, `v-else` directives |
| Svelte | `{#if}` / `{:else if}` / `{:else}` / `{/if}` blocks |

---

## `each`

```
each item in items
  p {item}

each user, index in users
  li
    :
      key {user.id}
    {index}: {user.name}
```

The optional second variable receives the loop index.

Adding `: key {expr}` on the first child enables stable DOM reconciliation. Loops without a key emit a `loom/missing-loop-key` warning.

### Output by target

| Target | Mechanism |
|---|---|
| React | `array.map((item, index) => (...))` with optional `key` prop |
| Vue 3 | `v-for="(item, index) in array"` with optional `:key` |
| Svelte | `{#each array as item, index (key)}...{/each}` |

---

## Slots

### Slot definition (inside a component)

```
- pug
  div.card
    header
      slot:header
    div.body
      slot
    footer
      slot:footer
```

- `slot` — default slot placeholder
- `slot:name` — named slot placeholder

### Slot usage (when calling a component)

```
Card
  slot:header
    h2 My Title
  p This is the body content.
  slot:footer
    button Close
```

Children not wrapped in a `slot:name` go to the default slot.

### Output by target

| Feature | React | Vue 3 | Svelte |
|---|---|---|---|
| Default slot | `props.children` | `<slot />` | `<slot />` |
| Named slot def | `props.name` | `<slot name="name" />` | `<slot name="name" />` |
| Named slot use | Prop: `name={<JSX>}` | `<template #name>` | `<svelte:fragment slot="name">` |

---

## `element` — Polymorphic elements

When the HTML tag should be determined at runtime, use `element` with `:as`:

```
element
  :
    as {href ? 'a' : 'button'}
    href {href}
  {children}
```

### Output by target

| Target | Mechanism |
|---|---|
| React | `React.createElement(expr, props, children)` |
| Vue 3 | `<component :is="expr">` |
| Svelte | `<svelte:element this={expr}>` |

---

## `//` — Comments

```
// This is a comment
div
  // Inline comment
  span Hello
```

Comments are stripped from the compiled output (React/Vue emit nothing; Svelte HTML comments are used only when the loom comment is intended to appear in output).

---

## Props zone (`- props`)

```
- props
  name: string
  count: number = 0
  items: string[]
  onSubmit: (e: Event) => void
```

Syntax: `propName: TypeAnnotation [= defaultValue]`

### Output by target

| Target | Mechanism |
|---|---|
| React | Destructured from `props: { name: Type; ... }` with `const { ... } = props` |
| Vue 3 | `withDefaults(defineProps<{ ... }>(), { ... })` |
| Svelte | `export let name: Type [= default]` |

---

## Generics zone (`- generics`)

```
- generics
  T extends Record<string, unknown>

- props
  data: T

- pug
  div
    each item in Object.entries(data)
      span {item[0]}: {String(item[1])}
```

### Output by target

| Target | Mechanism |
|---|---|
| React | Appended to the function signature: `function Comp<T extends ...>(props: { data: T })` |
| Vue 3 | Comment only: `// Generic: T extends ...` (Vue generic SFC support requires `<script generic="...">` which is outside the Loom compiler scope) |
| Svelte | Comment only: `// Generic parameter: T extends ...` |
