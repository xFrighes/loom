# Loom Roadmap

Status: **Beta** | Version: **0.1.0** | Environment: **Ready**

Loom is a framework-agnostic UI language compiling to React, Vue, and Svelte.

---

## 🚀 1.0 Milestone

Goal: Production-grade stability and ecosystem maturity.

### 🎯 Product Appeal & Adoption
- [ ] **Create Loom App:** Ship `create-loom-app` with React, Vue, Svelte, and LoomKit starters so first-run success is one command.
- [ ] **Interactive Tutorial:** Add a guided browser tutorial that teaches zones, dimensions, state, events, and target switching inside the playground.
- [ ] **Example Gallery:** Publish polished real-world examples (dashboard, marketing page, form workflow, content site) with side-by-side React/Vue/Svelte output.
- [ ] **VS Code Extension:** Package syntax highlighting, diagnostics, formatting, hover docs, snippets, and a local preview panel around the existing language server.
- [ ] **Unified Error Overlay:** Standardize parser, validation, and target codegen errors into one overlay with source spans and suggested fixes.
- [ ] **Loom Doctor:** Add `loom doctor` to detect broken package versions, missing bundler config, WASM/NAPI fallback issues, and stale generated artifacts.
- [ ] **Migration Experience:** Extend the codemod into a guided migration report that scores React components, flags unsupported patterns, and links to fixes.
- [ ] **Benchmark Dashboard:** Publish compiler speed, output size, and rebuild latency comparisons against handwritten React/Vue/Svelte examples.

### 🦀 Rust Core & Performance
- [x] **Performance Tuning:** Optimize NAPI/WASM overhead for large-scale projects.
- [x] **Fuzz Testing:** Stress-test the Rust parser with malformed and edge-case inputs.
- [x] **Memory Audit:** Ensure zero-copy or minimal-copy handoffs between Rust and Node.js.
- [ ] **Incremental Cache v2:** Cache parse, analysis, and target codegen by zone to make large-project rebuilds visibly faster.
- [ ] **Cross-Package Indexing:** Resolve symbols, imports, and component contracts across workspaces for monorepo-scale diagnostics.

### 🛡️ Security & Robustness
- [x] **XSS Audit:** Verify expression sanitization across all three codegen targets.
- [x] **LoomKit E2E:** Comprehensive testing for routing and SSR primitives.
- [x] **Semantic Parity:** 100% feature alignment (props, state, events, slots) across all frameworks.
- [ ] **Strict A11y Mode:** Add opt-in diagnostics that fail builds for unlabeled controls, invalid ARIA, and missing keyboard paths.
- [ ] **Security Scanner:** Detect unsafe HTML, URL, event, and expression patterns before target code is emitted.
- [ ] **Bundle Budgets:** Enforce per-component output size limits and report what pushed a component over budget.

### 📖 Documentation & Distribution
- [ ] **Loom.dev:** Launch the official documentation site with integrated WASM playground.
- [ ] **Migration Guides:** Step-by-step paths for React, Vue, and Svelte developers.
- [ ] **Automated Release:** NPM publishing with provenance and automated changelogs.
- [ ] **API Reference Generator:** Generate package and language reference pages from compiler metadata, examples, and exported TypeScript declarations.
- [ ] **Production Recipes:** Document auth forms, async data, design tokens, head metadata, i18n, and framework interop as copy-pasteable recipes.

### ✨ Advanced Language Features
- [x] **Atomic CSS:** Optional mode for utility-first CSS generation.
- [x] **Enhanced Keying:** Improved reconciliation strategy for complex loops.
- [x] **MDLoom:** Native support for Markdown embedding within Loom components.
- [ ] **Meta Zone:** Add `- meta` for title, SEO, OpenGraph, and framework-specific head output.
- [ ] **Schema Zone:** Add `- schema` for runtime prop/data validation through adapters such as Zod or Valibot.
- [ ] **i18n Dimension:** Add a translation-key dimension with extraction tooling and missing-key diagnostics.
- [ ] **Server Zone:** Add `- server`/server-action primitives for LoomKit and React Server Component experiments.
- [ ] **Directive API:** Define a conservative plugin API for syntax extensions such as lazy rendering, auth gates, and target-specific transforms.
- [ ] **Static CSS Extraction:** Extract all static `::` styles into CSS assets with source maps and target-specific imports.
- [ ] **Design Token Pipeline:** Support project-level tokens and generated CSS variables for themes, variants, and dark mode.
- [ ] **Asset Optimization:** Optimize images, fonts, and SVG assets referenced from Loom styles or markup during builds.

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

## 🧭 Later Bets

These are high-upside ideas from `updates.md` that need validation before they belong in the 1.0 milestone.

- [ ] **Visual Component Studio:** Explore a visual editor that round-trips cleanly with `.loom` files without creating a second source of truth.
- [ ] **Project Graph View:** Visualize component dependencies, generated outputs, bundle weight, and diagnostics across a workspace.
- [ ] **Component Registry:** Validate whether framework-agnostic components can be distributed, previewed, and trusted through a Loom registry.
- [ ] **Custom Target API:** Prototype a stable target adapter contract before adding more first-class framework targets.
- [ ] **SolidJS Target:** Consider Solid as the next target if the adapter contract proves it can preserve fine-grained reactivity.
- [ ] **No-JS/HTML Target:** Research a progressive enhancement target for static and content-heavy pages.
- [ ] **Local-First Sync Patterns:** Explore CRDT/Replicache recipes at the LoomKit layer rather than baking sync into the core language.

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
bun run verify           # Full workspace health check
bun run build            # Build all packages
bun run test             # Run all tests

# Package Specifics
bun run --filter @loom-lang/compiler test
bun run --filter loom_core test
bun run --filter vite-plugin-loom build
```
