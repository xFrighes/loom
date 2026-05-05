# Loom Roadmap

Status: **Beta** | Version: **0.1.0** | Environment: **Ready**

Loom is a framework-agnostic UI language compiling to React, Vue, and Svelte.

---

## 🚀 1.0 Milestone

Goal: Production-grade stability and ecosystem maturity.

### 🦀 Rust Core & Performance
- [x] **Performance Tuning:** Optimize NAPI/WASM overhead for large-scale projects.
- [x] **Fuzz Testing:** Stress-test the Rust parser with malformed and edge-case inputs.
- [x] **Memory Audit:** Ensure zero-copy or minimal-copy handoffs between Rust and Node.js.

### 🛡️ Security & Robustness
- [x] **XSS Audit:** Verify expression sanitization across all three codegen targets.
- [x] **LoomKit E2E:** Comprehensive testing for routing and SSR primitives.
- [x] **Semantic Parity:** 100% feature alignment (props, state, events, slots) across all frameworks.

### 📖 Documentation & Distribution
- [ ] **Loom.dev:** Launch the official documentation site with integrated WASM playground.
- [ ] **Migration Guides:** Step-by-step paths for React, Vue, and Svelte developers.
- [ ] **Automated Release:** NPM publishing with provenance and automated changelogs.

### ✨ Advanced Language Features
- [x] **Atomic CSS:** Optional mode for utility-first CSS generation.
- [x] **Enhanced Keying:** Improved reconciliation strategy for complex loops.
- [x] **MDLoom:** Native support for Markdown embedding within Loom components.

---

## 🛠️ Package Ecosystem

| Package | Purpose | Status |
|:---|:---|:---|
| `@loom-lang/compiler` | Core TS/Rust compiler | Stable |
| `loom_core` | Rust-based lexer, parser, and indexer | Integrated |
| `vite-plugin-loom` | Primary bundler integration | Stable |
| `loomkit` | Meta-framework primitives (Routing/SSR) | Alpha |
| `loom-devtools` | Unified debugging runtime hooks | Alpha |
| `loom-llm` | Token-optimized projection for AI | Stable |
| `loom-testing` | Framework-agnostic test helpers | Stable |
| `eslint-plugin-loom` | Linting & static analysis | Stable |
| `@loom-lang/codemod` | CLI for React-to-Loom migration | Stable |
| `@loom-lang/tailwind` | Static Tailwind CSS extraction | Stable |
| `@loom-lang/playground` | Browser-friendly compiler API | Stable |
| `rollup-plugin-loom` | Rollup integration | Stable |
| `esbuild-plugin-loom` | esbuild integration | Stable |
| `rspack-plugin-loom` | Rspack integration | Stable |
| `webpack-loader-loom` | Webpack integration | Stable |
| `@loom-lang/ui` | Headless UI primitives | Alpha |

---

## 📜 Recent Highlights (Completed)

- [x] **Rust Migration:** Lexer, Parser, and Indexer successfully ported and integrated via NAPI/WASM.
- [x] **Bundler Expansion:** Official support for Rollup, esbuild, Webpack, and Rspack.
- [x] **Developer Experience:** Full source maps, Language Server (diagnostics/hover), and canonical Printer.
- [x] **Ecosystem Baseline:** Tailwind extraction, ESLint support, and Vitest helpers.
- [x] **Meta-framework Baseline:** File-system routing and SSR primitives established in LoomKit.
- [x] **Codemod Support:** New CLI tool to automate migration from React to Loom components.
- [x] **Playground API:** Lightweight compilation package for browser-based Loom sandboxes.

---

## ⌨️ Command Cheat Sheet

```bash
# Core Development
pnpm run verify          # Full workspace health check
pnpm -r build            # Build all packages
pnpm -r test             # Run all tests

# Package Specifics
pnpm --filter @loom-lang/compiler test
pnpm --filter loom_core test
pnpm --filter vite-plugin-loom build
```
