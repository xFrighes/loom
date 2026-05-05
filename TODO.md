# Loom Compiler Implementation TODO

This file is the source of truth for shipping Loom from compiler MVP to usable alpha, then from alpha to framework-grade tooling.

The old roadmap was directionally good but too aspirational to execute. This version is grounded in the current monorepo and is ordered by real blockers, not by feature glamour.

## 1. Current State

### Verified on 2026-05-04

#### What already exists

- `packages/compiler`
  - Lexer, parser, AST, CLI, formatter (printer), fold provider, language server baseline
  - Source spans on tokens and core AST nodes
  - Structured validation and actionable diagnostics
  - Code generators for React, Vue, and Svelte
  - Unit tests for lexer, parser, validation, and codegen
- `packages/loom_core` (Rust)
  - Tokenizer, parser, and indexer ported to Rust
  - NAPI-RS and WASM bindings
- `packages/vite-plugin-loom`
  - Vite plugin with target detection
  - Virtual framework-module handoff for React, Vue, and Svelte
  - Virtual CSS module loading
- `packages/loom-llm`
  - Projection-and-patch tooling for LLM workflows
- `packages/loom-testing`
  - Vitest helpers and matchers
- `packages/loom-tailwind`
  - Tailwind candidate extraction
- `packages/eslint-plugin-loom`
  - ESLint processor for `.loom` files
- Root `README.md`
- Root `pnpm run verify` health check
- `examples/react-demo`
- `examples/vue-demo`
- `examples/svelte-demo`

#### Current command matrix

- [x] `pnpm --filter @loom-lang/compiler test`
- [x] `pnpm --filter @loom-lang/compiler typecheck`
- [x] `pnpm --filter @loom-lang/compiler build`
- [x] `pnpm --filter vite-plugin-loom test`
- [x] `pnpm --filter vite-plugin-loom build`
- [x] `pnpm --filter react-demo build`
- [x] `pnpm --filter vue-demo build`
- [x] `pnpm --filter svelte-demo build`
- [x] `pnpm run verify`
- [x] `pnpm -r typecheck`

### Immediate conclusion

Loom has passed the Beta gate. The core compiler is stable, ecosystem integrations exist, and a Rust-based core is already being integrated.

The next focus is completing the Rust migration and moving towards a 1.0 stable release.

## 2. Delivery Principles

- [x] Keep `compiler`, `vite-plugin-loom`, and all demos green before starting new syntax features
- [x] Every runtime-visible feature requires:
  - parser coverage
  - codegen coverage for React, Vue, and Svelte
  - integration coverage at the Vite plugin layer when applicable
- [x] Prefer explicit architecture decisions over target-specific hacks
- [x] Separate parse, validate, and codegen responsibilities
- [x] Preserve framework-specific escape hatches, but keep Loom syntax framework-agnostic by default
- [x] Treat source maps, diagnostics, and build-tool compatibility as core product work, not polish

## 3. Package Map

### Compiler core

- `packages/compiler/src/lexer.ts`
  - tokenization, indentation, zone detection
- `packages/compiler/src/parser.ts`
  - AST construction, zone parsing, control-flow parsing
- `packages/compiler/src/ast.ts`
  - canonical AST model
- `packages/compiler/src/codegen/react.ts`
- `packages/compiler/src/codegen/vue.ts`
- `packages/compiler/src/codegen/svelte.ts`
- `packages/compiler/src/codegen/css.ts`
- `packages/compiler/src/index.ts`
  - public compile API
- `packages/compiler/src/cli.ts`
  - `loomc`
- `packages/compiler/src/prettier-plugin.ts`
  - current plugin shell
- `packages/compiler/src/printer.ts`
  - canonical Loom printer (replaces the whitespace-only formatter)
- `packages/compiler/src/language-server.ts`
  - diagnostics + folds + preview hover baseline
- `packages/compiler/src/rust-parser.ts`
  - NAPI/WASM bridge to `loom_core`
- `packages/compiler/tests/*.test.ts`

### Bundler integration

- `packages/vite-plugin-loom/src/index.ts`
  - transform, resolveId, load, CSS virtual module strategy

### Rust Core

- `packages/loom_core/src/lexer.rs`
- `packages/loom_core/src/parser.rs`
- `packages/loom_core/src/lib.rs` (NAPI/WASM exports)

### Ecosystem

- `packages/loom-llm`
- `packages/loom-testing`
- `packages/loom-tailwind`
- `packages/eslint-plugin-loom`

### Smoke apps

- `examples/react-demo`
- `examples/vue-demo`
- `examples/svelte-demo`

## 4. Milestones

### Alpha gate

Goal: Loom can be compiled, typechecked, tested, and built in all three demo apps through Vite with a stable package contract.

Required:

- [x] All workspace checks green
- [x] All three demos build successfully
- [x] Vite plugin has real integration tests
- [x] Compiler emits actionable diagnostics
- [x] README-level usage docs exist

### Beta gate

Goal: Loom is pleasant to author in and debuggable in-editor.

Required:

- [x] Source maps in compiler and Vite plugin
- [x] Language server diagnostics and hover/completion baseline
- [x] Formatter understands zones and indentation
- [x] Tailwind extraction and test helpers

### 1.0 gate

Goal: Loom is not just compilable, but ecosystem-ready.

Required:

- [x] Mature testing story (`loom-testing`)
- [x] ESLint integration (`eslint-plugin-loom`)
- [ ] **Target Parity:** 100% semantic parity for core features (props, state, events, slots, loops) across React, Vue, and Svelte
- [x] **LoomKit (Meta-framework):** File-system routing and SSR primitive baseline
- [x] **Loom DevTools:** Development runtime hook baseline for unified debugging
- [x] **WASM Playground:** Browser-friendly playground compiler API baseline
- [ ] **Production Infrastructure:** Automated CI/CD, security audit, and 1.0 docs site
- [ ] **Rust Core Finalization:** Production-grade NAPI bindings and WASM performance

## 5. P2: Developer Experience (Completed)

- [x] P2.1 Add end-to-end source maps
- [x] P2.2 Upgrade the language server from stub to useful baseline
- [x] P2.3 Replace the whitespace-only formatter with a canonical printer
- [x] P2.4 Improve CLI ergonomics

## 6. P3: Ecosystem and Integration

### [x] P3.1 Add testing helpers for Loom components
- Status: Completed in `packages/loom-testing`

### [x] P3.2 Tailwind extraction support
- Status: Completed in `packages/loom-tailwind`

### [x] P3.3 ESLint integration
- Status: Completed in `packages/eslint-plugin-loom`

### [x] P3.4 Additional bundlers after Vite is stable
- [x] Rollup plugin (`packages/rollup-plugin-loom`)
- [x] esbuild plugin (`packages/esbuild-plugin-loom`)
- [x] webpack loader (`packages/webpack-loader-loom`)
- [x] Rspack plugin (`packages/rspack-plugin-loom`)

### [x] P3.5 Implement `loom-llm` token-optimization tooling
- Status: Reference TypeScript implementation completed in `packages/loom-llm`

## 7. P4: Rust Compiler Migration (Ongoing)

See: `docs/plans/2026-04-24-rust-compiler-migration-epic.md`

- [x] Phase 1: Benchmarking & Profiling
- [x] Phase 2: Initialize Rust Core & Port Lexer
- [x] Phase 3: Port AST and Parser to Rust
- [ ] Phase 4: NAPI-RS Bindings (Integration in `@loom-lang/compiler`)
- [ ] Phase 5: WebAssembly (WASM) Compilation (Playground unblocker)
- [ ] Phase 6: Port loom-llm Projection Indexer

## 8. P5: Production & Distribution Readiness

### [ ] P5.1 Automated CI/CD and Cross-Platform Builds
- [x] Set up GitHub Actions for automated cross-platform NAPI builds (Linux, macOS, Windows)
- [ ] Implement automated NPM publishing with provenance
- [ ] Automate changelog generation and SemVer tagging

### [ ] P5.2 Security and Robustness
- [ ] Security audit of generated framework code (XSS prevention in expressions)
- [ ] Fuzz testing for the Rust parser/lexer
- [ ] Comprehensive E2E test suite for LoomKit routing and SSR

### [ ] P5.3 Documentation and Community
- [ ] Launch `loom.dev` docs site with integrated WASM playground
- [ ] Detailed migration guides for React, Vue, and Svelte users
- [ ] API reference for all packages

## 9. P6: Advanced Language Features

- [x] Scoped slots / render props
- [x] Universal two-way binding (`bind:value`)
- [x] SSR and server-component directives (`"use server"`)
- [ ] Optional atomic CSS mode
- [ ] Better keying strategy in loops
- [ ] MDLoom or Markdown embedding

## 10. Completed Sequence (Highlights)

- [x] 1-5: Alpha gate stabilization (Vite, Verify script, Source spans, Diagnostics)
- [x] 6: Beta gate items (Source maps, LS improvements, Formatter/Printer)
- [x] 7: Ecosystem expansion (Testing, Tailwind, ESLint, loom-llm)
- [x] 8: Rust Core V1 (Lexer, Parser, NAPI/WASM foundations)

## 10. Command Cheat Sheet

```bash
pnpm --filter @loom-lang/compiler test
pnpm --filter @loom-lang/compiler build

pnpm --filter vite-plugin-loom test
pnpm --filter vite-plugin-loom build

pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build

pnpm --filter loom-llm test
pnpm --filter loom-testing test
pnpm --filter loom-tailwind test
pnpm --filter eslint-plugin-loom test

pnpm run verify
pnpm -r build
pnpm -r test
pnpm -r typecheck
```
