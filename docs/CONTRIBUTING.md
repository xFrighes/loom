# Contributing to Loom

Welcome. This guide explains how to make changes to Loom safely and consistently.

---

## Package boundaries

The monorepo is managed with [pnpm workspaces](https://pnpm.io/workspaces).

| Package | Name | Responsibility |
|---|---|---|
| `packages/compiler` | `@loom-lang/compiler` | Lexer, parser, AST, validation, code generation, formatter, CLI, language server |
| `packages/vite-plugin-loom` | `vite-plugin-loom` | Vite transform plugin; delegates to the compiler |
| `examples/react-demo` | `react-demo` | Smoke app for React integration |
| `examples/vue-demo` | `vue-demo` | Smoke app for Vue 3 integration |
| `examples/svelte-demo` | `svelte-demo` | Smoke app for Svelte integration |

**Rule:** The compiler must not import from the Vite plugin or any demo. The Vite plugin may import from the compiler. Demos import both.

---

## Development setup

```bash
# Install all dependencies (requires pnpm ≥ 8)
pnpm install

# Run all checks (typecheck + tests + builds)
pnpm run verify

# Compiler tests only
pnpm --filter @loom-lang/compiler test

# Compiler typecheck only
pnpm --filter @loom-lang/compiler typecheck

# Vite plugin tests
pnpm --filter vite-plugin-loom test

# Demo builds
pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build
```

Keep `pnpm run verify` green before and after every change.

---

## Adding a syntax feature

Every syntax change touches at minimum these three layers, in order:

### 1. AST (`packages/compiler/src/ast.ts`)

Add or extend the relevant node type. Keep nodes serialisable — no functions, no circular references. Every node should have an optional `span?: SourceSpan` field.

### 2. Lexer / parser

- **Lexer** (`lexer.ts`) — add new token types to `TK` only if necessary. Most features can be handled at the parse level using existing tokens.
- **Parser** (`parser.ts`) — extend the recursive-descent parser. Attach `span` to every new node from the token stream.

Write parser tests in `packages/compiler/tests/parser.test.ts` that assert both the AST shape and the source span.

### 3. Code generators (all three targets)

Every new AST node must be handled in:

- `packages/compiler/src/codegen/react.ts`
- `packages/compiler/src/codegen/vue.ts`
- `packages/compiler/src/codegen/svelte.ts`

If behaviour differs between targets, record the difference in `packages/compiler/src/codegen/warnings.ts` and emit a `CompilerDiagnostic` with severity `'warning'` from the affected target.

Write codegen tests in `packages/compiler/tests/codegen.test.ts` for each target.

### 4. Validator (`packages/compiler/src/validate.ts`)

If the new syntax has semantic constraints (e.g. "only valid inside a component element"), add validation rules. Validation runs after parsing, before codegen. Return structured `CompilerDiagnostic[]` — never throw plain strings.

### 5. Formatter (`packages/compiler/src/formatter.ts`)

Extend `printNode` (or the relevant printer) to handle the new AST node. Formatting must be **idempotent**: `formatLoom(formatLoom(src)) === formatLoom(src)`.

### 6. Language server (`packages/compiler/src/language-server.ts`)

- Add a case to `describeNode` for hover documentation.
- Add completions to `buildCompletions` if the new syntax has trigger characters.

### 7. Source map tracking

If the new node has a `span`, it will automatically be picked up by the `renderNode`/`renderNodeInner` split in each codegen. No changes needed unless you are adding a top-level zone.

---

## Required tests per change

| Change type | Required tests |
|---|---|
| New token type | `tests/lexer.test.ts`: tokenise representative inputs |
| New syntax / AST node | `tests/parser.test.ts`: AST shape + source spans |
| New validation rule | `tests/validate.test.ts`: valid and invalid cases |
| New codegen behaviour | `tests/codegen.test.ts`: React + Vue + Svelte output |
| Vite plugin change | `packages/vite-plugin-loom/tests/index.test.ts` |

All tests must pass: `pnpm -r test`.

---

## Commit and PR guidelines

- One logical change per commit.
- Commit messages should explain *why*, not just *what*.
- Keep `pnpm run verify` green on every commit.
- If behaviour differs by target, document it in both the test file and `docs/syntax.md`.
- Do not add features to multiple layers in the same PR unless they are strictly coupled (e.g. a parser change that requires a matching codegen change).

---

## Architecture decisions

### Parser

The parser is a hand-written recursive descent parser. The lexer emits `INDENT` / `DEDENT` pairs (Python-style) so the parser never needs to measure whitespace itself.

Zone headers (`- pug`, `- ts`, etc.) are emitted as `CONTEXT_SWITCH` tokens. The parser collects raw zone content and processes each zone separately after the full token stream is consumed.

### Codegen

Each target (`ReactTarget`, `VueTarget`, `SvelteTarget`) is self-contained. The targets share:

- `css.ts` — CSS extraction and selector expansion
- `warnings.ts` — cross-target parity warnings

Targets should **not** share markup rendering logic. Target-specific differences are intentional.

### CSS

CSS is extracted from the `::` dimension of each element and scoped with a deterministic hash. The hash is based on `componentName + scopeKey` where `scopeKey` includes the source line and column.

- React / Vue: extracted to a CSS Modules file (`.module.css`).
- Svelte: inlined in `<style>`.

### Source maps

Source maps are generated in each codegen target using the `SourceMapTracker` in `sourcemap.ts`. Maps are only produced when `options.sourceFile` is provided. The Vite plugin always passes the source file path.

### Formatter

The formatter parses the AST and pretty-prints it. If parsing fails, it falls back to whitespace-only cleanup. This means the formatter never corrupts invalid input.
