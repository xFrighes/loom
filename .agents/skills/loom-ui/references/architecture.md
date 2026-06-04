# Loom Architecture

## Monorepo Structure
Loom is organized as a monorepo to manage the lifecycle of the compiler, runtime components, and tooling.

- `packages/loom_core`: Rust-based core. Contains the Lexer, Parser, and Indexer. Uses NAPI-RS for TypeScript bindings.
- `packages/compiler`: TypeScript-based compiler. Handles AST transformation and codegen for React, Vue, and Svelte.
- `packages/vite-plugin-loom`: The primary build tool integration.
- `packages/loom-llm`: Optimized projections for AI contexts.

## The Parser/Compiler Boundary
- **Source of Truth:** The Rust `loom_core` is the absolute source of truth for the language grammar and AST structure.
- **Cross-Boundary Synchronization:** When modifying the language syntax:
  1. Update the Rust parser in `loom_core`.
  2. Regenerate NAPI bindings.
  3. Update the TypeScript AST definitions and visitor logic in `packages/compiler`.

## Zero-Runtime Philosophy
Loom components are compiled away. The output should be standard, idiomatic code for the target framework (e.g., standard React hooks/components) with minimal to no runtime overhead from Loom itself.
