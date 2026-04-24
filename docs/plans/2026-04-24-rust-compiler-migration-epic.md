# Epic Plan: Loom Rust Migration & Optimization

This epic outlines the 6-step roadmap to incrementally benchmark and port the Loom compiler and tools from TypeScript to Rust, integrating them via Native Bindings (NAPI-RS) and WebAssembly (WASM).

## Phase 1: Benchmarking & Profiling the TypeScript Compiler
**Objective**: Establish a baseline for the TypeScript compiler's performance to validate future Rust optimizations.
- **Task**: Create a benchmarking suite (`packages/compiler/scripts/benchmark.ts`).
- **Implementation Details**:
  - Dynamically generate 1,000 realistic `.loom` components in memory.
  - Instrument the `tokenize`, `parse`, and `compile` (codegen) functions to measure exact execution time in milliseconds.
  - Output results to the console.
  - **Flamegraph**: Introduce a script (e.g., `npm run benchmark:flame`) utilizing `0x` or Node.js native profiling (`--prof`) to generate an interactive flamegraph identifying bottlenecks.

## Phase 2: Initialize Rust Core & Port Lexer
**Objective**: Create the new `loom_core` Rust crate and port the tokenizer/lexer logic.
- **Task**: Scaffold crate and implement the lexer in Rust.
- **Implementation Details**:
  - Run `cargo init --lib packages/loom_core`.
  - Set up a Cargo workspace at the root.
  - Replicate `Token` and `TK` definitions in Rust.
  - Port `tokenize` from `packages/compiler/src/lexer.ts`.
  - Ensure exact 1:1 token streams and source span behavior.
  - Set up cross-language integration tests comparing TS vs Rust output.

## Phase 3: Port AST and Parser to Rust
**Objective**: Port the AST definitions and parsing logic, including syntax error recovery.
- **Task**: Implement the Rust parser.
- **Implementation Details**:
  - Translate TS AST types (from `packages/compiler/src/ast.ts`) to Rust `struct`s and `enum`s.
  - Implement parsing logic matching `packages/compiler/src/parser.ts`, covering indentation-based zone detection, control flow (`if`/`each`), and component blocks.
  - Ensure the Rust parser recovers from errors and emits the exact same structured diagnostics as the TS version.

## Phase 4: NAPI-RS Bindings
**Objective**: Integrate the high-performance Rust core back into the existing Node toolchain.
- **Task**: Set up `napi-rs` to export Rust parser/compiler functions to Node.js.
- **Implementation Details**:
  - Initialize `napi-rs` within the `loom_core` workspace.
  - Expose asynchronous Rust functions that accept file contents as strings and return serialized JSON (AST) or compiled framework strings.
  - Update `@loom-lang/compiler` and the Vite plugin to call the NAPI-RS bridge.

## Phase 5: WebAssembly (WASM) Compilation
**Objective**: Bring the high-performance Rust compiler to the browser for interactive documentation/playgrounds.
- **Task**: Compile `loom_core` to WASM using `wasm-pack`.
- **Implementation Details**:
  - Set up `wasm-pack` compilation targets in `packages/loom_core`.
  - Write a TS wrapper to instantiate and expose the WASM module in a browser environment.
  - Prove functionality by parsing and compiling files client-side.

## Phase 6: Port loom-llm Projection Indexer
**Objective**: Accelerate the AI projection indexing by rewriting CPU-heavy hashing and cache-invalidation.
- **Task**: Rewrite the `loom-llm` projection indexer and SHA-256 logic in Rust.
- **Implementation Details**:
  - Analyze `packages/loom-llm/src/indexer.ts` and port it to the Rust workspace.
  - Implement fast SHA-256 hashing to process thousands of files efficiently.
  - Integrate via NAPI-RS bindings for the `loom-llm` CLI to achieve massive enterprise-scale speedups.
