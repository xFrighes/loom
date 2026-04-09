<div align="center">
  <h1>🧵 Loom</h1>
  <p><strong>A component DSL that compiles into React, Vue, and Svelte components.</strong></p>

  [![Status: Alpha](https://img.shields.io/badge/Status-Alpha-yellow.svg)](#honest-status)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#)
</div>

<br/>

Loom is a unified component authoring language that allows you to write components once and use them across React, Vue, and Svelte. By keeping logic explicit and embracing zones, Loom eliminates framework boilerplate while giving you native output.

This repository is currently at the **alpha-stabilization** stage. The core compiler, parser, formatter shell, language server shell, and Vite integration are functional, and the project is actively converging on a stable diagnostic and compile contract.

## 📦 Workspace Packages

The repository is structured as a monorepo containing the compiler, tools, and demos:

- 🛠️ `packages/compiler`: Core (lexer, parser, AST, code generators, CLI, formatter, language server)
- ⚡ `packages/vite-plugin-loom`: Vite integration for `.loom` files
- ⚛️ `examples/react-demo`: Minimal React smoke test
- 💚 `examples/vue-demo`: Minimal Vue smoke test
- 🧡 `examples/svelte-demo`: Minimal Svelte smoke test

## 🚀 Quick Start

Ensure you have [`pnpm`](https://pnpm.io/) installed.

```bash
# Install dependencies
pnpm install

# Run the full health check (tests, typecheck, build)
pnpm run verify
```

### Targeted Commands

```bash
# Compiler
pnpm --filter @loom-lang/compiler typecheck
pnpm --filter @loom-lang/compiler test
pnpm --filter @loom-lang/compiler build

# Vite Plugin
pnpm --filter vite-plugin-loom test
pnpm --filter vite-plugin-loom build

# Examples
pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build
```

## ✨ Minimal Examples

Write your logic in standard TypeScript or JavaScript, and your markup in a clean, indentation-based syntax. 

<details>
<summary><b>⚛️ React Output</b></summary>

```loom
- ts
  import { useState } from 'react'
  const [count, setCount] = useState(0)

- pug
  button
    @click
      setCount(count + 1)
    Count: {count}
```

</details>

<details>
<summary><b>💚 Vue Output</b></summary>

```loom
- ts
  import { ref } from 'vue'
  const count = ref(0)

- pug
  button
    @click
      count.value++
    Count: {count}
```

</details>

<details>
<summary><b>🧡 Svelte Output</b></summary>

```loom
- ts
  let count = 0

- pug
  button
    @click
      count++
    Count: {count}
```

</details>

## 🧩 Current Syntax Support

- **Zones:** explicit blocks defined with `- generics`, `- props`, `- ts`, `- js`, `- pug`
- **Markup:** Indentation-based structural HTML (inspired by Pug)
- **Dimensions:**
  - `Data` (`:`): Attributes, props, and dynamic bindings.
  - `Style` (`::`): Scoped CSS rules directly inside elements.
  - `Behavior` (`@`): Inline event handlers and modifiers.
- **Control Flow:** `if` / `else if` / `else`, `each` loops.
- **Components:** Default and named slots, Polymorphic `element` definitions.

## 🚧 Honest Status

Loom is perfectly usable for compiler experimentation and framework-integration work, but is **not yet ecosystem-stable**. 
If `pnpm run verify` is green, the repository is healthy for local development! Keep an eye on `TODO.md` for upcoming blockers and our stabilization roadmap.
