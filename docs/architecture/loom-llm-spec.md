# loom-llm Spec (Caveman)

## Status: Proposed

## Core Concept
Projection-and-patch system. Reduce token use for agents. One source of truth (human code). Ephemeral LLM views (projections). Structured patch ops.

## Goals
- Cut LLM tokens for read/write.
- No big shorthand tables.
- Keep one source of truth.
- Narrow edits (not full-file rewrites).
- Reuse Loom compiler.
- Safe for agents.

## Architecture
- **Human source:** Autoritative. `.loom`, `.ts`, `.js`, `.css`, `.html`.
- **Indexer:** Hash source, extract blocks, build cache (`.loom-llm/`).
- **Projections:** Derived, token-optimized views.
  - `index`: Files, hashes, block ranges.
  - `outline`: Symbols, blocks, imports, token estimates.
  - `edit`: Canonical editable blocks.
- **Patch Ops:** `replace-block`, `insert-block-after`, `delete-block`, `replace-node`, etc.
- **Applier:** Check hash, apply patch to source, verify with compiler.

## Package: `packages/loom-llm`
```text
src/
  cli.ts
  indexer.ts
  projector/
    loom.ts, typescript.ts, css.ts
  patch/
    ops.ts, apply.ts, validate.ts
```

## CLI Commands
- `loom-llm index`: Refresh projection cache + hashes.
- `loom-llm show <path> --mode [index|outline|edit] --format [markdown|caveman|ultra]`: Render views.
- `loom-llm apply <path> --ops <file>`: Apply patches. Hash check required.
- `loom-llm verify`: Post-apply health check.

## Format: Caveman/Ultra
Strip labels. Use symbolic lines.
```txt
@src/Counter.loom
#Counter|m:outline|h:abc123
P:name,items|S:count|C:isBig
B:
 props:0|props|L1-3
 markup:0|markup|L8-17
T:
 div.card
  h1
  button
```

## Universal Agent Contract
1. Prefer `.loom` source for component changes.
2. `outline` before full edit context.
3. `edit` only for files that will change.
4. Prefer patch ops over full-file rewrites.
5. Replace single blocks when possible.
6. Raw source only if projection lacks fidelity.

## Phase Plan
- **P0:** Foundation. Canonical printer, block extraction in `packages/compiler`.
- **P1:** Read-side `loom-llm` for `.loom`. Index, show modes.
- **P2:** Write-side `loom-llm` for `.loom`. Patch ops, applier, hash checks.
- **P3:** Support TS, CSS, HTML.
- **P4:** Perf audit. Rust core if needed for hashing/indexing.
