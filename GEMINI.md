# Loom Project Instructions

Loom is a framework-agnostic UI language compiling to React, Vue, and Svelte.

> [!IMPORTANT]
> **Orchestration:** Refer to `AGENTS.md` for the unified multi-agent coding protocol.

## 🏗️ Monorepo Structure
- `packages/compiler`: Core TS/Rust compiler & Codegen.
- `packages/loom_core`: Rust-based lexer, parser, and indexer (NAPI-based).
- `packages/vite-plugin-loom`: Primary bundler integration.
- `packages/loom-llm`: Token-optimized projection for AI.
- `docs/architecture`: Architectural specs and RFCs.
- `examples/`: Starters for React, Vue, and Svelte.

## 🛠️ Key Scripts
- `bun run verify`: Full health check (build, test, typecheck). **Run this before completing any task.**
- `bun run build`: Build all workspace packages.
- `bun run test`: Run workspace tests.

## 🤖 Agentic Coding Rules
- **Repository Map:** Always refer to `REPOMAP.md` for a signature-level overview of exports and structures across the monorepo.
- **Source of Truth:** Use `TODO.md` to track task progress and milestones.
- **Spec-First:** Before implementing complex features, refer to or create a spec in `docs/architecture/`.
- **Rust/TS Boundary:** `loom_core` is the source of truth for the AST. Changes to the parser require updating the Rust code and regenerating NAPI bindings.
- **Verification:** Never assume a fix works. Run `bun run verify` to validate across the monorepo.
- **Context Management:** For large files, use `grep_search` and targeted `read_file` calls.

## 🎨 Coding Style
- **TypeScript:** Use strict types. No `any`. Prefer `interface` over `type` for public APIs.
- **Rust:** Follow standard `cargo fmt` and `clippy` rules.
- **Consistency:** Align with the "Loom Way" — declarative zones and dimension-driven UI.
