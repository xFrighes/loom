# Loom Compiler Implementation TODO

This file is the source of truth for shipping Loom from compiler MVP to usable alpha, then from alpha to framework-grade tooling.

The old roadmap was directionally good but too aspirational to execute. This version is grounded in the current monorepo and is ordered by real blockers, not by feature glamour.

## 1. Current State

### Verified on 2026-04-09

#### What already exists

- `packages/compiler`
  - Lexer, parser, AST, CLI, formatter shell, fold provider, language server baseline
  - Source spans on tokens and core AST nodes
  - Structured validation and actionable diagnostics
  - Code generators for React, Vue, and Svelte
  - Unit tests for lexer, parser, validation, and codegen
- `packages/vite-plugin-loom`
  - Vite plugin with target detection
  - Virtual framework-module handoff for React, Vue, and Svelte
  - Virtual CSS module loading
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

Loom is through the alpha gate for the implemented `P0 + P1` slice.

The next work should stay focused on `P2` developer-experience items without reopening packaging or integration regressions.

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
- `packages/compiler/src/formatter.ts`
  - currently whitespace-only
- `packages/compiler/src/language-server.ts`
  - diagnostics + folds + preview hover baseline
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
- [ ] Tailwind extraction and test helpers

### 1.0 gate

Goal: Loom is not just compilable, but ecosystem-ready.

Required:

- [ ] Strong framework parity for core semantics
- [ ] Docs site and playground
- [ ] Mature testing story
- [ ] Escape hatches and advanced syntax stabilized

## 5. P0: Alpha Gate / Stabilization

### [x] P0.1 Fix compiler TypeScript project layout

Why:

- `@loom-lang/compiler` typecheck is red before any product code is evaluated

Files:

- Modify: `packages/compiler/tsconfig.json`
- Create: `packages/compiler/tsconfig.build.json` if needed
- Modify: `packages/compiler/package.json`

Tasks:

- [x] Split build config and dev/test config, or remove the invalid `rootDir` assumption
- [x] Ensure test files are typechecked without breaking declaration emit
- [x] Keep `build` focused on `src/**/*`
- [x] Keep `typecheck` responsible for both `src` and `tests`

Definition of done:

- [x] `pnpm --filter @loom-lang/compiler typecheck` passes
- [x] `pnpm --filter @loom-lang/compiler build` still passes
- [x] No declaration output path regressions

Validate:

```bash
pnpm --filter @loom-lang/compiler typecheck
pnpm --filter @loom-lang/compiler test
pnpm --filter @loom-lang/compiler build
```

### [x] P0.2 Add real tests for `vite-plugin-loom`

Why:

- The package ships a `test` script but has zero test coverage

Files:

- Create: `packages/vite-plugin-loom/tests/index.test.ts`
- Modify: `packages/vite-plugin-loom/package.json` if a dedicated test config or setup is needed

Tasks:

- [x] Add transform tests for `.loom` input across `react`, `vue`, and `svelte`
- [x] Add tests for CSS virtual module ids
- [x] Add tests for `resolveId` and `load`
- [x] Add tests for target auto-detection behavior
- [ ] Assert sourcemap behavior explicitly once source maps are added

Definition of done:

- [x] `pnpm --filter vite-plugin-loom test` passes
- [x] Failing integration scenarios from the demo builds are represented in tests

Validate:

```bash
pnpm --filter vite-plugin-loom test
pnpm --filter vite-plugin-loom build
```

### [x] P0.3 Redesign the Vite integration contract

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

- [x] Document the integration model before coding
- [x] Decide how each target is handed to Vite:
  - React: either emit plain JS that import-analysis can parse, or route through a virtual JS/TSX module Vite can treat correctly
  - Vue: emit a virtual `.vue` module or equivalent handoff that the Vue plugin actually processes
  - Svelte: emit a virtual `.svelte` module or equivalent handoff that the Svelte plugin actually processes
- [x] Keep CSS virtual modules working with the new module strategy
- [x] Make the plugin architecture testable without starting a full dev server
- [x] Avoid hardcoding target-specific hacks into the compiler when the issue is bundler handoff

Definition of done:

- [x] `pnpm --filter react-demo build` passes
- [x] `pnpm --filter vue-demo build` passes
- [x] `pnpm --filter svelte-demo build` passes
- [x] `pnpm -r build` passes for the whole workspace

Validate:

```bash
pnpm --filter react-demo build
pnpm --filter vue-demo build
pnpm --filter svelte-demo build
pnpm -r build
```

### [x] P0.4 Create a single workspace verification command

Why:

- The repo needs one command that answers “is Loom healthy?”

Files:

- Modify: `package.json`
- Potentially create: `scripts/verify.mjs`

Tasks:

- [x] Add a root `verify` script that runs typecheck, tests, package builds, and demo builds in a deliberate order
- [x] Make the command fail with the first meaningful blocker
- [x] Keep it fast enough for local iteration

Definition of done:

- [x] `pnpm run verify` exists
- [x] It covers compiler, Vite plugin, and all demos

## 6. P1: Compiler Correctness

### [x] P1.1 Add source locations to AST nodes

Why:

- Exact line and column data is the prerequisite for real diagnostics, source maps, editor features, and better tests

Files:

- Modify: `packages/compiler/src/ast.ts`
- Modify: `packages/compiler/src/lexer.ts`
- Modify: `packages/compiler/src/parser.ts`
- Modify: `packages/compiler/tests/parser.test.ts`

Tasks:

- [x] Define a reusable source span type
- [x] Attach spans to tokens
- [x] Attach spans to AST nodes
- [x] Preserve spans through parse branches such as `if`, `each`, slots, and style rules

Definition of done:

- [x] Parse errors can point to exact source spans
- [x] Tests assert at least a few representative node spans

### [x] P1.2 Separate parsing from validation

Why:

- `parser.ts` currently does syntax recognition and some semantic assumptions in one place
- Future diagnostics will be much easier with an explicit validation pass

Files:

- Create: `packages/compiler/src/validate.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/compiler/src/cli.ts`
- Modify: `packages/compiler/src/language-server.ts`

Tasks:

- [x] Keep parser focused on AST construction
- [x] Move semantic checks into validation
- [x] Add validation for duplicate attrs, invalid control-flow placement, slot misuse, unsupported modifier combinations, and malformed props
- [x] Return structured diagnostics instead of throwing plain strings everywhere

Definition of done:

- [x] Compiler can report multiple actionable diagnostics
- [x] CLI can print diagnostics without collapsing to one generic error message

### [x] P1.3 Harden expression handling

Why:

- Complex expressions are still largely treated as raw strings
- This is a likely failure point for multiline conditions, nested objects, ternaries, and future transforms

Files:

- Modify: `packages/compiler/src/parser.ts`
- Potentially create: `packages/compiler/src/expr.ts`
- Modify: `packages/compiler/tests/parser.test.ts`

Tasks:

- [x] Define which Loom positions accept arbitrary JS/TS expressions
- [x] Add parser coverage for multiline and nested expressions
- [x] Decide whether expression parsing stays string-based with better balancing rules or moves to a real JS/TS parser
- [x] Protect indentation tracking from expression complexity

Definition of done:

- [x] Dynamic attrs, `if` conditions, `each` expressions, prop defaults, and event bodies are covered by edge-case tests

### [x] P1.4 Normalize core semantics across targets

Why:

- Syntax support exists, but parity rules are not yet explicit

Files:

- Modify: `packages/compiler/src/codegen/react.ts`
- Modify: `packages/compiler/src/codegen/vue.ts`
- Modify: `packages/compiler/src/codegen/svelte.ts`
- Modify: `packages/compiler/tests/codegen.test.ts`

Tasks:

- [x] Define the semantic contract for:
  - props defaults
  - named and default slots
  - polymorphic elements
  - event modifiers
  - loops and key behavior
  - inline HTML behavior
- [x] Add a target parity matrix directly to tests or docs
- [x] Warn where Loom cannot guarantee equivalent behavior

Definition of done:

- [x] Codegen tests read like a compatibility specification, not just spot checks

### [x] P1.5 Stabilize CSS scoping and extraction

Why:

- CSS is one of Loom’s differentiators, but its contract is not documented or fully tested

Files:

- Modify: `packages/compiler/src/codegen/css.ts`
- Modify: `packages/compiler/src/codegen/react.ts`
- Modify: `packages/compiler/src/codegen/vue.ts`
- Modify: `packages/compiler/src/codegen/svelte.ts`
- Modify: `packages/compiler/tests/codegen.test.ts`

Tasks:

- [x] Make class naming deterministic
- [x] Clarify how authored classes and generated scoped classes merge
- [x] Add more cases for nested selectors, media queries, and `:global(...)`
- [x] Decide whether Vue should use module styles or scoped styles long-term
- [x] Document the differences between React/Vue/Svelte CSS output

Definition of done:

- [x] CSS output is deterministic across repeated builds
- [x] Existing authored classes are preserved correctly

## 7. P2: Developer Experience

### [x] P2.1 Add end-to-end source maps

Why:

- `packages/vite-plugin-loom/src/index.ts` currently returns `map: null`
- Good runtime debugging is impossible without a sourcemap contract

Files:

- Modify: `packages/compiler/src/codegen/target.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/vite-plugin-loom/src/index.ts`

Tasks:

- [x] Extend `CompileResult` to include maps
- [x] Decide whether maps are generated in compiler, in plugin composition, or both
- [ ] Add tests or snapshots for representative mappings

Definition of done:

- [x] Browser/runtime stacks can be mapped back to `.loom`
- [x] Plugin no longer returns `map: null` for transformed modules

### [x] P2.2 Upgrade the language server from stub to useful baseline

Why:

- `packages/compiler/src/language-server.ts` now publishes diagnostics, but it still lacks useful hover/completion behavior beyond the preview baseline

Files:

- Modify: `packages/compiler/src/language-server.ts`
- Modify: `packages/compiler/src/folds.ts`
- Reuse: parser/validator APIs

Tasks:

- [x] Publish parse and validation diagnostics
- [x] Keep folding support
- [x] Add hover for nodes, attrs, modifiers, and zones
- [x] Add basic completions for zone markers and common HTML attrs
- [ ] Define a later path for `tsserver` proxy integration instead of faking it now

Definition of done:

- [x] Invalid Loom files show real editor diagnostics
- [x] Hover is more useful than raw block preview

### [x] P2.3 Replace the whitespace-only formatter

Why:

- `packages/compiler/src/formatter.ts` currently trims blank lines and trailing spaces only
- `packages/compiler/src/prettier-plugin.ts` is effectively a thin wrapper around that behavior

Files:

- Modify: `packages/compiler/src/formatter.ts`
- Modify: `packages/compiler/src/prettier-plugin.ts`
- Add tests for formatter behavior

Tasks:

- [x] Format zone headers consistently
- [x] Format indentation for markup and dimensions
- [x] Preserve intentional multiline TS/JS blocks safely
- [x] Decide whether CSS and logic zones are internally delegated to established formatters later

Definition of done:

- [x] Formatting a file is idempotent
- [x] Complex nested markup is normalized predictably

### [x] P2.4 Improve CLI ergonomics

Why:

- `loomc` exists, but it is still minimal

Files:

- Modify: `packages/compiler/src/cli.ts`

Tasks:

- [x] Add `--target` or align current flag naming consistently with package/docs language
- [x] Add file output mode instead of stdout-only compile
- [x] Add machine-readable diagnostics mode
- [ ] Add `--watch` only after the compile contract is stable

Definition of done:

- [x] CLI is useful for CI and local debugging, not just smoke testing

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

Alpha gate is green. Keep this deferred until `P2` lands so bundler work does not outrun source maps, formatter work, or editor ergonomics.

- [ ] Rollup plugin
- [ ] esbuild plugin
- [ ] webpack loader
- [ ] Rspack plugin

### [ ] P3.5 Implement `loom-llm` token-optimization tooling

See: `docs/architecture/loom-llm-spec.md`

Blocked until:

- [x] AST source spans are stable enough for structural targeting
- [ ] Formatter/printer work is good enough to support deterministic round trips

Why:

- Loom should reduce LLM token cost through projection and patching, not through a second source tree or a shorthand language
- The repo now has a concrete architecture spec for this work

Files:

- Create: `packages/loom-llm/src/index.ts`
- Create: `packages/loom-llm/src/cli.ts`
- Create: `packages/loom-llm/src/projector/*`
- Create: `packages/loom-llm/src/patch/*`
- Create: `packages/loom-llm/tests/*`
- Create: `packages/compiler/src/printer.ts`
- Create: `packages/compiler/src/blocks.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `packages/compiler/src/ast.ts`
- Modify: `packages/compiler/src/formatter.ts`

Tasks:

- [ ] Keep normal project files as the only source of truth
- [ ] Build an ephemeral `.loom-llm/` projection cache instead of a parallel codebase
- [ ] Start with `.loom` read-side support:
  - `loom-llm index`
  - `loom-llm show --mode outline`
  - `loom-llm show --mode edit`
- [ ] Expose compiler utilities for canonical printing, block extraction, and stable block ids
- [ ] Add structured patch ops with source-hash validation
- [ ] Add `loom-llm apply` and `loom-llm verify`
- [ ] Measure token savings for projection modes against raw source
- [ ] Keep the first implementation in TypeScript
- [ ] Only consider a Rust core after profiling proves it necessary

Definition of done:

- [ ] `packages/loom-llm` exists with working `index`, `show`, `apply`, and `verify` commands
- [ ] No second source tree is required
- [ ] No-op projection/apply round trips produce zero diff for representative `.loom` files
- [ ] Common single-component edits can be applied without full-file rewrites
- [ ] Token-savings measurements exist for representative components

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

- [x] `pnpm run verify` exists
- [x] All demo builds are green
- [x] Vite integration is tested

## 10. Documentation and Community

### [x] D0 README and install flow

Files:

- Create or expand root documentation

Tasks:

- [x] Explain what Loom is
- [x] Explain current support level honestly
- [x] Document how to run demos, tests, and builds
- [x] Show one minimal example per framework

### [x] D1 Syntax reference

- [x] Zones
- [x] markup
- [x] `:`
- [x] `::`
- [x] `@`
- [x] `if`
- [x] `each`
- [x] slots
- [x] polymorphic `element`

### [ ] D2 Playground / REPL

Blocked until compiler and Vite contracts are stable.

### [x] D3 Contribution guide

- [x] Explain package boundaries
- [x] Explain how to add a syntax feature safely
- [x] Explain required tests per change

## 11. Completed P0 + P1 Sequence

This is the work now completed to move the repo from red to a credible alpha baseline. The next major sequence starts in `P2`.

### [x] 1. Fix compiler typecheck layout

- Scope: `packages/compiler/tsconfig*.json`, `packages/compiler/package.json`
- Goal: make `pnpm --filter @loom-lang/compiler typecheck` green

### [x] 2. Add `vite-plugin-loom` tests

- Scope: `packages/vite-plugin-loom/tests/index.test.ts`
- Goal: stop shipping an untested plugin package

### [x] 3. Redesign Vite handoff for React

- Scope: `packages/vite-plugin-loom/src/index.ts`
- Goal: make `pnpm --filter react-demo build` green

### [x] 4. Redesign Vite handoff for Vue and Svelte

- Scope: `packages/vite-plugin-loom/src/index.ts`
- Goal: make `pnpm --filter vue-demo build` and `pnpm --filter svelte-demo build` green

### [x] 5. Add root `verify` script

- Scope: root `package.json`, optional helper script
- Goal: one green/red command for the whole workspace

### [x] 6. Add AST source spans

- Scope: `lexer.ts`, `parser.ts`, `ast.ts`
- Goal: unblock diagnostics and source maps

### [x] 7. Add validation pass and real diagnostics

- Scope: new `validate.ts`, CLI, language server
- Goal: actionable errors instead of generic failures

### [x] 8. Replace formatter placeholder

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

pnpm run verify
pnpm -r build
pnpm -r test
pnpm -r typecheck
```

## 14. Not Doing Yet

- [ ] No webpack/esbuild/rspack work before the Vite and source-map contracts are stable
- [ ] No advanced SSR story before source maps and formatter work are green
- [ ] No major syntax expansion before `P2` source maps, formatter, and editor-baseline work land
- [ ] No “magic” IDE experience before hover/completion behavior is real, not placeholder
- [ ] No Rust-first `loom-llm` implementation before the TypeScript reference version is measured
