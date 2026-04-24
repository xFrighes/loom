# TODO.md Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining actionable `TODO.md` work, validate it end to end, and rewrite `TODO.md` so it tracks real current work instead of stale or deferred roadmap items.

**Architecture:** Keep the compiler as the shared core, add missing DX coverage where the repo is already functionally close, and add small dedicated ecosystem packages only where the TODO explicitly calls for them. Avoid speculative language work or bundler sprawl; convert those into explicit backlog/deferred sections rather than pretending they are current implementation tasks.

**Tech Stack:** TypeScript, Vitest, tsup, Vite, ESLint, workspace packages.

---

### Task 1: Close the source-map gap

**Files:**

- Modify: `packages/vite-plugin-loom/src/index.ts`
- Create: `packages/vite-plugin-loom/src/sourcemap.ts`
- Modify: `packages/vite-plugin-loom/tests/index.test.ts`

**Steps:**

1. Add a small source-map composition helper so React Vite output maps back to `.loom`, not intermediate TSX.
2. Add explicit tests for React/Vue/Svelte virtual module maps.
3. Run: `pnpm --filter vite-plugin-loom test`

### Task 2: Document the editor/tsserver follow-up path

**Files:**

- Modify: `docs/CONTRIBUTING.md`
- Modify: `packages/compiler/src/language-server.ts`

**Steps:**

1. Add a short maintainer-facing roadmap section defining the future `tsserver` bridge through virtual logic-zone documents.
2. Keep the current language server explicit about scope so it does not imply fake TypeScript intelligence.

### Task 3: Add Loom testing helpers

**Files:**

- Create: `packages/loom-testing/package.json`
- Create: `packages/loom-testing/tsconfig.json`
- Create: `packages/loom-testing/src/index.ts`
- Create: `packages/loom-testing/tests/index.test.ts`
- Modify: `README.md`
- Modify: `docs/CONTRIBUTING.md`
- Modify: `scripts/verify.mjs`

**Steps:**

1. Ship both a transform helper and a small Vitest-oriented assertion helper.
2. Add one representative example per framework in tests.
3. Run: `pnpm --filter @loom-lang/testing test`

### Task 4: Add Tailwind extraction support

**Files:**

- Create: `packages/loom-tailwind/package.json`
- Create: `packages/loom-tailwind/tsconfig.json`
- Create: `packages/loom-tailwind/src/index.ts`
- Create: `packages/loom-tailwind/tests/index.test.ts`
- Modify: `README.md`
- Modify: `docs/CONTRIBUTING.md`
- Modify: `scripts/verify.mjs`

**Steps:**

1. Implement static class extraction from shorthand classes and static `class` attrs.
2. Explicitly leave dynamic expressions out of extracted output while returning them as metadata for future tooling.
3. Run: `pnpm --filter @loom-lang/tailwind test`

### Task 5: Add ESLint integration

**Files:**

- Create: `packages/eslint-plugin-loom/package.json`
- Create: `packages/eslint-plugin-loom/tsconfig.json`
- Create: `packages/eslint-plugin-loom/src/index.ts`
- Create: `packages/eslint-plugin-loom/tests/index.test.ts`
- Modify: `README.md`
- Modify: `docs/CONTRIBUTING.md`
- Modify: `scripts/verify.mjs`

**Steps:**

1. Start with an ESLint processor, not Loom-specific rules.
2. Surface compiler diagnostics as ESLint messages mapped to `.loom` source spans.
3. Run: `pnpm --filter eslint-plugin-loom test`

### Task 6: Tighten loom-llm coverage to match TODO definitions

**Files:**

- Modify: `packages/loom-llm/tests/index.test.ts`
- Modify: `README.md`

**Steps:**

1. Add tests for no-op round trips and token-savings measurement outputs.
2. Confirm the projection cache remains disposable and source files stay canonical.
3. Run: `pnpm --filter @loom-lang/loom-llm test`

### Task 7: Rewrite TODO.md to separate done work from backlog

**Files:**

- Modify: `TODO.md`

**Steps:**

1. Mark completed implementation items accurately.
2. Convert future/deferred sections into backlog language rather than pretending they are current ship blockers.
3. Keep “not doing yet” as guardrails, not open completion tasks.

### Task 8: Full validation

**Files:**

- None

**Steps:**

1. Run targeted package tests/typechecks as each task lands.
2. Run: `pnpm run verify`
3. Only then report completion.
