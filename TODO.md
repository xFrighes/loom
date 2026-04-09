# Loom Compiler Implementation TODO

This file is the source of truth for shipping Loom from compiler MVP to usable alpha, then from alpha to framework-grade tooling.

The old roadmap was directionally good but too aspirational to execute. This version is grounded in the current monorepo and is ordered by real blockers, not by feature glamour.

## 1. Current State

### Verified on 2026-04-09

#### What already exists

- `packages/compiler`
  - Lexer, parser, AST, CLI, formatter, fold provider, minimal language server
  - Code generators for React, Vue, and Svelte
  - Unit tests for lexer, parser, and codegen
- `packages/vite-plugin-loom`
  - Vite plugin with target detection
  - Virtual CSS module loading
- `examples/react-demo`
- `examples/vue-demo`
- `examples/svelte-demo`

#### Current command matrix

- [x] `pnpm --filter @loom-lang/compiler test`
- [x] `pnpm --filter @loom-lang/compiler build`
- [x] `pnpm --filter vite-plugin-loom build`
- [ ] `pnpm --filter @loom-lang/compiler typecheck`
  - Fails with `TS6059` because `packages/compiler/tsconfig.json` sets `rootDir: "./src"` while also including `tests/**/*`
- [ ] `pnpm --filter vite-plugin-loom test`
  - Fails because there are no test files
- [ ] `pnpm --filter react-demo build`
  - Fails in Vite import analysis because `.loom` is transformed into JSX under a `.loom` module id
- [ ] `pnpm --filter vue-demo build`
  - Fails because generated SFC output is returned under a `.loom` id, so Vue's plugin never receives a `.vue` module
- [ ] `pnpm --filter svelte-demo build`
  - Fails because generated SFC output is returned under a `.loom` id, so Svelte's plugin never receives a `.svelte` module

### Immediate conclusion

Loom is blocked first by packaging and integration correctness, not by missing language features.

Do not add major syntax surface area until the alpha gate is green.

## 2. Delivery Principles

- [ ] Keep `compiler`, `vite-plugin-loom`, and all demos green before starting new syntax features
- [ ] Every runtime-visible feature requires:
  - parser coverage
  - codegen coverage for React, Vue, and Svelte
  - integration coverage at the Vite plugin layer when applicable
- [ ] Prefer explicit architecture decisions over target-specific hacks
- [ ] Separate parse, validate, and codegen responsibilities
- [ ] Preserve framework-specific escape hatches, but keep Loom syntax framework-agnostic by default
- [ ] Treat source maps, diagnostics, and build-tool compatibility as core product work, not polish

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
- `packages/compiler/src/formatter.ts`
  - currently whitespace-only
- `packages/compiler/src/language-server.ts`
  - currently fold + preview hover only
- `packages/compiler/tests/*.test.ts`

### Bundler integration

- `packages/vite-plugin-loom/src/index.ts`
  - transform, resolveId, load, CSS virtual module strategy

### Smoke apps

- `examples/react-demo`
- `examples/vue-demo`
- `examples/svelte-demo`

## 4. Milestones

### Alpha gate

Goal: Loom can be compiled, typechecked, tested, and built in all three demo apps through Vite with a stable package contract.

Required:

- [ ] All workspace checks green
- [ ] All three demos build successfully
- [ ] Vite plugin has real integration tests
- [ ] Compiler emits actionable diagnostics
- [ ] README-level usage docs exist

### Beta gate

Goal: Loom is pleasant to author in and debuggable in-editor.

Required:

- [ ] Source maps in compiler and Vite plugin
- [ ] Language server diagnostics and hover/completion baseline
- [ ] Formatter understands zones and indentation
- [ ] Tailwind extraction and test helpers

### 1.0 gate

Goal: Loom is not just compilable, but ecosystem-ready.

Required:

- [ ] Strong framework parity for core semantics
- [ ] Docs site and playground
- [ ] Mature testing story
- [ ] Escape hatches and advanced syntax stabilized

## 5. P0: Alpha Gate / Stabilization

### [ ] P0.1 Fix compiler TypeScript project layout

Why:

- `@loom-lang/compiler` typecheck is red before any product code is evaluated

Files:

- Modify: `packages/compiler/tsconfig.json`
- Create: `packages/compiler/tsconfig.build.json` if needed
- Modify: `packages/compiler/package.json`

Tasks:

- [ ] Split build config and dev/test config, or remove the invalid `rootDir` assumption
- [ ] Ensure test files are typechecked without breaking declaration emit
- [ ] Keep `build` focused on `src/**/*`
- [ ] Keep `typecheck` responsible for both `src` and `tests`

Definition of done:

- [ ] `pnpm --filter @loom-lang/compiler typecheck` passes
- [ ] `pnpm --filter @loom-lang/compiler build` still passes
- [ ] No declaration output path regressions

Validate:

```bash
pnpm --filter @loom-lang/compiler typecheck
pnpm --filter @loom-lang/compiler test
pnpm --filter @loom-lang/compiler build
```

### [ ] P0.2 Add real tests for `vite-plugin-loom`

Why:

- The package ships a `test` script but has zero test coverage

Files:

- Create: `packages/vite-plugin-loom/tests/index.test.ts`
- Modify: `packages/vite-plugin-loom/package.json` if a dedicated test config or setup is needed

Tasks:

- [ ] Add transform tests for `.loom` input across `react`, `vue`, and `svelte`
- [ ] Add tests for CSS virtual module ids
- [ ] Add tests for `resolveId` and `load`
- [ ] Add tests for target auto-detection behavior
- [ ] Assert sourcemap behavior explicitly once source maps are added

Definition of done:

- [ ] `pnpm --filter vite-plugin-loom test` passes
- [ ] Failing integration scenarios from the demo builds are represented in tests

Validate:

```bash
pnpm --filter vite-plugin-loom test
pnpm --filter vite-plugin-loom build
```

### [ ] P0.3 Redesign the Vite integration contract

Why:

- The current plugin returns framework output under the original `.loom` id
- That is insufficient for Vite import analysis and for Vue/Svelte SFC plugin chains

Files:

- Modify: `packages/vite-plugin-loom/src/index.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/compiler/src/codegen/target.ts`
- Potentially modify: `packages/compiler/src/codegen/react.ts`
- Potentially create: additional Vite helper modules under `packages/vite-plugin-loom/src/`

Tasks:

- [ ] Document the integration model before coding
- [ ] Decide how each target is handed to Vite:
  - React: either emit plain JS that import-analysis can parse, or route through a virtual JS/TSX module Vite can treat correctly
  - Vue: emit a virtual `.vue` module or equivalent handoff that the Vue plugin actually processes
  - Svelte: emit a virtual `.svelte` module or equivalent handoff that the Svelte plugin actually processes
- [ ] Keep CSS virtual modules working with the new module strategy
- [ ] Make the plugin architecture testable without starting a full dev server
- [ ] Avoid hardcoding target-specific hacks into the compiler when the issue is bundler handoff

Definition of done:

- [ ] `pnpm --filter react-demo build` passes
- [ ] `pnpm --filter vue-demo build` passes
- [ ] `pnpm --filter svelte-demo build` passes
- [ ] `pnpm -r build` passes for the whole workspace

Validate:

```bash
pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build
pnpm -r build
```

### [ ] P0.4 Create a single workspace verification command

Why:

- The repo needs one command that answers “is Loom healthy?”

Files:

- Modify: `package.json`
- Potentially create: `scripts/verify.mjs`

Tasks:

- [ ] Add a root `verify` script that runs typecheck, tests, package builds, and demo builds in a deliberate order
- [ ] Make the command fail with the first meaningful blocker
- [ ] Keep it fast enough for local iteration

Definition of done:

- [ ] `pnpm run verify` exists
- [ ] It covers compiler, Vite plugin, and all demos

## 6. P1: Compiler Correctness

### [ ] P1.1 Add source locations to AST nodes

Why:

- Exact line and column data is the prerequisite for real diagnostics, source maps, editor features, and better tests

Files:

- Modify: `packages/compiler/src/ast.ts`
- Modify: `packages/compiler/src/lexer.ts`
- Modify: `packages/compiler/src/parser.ts`
- Modify: `packages/compiler/tests/parser.test.ts`

Tasks:

- [ ] Define a reusable source span type
- [ ] Attach spans to tokens
- [ ] Attach spans to AST nodes
- [ ] Preserve spans through parse branches such as `if`, `each`, slots, and style rules

Definition of done:

- [ ] Parse errors can point to exact source spans
- [ ] Tests assert at least a few representative node spans

### [ ] P1.2 Separate parsing from validation

Why:

- `parser.ts` currently does syntax recognition and some semantic assumptions in one place
- Future diagnostics will be much easier with an explicit validation pass

Files:

- Create: `packages/compiler/src/validate.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/compiler/src/cli.ts`
- Modify: `packages/compiler/src/language-server.ts`

Tasks:

- [ ] Keep parser focused on AST construction
- [ ] Move semantic checks into validation
- [ ] Add validation for duplicate attrs, invalid control-flow placement, slot misuse, unsupported modifier combinations, and malformed props
- [ ] Return structured diagnostics instead of throwing plain strings everywhere

Definition of done:

- [ ] Compiler can report multiple actionable diagnostics
- [ ] CLI can print diagnostics without collapsing to one generic error message

### [ ] P1.3 Harden expression handling

Why:

- Complex expressions are still largely treated as raw strings
- This is a likely failure point for multiline conditions, nested objects, ternaries, and future transforms

Files:

- Modify: `packages/compiler/src/parser.ts`
- Potentially create: `packages/compiler/src/expr.ts`
- Modify: `packages/compiler/tests/parser.test.ts`

Tasks:

- [ ] Define which Loom positions accept arbitrary JS/TS expressions
- [ ] Add parser coverage for multiline and nested expressions
- [ ] Decide whether expression parsing stays string-based with better balancing rules or moves to a real JS/TS parser
- [ ] Protect indentation tracking from expression complexity

Definition of done:

- [ ] Dynamic attrs, `if` conditions, `each` expressions, prop defaults, and event bodies are covered by edge-case tests

### [ ] P1.4 Normalize core semantics across targets

Why:

- Syntax support exists, but parity rules are not yet explicit

Files:

- Modify: `packages/compiler/src/codegen/react.ts`
- Modify: `packages/compiler/src/codegen/vue.ts`
- Modify: `packages/compiler/src/codegen/svelte.ts`
- Modify: `packages/compiler/tests/codegen.test.ts`

Tasks:

- [ ] Define the semantic contract for:
  - props defaults
  - named and default slots
  - polymorphic elements
  - event modifiers
  - loops and key behavior
  - inline HTML behavior
- [ ] Add a target parity matrix directly to tests or docs
- [ ] Warn where Loom cannot guarantee equivalent behavior

Definition of done:

- [ ] Codegen tests read like a compatibility specification, not just spot checks

### [ ] P1.5 Stabilize CSS scoping and extraction

Why:

- CSS is one of Loom’s differentiators, but its contract is not documented or fully tested

Files:

- Modify: `packages/compiler/src/codegen/css.ts`
- Modify: `packages/compiler/src/codegen/react.ts`
- Modify: `packages/compiler/src/codegen/vue.ts`
- Modify: `packages/compiler/src/codegen/svelte.ts`
- Modify: `packages/compiler/tests/codegen.test.ts`

Tasks:

- [ ] Make class naming deterministic
- [ ] Clarify how authored classes and generated scoped classes merge
- [ ] Add more cases for nested selectors, media queries, and `:global(...)`
- [ ] Decide whether Vue should use module styles or scoped styles long-term
- [ ] Document the differences between React/Vue/Svelte CSS output

Definition of done:

- [ ] CSS output is deterministic across repeated builds
- [ ] Existing authored classes are preserved correctly

## 7. P2: Developer Experience

### [ ] P2.1 Add end-to-end source maps

Why:

- `packages/vite-plugin-loom/src/index.ts` currently returns `map: null`
- Good runtime debugging is impossible without a sourcemap contract

Files:

- Modify: `packages/compiler/src/codegen/target.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/vite-plugin-loom/src/index.ts`

Tasks:

- [ ] Extend `CompileResult` to include maps
- [ ] Decide whether maps are generated in compiler, in plugin composition, or both
- [ ] Add tests or snapshots for representative mappings

Definition of done:

- [ ] Browser/runtime stacks can be mapped back to `.loom`
- [ ] Plugin no longer returns `map: null` for transformed modules

### [ ] P2.2 Upgrade the language server from stub to useful baseline

Why:

- `packages/compiler/src/language-server.ts` currently provides empty diagnostics and zone-preview hover only

Files:

- Modify: `packages/compiler/src/language-server.ts`
- Modify: `packages/compiler/src/folds.ts`
- Reuse: parser/validator APIs

Tasks:

- [ ] Publish parse and validation diagnostics
- [ ] Keep folding support
- [ ] Add hover for nodes, attrs, modifiers, and zones
- [ ] Add basic completions for zone markers and common HTML attrs
- [ ] Define a later path for `tsserver` proxy integration instead of faking it now

Definition of done:

- [ ] Invalid Loom files show real editor diagnostics
- [ ] Hover is more useful than raw block preview

### [ ] P2.3 Replace the whitespace-only formatter

Why:

- `packages/compiler/src/formatter.ts` currently trims blank lines and trailing spaces only
- `packages/compiler/src/prettier-plugin.ts` is effectively a thin wrapper around that behavior

Files:

- Modify: `packages/compiler/src/formatter.ts`
- Modify: `packages/compiler/src/prettier-plugin.ts`
- Add tests for formatter behavior

Tasks:

- [ ] Format zone headers consistently
- [ ] Format indentation for markup and dimensions
- [ ] Preserve intentional multiline TS/JS blocks safely
- [ ] Decide whether CSS and logic zones are internally delegated to established formatters later

Definition of done:

- [ ] Formatting a file is idempotent
- [ ] Complex nested markup is normalized predictably

### [ ] P2.4 Improve CLI ergonomics

Why:

- `loomc` exists, but it is still minimal

Files:

- Modify: `packages/compiler/src/cli.ts`

Tasks:

- [ ] Add `--target` or align current flag naming consistently with package/docs language
- [ ] Add file output mode instead of stdout-only compile
- [ ] Add machine-readable diagnostics mode
- [ ] Add `--watch` only after the compile contract is stable

Definition of done:

- [ ] CLI is useful for CI and local debugging, not just smoke testing

## 8. P3: Ecosystem and Integration

### [ ] P3.1 Add testing helpers for Loom components

Files:

- Create: testing helpers in either `packages/compiler` or a dedicated new package

Tasks:

- [ ] Decide whether Loom ships a Vitest helper, a transform helper, or both
- [ ] Add at least one integration example per framework

### [ ] P3.2 Tailwind extraction support

Files:

- Likely create a dedicated package or extractor module

Tasks:

- [ ] Define how static classes are extracted from `.loom`
- [ ] Decide what to do with dynamic class expressions

### [ ] P3.3 ESLint integration

Files:

- Likely a new package: `packages/eslint-plugin-loom`

Tasks:

- [ ] Start with parser/processor strategy, not rules
- [ ] Map diagnostics back to `.loom` source

### [ ] P3.4 Additional bundlers after Vite is stable

Blocked until Alpha gate is green.

- [ ] Rollup plugin
- [ ] esbuild plugin
- [ ] webpack loader
- [ ] Rspack plugin

## 9. P4: Language Feature Backlog

These are valuable, but they are not the next thing to build.

### Post-alpha features

- [ ] Scoped slots / render props
- [ ] Universal two-way binding
- [ ] SSR and server-component directives
- [ ] Framework-specific escape hatches
- [ ] Better keying strategy in loops
- [ ] Stronger prop and generic validation
- [ ] Optional atomic CSS mode
- [ ] MDLoom or Markdown embedding

### Rule for this section

Do not start any item here until:

- [ ] `pnpm run verify` exists
- [ ] All demo builds are green
- [ ] Vite integration is tested

## 10. Documentation and Community

### [ ] D0 README and install flow

Files:

- Create or expand root documentation

Tasks:

- [ ] Explain what Loom is
- [ ] Explain current support level honestly
- [ ] Document how to run demos, tests, and builds
- [ ] Show one minimal example per framework

### [ ] D1 Syntax reference

- [ ] Zones
- [ ] markup
- [ ] `:`
- [ ] `::`
- [ ] `@`
- [ ] `if`
- [ ] `each`
- [ ] slots
- [ ] polymorphic `element`

### [ ] D2 Playground / REPL

Blocked until compiler and Vite contracts are stable.

### [ ] D3 Contribution guide

- [ ] Explain package boundaries
- [ ] Explain how to add a syntax feature safely
- [ ] Explain required tests per change

## 11. Recommended First PR Sequence

This is the fastest sensible order to move the repo from red to credible alpha work.

### PR 1: Fix compiler typecheck layout

- Scope: `packages/compiler/tsconfig*.json`, `packages/compiler/package.json`
- Goal: make `pnpm --filter @loom-lang/compiler typecheck` green

### PR 2: Add `vite-plugin-loom` tests

- Scope: `packages/vite-plugin-loom/tests/index.test.ts`
- Goal: stop shipping an untested plugin package

### PR 3: Redesign Vite handoff for React

- Scope: `packages/vite-plugin-loom/src/index.ts`
- Goal: make `pnpm --filter react-demo build` green

### PR 4: Redesign Vite handoff for Vue and Svelte

- Scope: `packages/vite-plugin-loom/src/index.ts`
- Goal: make `pnpm --filter vue-demo build` and `pnpm --filter svelte-demo build` green

### PR 5: Add root `verify` script

- Scope: root `package.json`, optional helper script
- Goal: one green/red command for the whole workspace

### PR 6: Add AST source spans

- Scope: `lexer.ts`, `parser.ts`, `ast.ts`
- Goal: unblock diagnostics and source maps

### PR 7: Add validation pass and real diagnostics

- Scope: new `validate.ts`, CLI, language server
- Goal: actionable errors instead of generic failures

### PR 8: Replace formatter placeholder

- Scope: `formatter.ts`, `prettier-plugin.ts`
- Goal: authoring experience stops feeling prototype-grade

## 12. Definition of Done for Any Feature

- [ ] Parser coverage exists where syntax changes
- [ ] Codegen coverage exists for React, Vue, and Svelte
- [ ] Integration coverage exists if bundler/editor behavior changes
- [ ] Typecheck, tests, and builds are green
- [ ] Docs or syntax reference updated when user-visible behavior changes
- [ ] If behavior differs by target, the difference is explicitly documented

## 13. Command Cheat Sheet

```bash
pnpm --filter @loom-lang/compiler test
pnpm --filter @loom-lang/compiler typecheck
pnpm --filter @loom-lang/compiler build

pnpm --filter vite-plugin-loom test
pnpm --filter vite-plugin-loom build

pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build

pnpm -r build
pnpm -r test
pnpm -r typecheck
```

## 14. Not Doing Yet

- [ ] No webpack/esbuild/rspack work before Vite is stable
- [ ] No advanced SSR story before demo builds and source maps are green
- [ ] No major syntax expansion before diagnostics and verification are in place
- [ ] No “magic” IDE experience before the language server has a real diagnostic pipeline
