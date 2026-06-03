# Loom Core Package Instructions

Rust-based lexer, parser, and indexer for the Loom language.

## 🏗️ Architecture
- **Language:** Written in Rust for performance and safety.
- **Integration:** Uses `napi-rs` to export bindings to Node.js.
- **Source:** The Rust source lives in `src/`.
- **Bindings:** The JS/TS entry point is `index.js` and `index.d.ts`, which are generated/managed by NAPI.

## 🛠️ Commands
- `pnpm run build`: Build the Rust project and generate NAPI bindings.
- `pnpm run test`: Run the Rust test suite (`cargo test`).
- `pnpm run build:debug`: Build in debug mode for faster iteration.

## 🤖 Agentic Rules
- **Parser Source of Truth:** This package is the definitive source of truth for Loom syntax. Changes here require updating the TypeScript compiler to handle new AST structures.
- **NAPI Boundary:** Be careful when modifying types exported to JS. Ensure `index.d.ts` is updated or regenerated.
- **Safety:** Prefer safe Rust. Only use `unsafe` if absolutely necessary for performance and properly documented.
- **Lexer/Parser:** Use the internal tracing/logging if debugging complex parsing issues.
