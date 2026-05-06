<div align="center">
  <br />
  <h1>🧵 Loom</h1>
  <p><strong>The Framework-Agnostic UI Language</strong></p>
  <p>Compile one component to <strong>React</strong>, <strong>Vue</strong>, and <strong>Svelte</strong> with zero boilerplate.</p>

  [![Status: Beta](https://img.shields.io/badge/Status-Beta-green.svg)](#-status)
  [![Version](https://img.shields.io/badge/Version-0.1.0-blue.svg)](#)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#)
  [![Powered by Rust](https://img.shields.io/badge/Powered%20by-Rust-black?logo=rust)](https://www.rust-lang.org/)
</div>

<br />

Loom is a unified component authoring language that eliminates framework-specific noise. By moving logic into declarative **zones** and using a clean, indentation-based template, Loom allows you to focus on your UI while generating native, high-performance code for any target.

## ✨ Why Loom?

- 🚀 **Write Once, Run Everywhere:** Author your UI once and ship it to React, Vue, or Svelte.
- 🦀 **Rust-Powered Core:** Blazing fast compilation and strict semantic validation.
- 🧩 **Unified Reactivity:** Use `- state` and `- computed` zones to manage data without framework hooks or boilerplate.
- 🏗️ **Dimension-Driven UI:** Explicit blocks for Data (`:`), Style (`::`), and Behavior (`@`).
- 🤖 **AI-Native Tooling:** Built-in "projection-and-patch" workflows optimized for LLM-assisted development.
- ⚡ **Zero-Runtime Overhead:** Compiles to standard framework code with no heavy runtime library.

---

## 🎨 The "Loom Way"

Write components that describe *what* they do, not *how* the framework handles it.

```loom
- props
  title: string
  initialCount: number = 0

- state
  count: number = initialCount

- computed
  isBig = count > 10

- pug
  div.counter-card
    ::
      padding: 1.5rem;
      border: 1px solid {isBig ? 'red' : '#ddd'};
      border-radius: 8px;

    h2 {title}
    
    button
      @click
        count++
      + Increment
    
    span Current count: {count}
    
    if isBig
      p.warning THAT IS A BIG NUMBER!
```

---

## 🛠️ Ecosystem Overview

Loom is more than just a compiler; it's a complete toolkit for modern UI development.

| Package | Purpose | Status |
|:---|:---|:---|
| `packages/compiler` | Core TS/Rust compiler & Codegen | **Stable** |
| `packages/loom_core` | High-performance Rust parser & indexer | **Stable** |
| `packages/vite-plugin-loom` | Seamless Vite integration | **Stable** |
| `packages/loom-llm` | AI-safe projection & patch tooling | **Stable** |
| `packages/loom-testing` | Framework-agnostic test helpers | **Stable** |
| `packages/codemod` | Automated React-to-Loom migration | **Stable** |
| `packages/loom-tailwind` | Static Tailwind CSS extraction | **Stable** |
| `packages/loomkit` | Meta-framework primitives (Routing/SSR) | *Alpha* |
| `packages/ui` | Headless UI primitives | *Alpha* |

---

## 🚀 Quick Start

Ensure you have [pnpm](https://pnpm.io/) installed.

```bash
# Clone and install
git clone https://github.com/xFrighes/loom.git
cd loom
pnpm install

# Run the full health check (tests, typecheck, build)
pnpm run verify
```

### Development Workflow

```bash
# Run tests for the compiler
pnpm --filter @loom-lang/compiler test

# Build all packages
pnpm -r build

# Try the demos
cd examples/react-demo && pnpm dev
```

## 🚧 Status

Loom is currently in **Beta (0.1.0)**. The core language and major bundler integrations are stable and ready for experimentation. We are actively working on **LoomKit** (SSR/Routing) and **Headless UI** components.

Check [TODO.md](./TODO.md) for the detailed roadmap.

---

<div align="center">
  Built with ❤️ by the Loom Team.
</div>
