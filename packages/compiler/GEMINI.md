# Compiler Package Instructions

Core TypeScript/Rust compiler and codegen for Loom.

## 🏗️ Architecture
- **Parser Boundary:** Reuses `loom_core` for lexing and parsing.
- **AST:** The TypeScript AST is the primary intermediate representation for codegen.
- **Targets:** Supports React, Vue, and Svelte. Each target lives in `src/codegen/targets/`.

## 🛠️ Commands
- `bun run test`: Run Vitest suite for the compiler.
- `bun run build`: Compile TypeScript and bundle with `tsup`.
- `bun run typecheck`: Strict TypeScript validation.

## 🤖 Agentic Rules
- **Codegen Changes:** When modifying a target (e.g., React), ensure you update the corresponding tests in `tests/codegen/react.test.ts`.
- **AST Nodes:** Refer to `src/ast/nodes.ts` for the definitive node definitions.
- **Printer:** The canonical printer is in `src/printer/`. Always use it for generating Loom source from AST.
