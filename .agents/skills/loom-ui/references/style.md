# Loom Style & Quality

## TypeScript Standards
- **Strict Typing:** Set `noImplicitAny: true`. Never use `any`.
- **Interfaces:** Prefer `interface` over `type` for public API definitions to support better extensibility and IDE performance.
- **Null Safety:** Use optional chaining and nullish coalescing. Handle potential `undefined` states from the Rust parser.

## Codegen & Printer
- **Deterministic Output:** Use the canonical printer in `packages/compiler/src/printer/`. Do not manually concatenate strings for code generation.
- **Idiomatic Output:** Ensure the generated code follows the best practices of the target framework (React, Vue, Svelte).

## Loom Paradigm
- **Declarative Zones:** Focus on defining logic within the standard Loom zones (logic, view, style).
- **Dimension-Driven UI:** Adhere to the responsive dimension-driven layout system.
