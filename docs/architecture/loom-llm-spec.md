# loom-llm Specification

## Status
Proposed

## Summary
`loom-llm` is a new Loom workspace package whose job is to reduce LLM token usage without turning the repo into a second language or a dual-source system.

The recommended architecture is:

1. Keep the human-readable codebase as the only source of truth.
2. Generate an ephemeral LLM-optimized projection of selected files on demand.
3. Let the LLM read the projection and submit structured patch operations instead of rewriting whole files.
4. Apply patches back to the human source, then verify with the existing compiler and tests.

This is better than:

- A global shorthand syntax table for CSS/TS/HTML
- Converting the whole repo into an LLM-only codebase and then converting it back
- Maintaining parallel human and LLM codebases in continuous sync

## Problem
Loom already helps with verbosity by collapsing component structure into a compact DSL, but LLM token waste still comes from four places:

1. Loading too much irrelevant source just to answer a local question
2. Re-reading full files when only one block changed
3. Forcing the model to work in verbose surface syntax instead of structural views
4. Rewriting entire files instead of expressing narrow edits

The naive solution is to invent a shorter syntax or a mapping table. That is not the right default.

Why not:

- Arbitrary shorthand saves characters, but it adds a translation burden to the model
- The model must either memorize or repeatedly receive the mapping table
- The shorter the syntax gets, the harder it becomes to reason about correctness
- Human review quality drops when the working format stops looking like the source of truth

The other naive solution is a parallel LLM codebase. That is worse.

Why not:

- Two source trees create sync bugs, merge ambiguity, and broken editor/tooling assumptions
- Debugging becomes harder because stack traces and diffs point at the human tree while the model edits another one
- Round-trip fidelity becomes the real problem instead of the user task

## Goals
- Aggressively reduce tokens needed for LLM read and write workflows in Loom projects
- Avoid any requirement for large shorthand mapping tables
- Preserve one human-readable source of truth
- Make edits narrower than full-file rewrites whenever possible
- Reuse Loom compiler structures instead of building a separate parsing universe
- Be safe enough that an agent can use it by default

## Non-Goals
- Creating a new public authoring language that humans are expected to learn
- Replacing `.loom` with an opaque machine dialect
- Making Rust a hard dependency in phase 1
- Solving arbitrary language transformation for every file type on day one
- Hiding source code from humans behind a proprietary intermediate format

## Decision
Build `loom-llm` as a projection-and-patch system, not as a shorthand language and not as a dual-codebase sync engine.

## Architecture Decision Record

### Context
- Loom already has a compiler package with parse, analyze, validate, and compile entry points
- Loom already has a CLI and a Vite plugin
- The current formatter is intentionally minimal, so reversible edits cannot depend on formatting alone
- The current AST is strong enough for structural Loom edits, but TypeScript bodies and behavior bodies are still stored as raw strings

### Options Considered

| Option | Pros | Cons | Complexity | Verdict |
|---|---|---|---|---|
| Global shorthand syntax for CSS/TS/HTML | Small apparent token savings | Requires repeated mapping context, hurts readability, brittle for reasoning | Medium | Reject |
| Full repo conversion to LLM-friendly source, then convert back | Maximum surface compression | Very hard to make lossless, formatter-sensitive, large blast radius | High | Reject as default |
| Parallel human and LLM codebases | Lets each side have its own representation | Continuous sync is fragile, creates drift and debugging pain | Very High | Reject |
| Ephemeral projection plus structured patching | Keeps one source of truth, narrow edits, token savings from retrieval and patch size | Requires projection format and applier design | Medium | Choose |

### Decision
Adopt an ephemeral LLM projection layer with a structured patch protocol.

### Rationale
1. The largest token savings come from reading less and writing narrower diffs, not from inventing unreadable abbreviations.
2. Loom already has an AST and compiler boundary that can anchor a projection system.
3. A projection can be regenerated at any time, so it does not become a second source of truth.
4. Structured patching lets the model express intent with fewer tokens than full-file rewrites.

### Trade-offs Accepted
- Phase 1 will be more conservative than a full source rewrite system
- Some edits will remain block-level until Loom exposes richer printers and inner-language parsers
- There is upfront design work around stable block ids, cache invalidation, and patch application

### Revisit Trigger
Revisit this decision only if:

- Projection output still fails to produce meaningful token savings in practice
- Agents consistently need full-file round trips rather than block-level edits
- Performance profiling proves a native core is necessary

## Recommended Package Layout

### New package
`packages/loom-llm`

Responsibilities:

- Build and cache LLM projections
- Render token-efficient read views
- Accept and apply structured edits
- Estimate token cost for alternative views
- Expose a CLI for agents and humans

Suggested layout:

```text
packages/loom-llm/
  src/
    cli.ts
    index.ts
    indexer.ts
    cache.ts
    tokens.ts
    projector/
      loom.ts
      typescript.ts
      css.ts
      html.ts
    patch/
      ops.ts
      apply.ts
      validate.ts
  tests/
```

### Compiler additions
`packages/compiler` should expose a few new utilities that `loom-llm` reuses instead of duplicating:

- `printer.ts`
  - A real canonical printer for `.loom`
- `blocks.ts`
  - Block extraction for `props`, `logic`, `markup`, and style/behavior subtrees
- Stable ids or stable paths for AST nodes
- Span preservation good enough to map projections back to source

Phase 1 should treat TypeScript and behavior bodies as opaque block text because the current AST stores them as raw strings.

## High-Level Architecture

```text
human source files
  -> loom-llm indexer
  -> file hashes + structural metadata
  -> projection cache (.loom-llm/)
  -> LLM reads outline/edit view
  -> LLM emits patch ops
  -> loom-llm applier updates human source
  -> loom compiler / tests verify correctness
```

## Core Concepts

### 1. Source of truth
Only the normal project files are authoritative:

- `.loom`
- `.ts` / `.tsx`
- `.js` / `.jsx`
- `.css`
- `.html`

The `.loom-llm/` directory is disposable cache, never source.

### 2. Projection
A projection is a derived, token-optimized view of a file or component. It is not meant to be committed or edited by humans.

There should be two primary projection modes:

- `outline`
  - For navigation and understanding
  - Shows symbols, blocks, node tree, imports, diagnostics, and token estimates
- `edit`
  - For actual change work
  - Shows only the blocks needed to edit the file, in a canonical, stable layout

### 3. Patch ops
The LLM should usually emit patch operations instead of full file bodies.

Example operation categories:

- `replace-block`
- `insert-block-after`
- `delete-block`
- `replace-node`
- `insert-child`
- `delete-node`
- `replace-style-rule`
- `replace-raw-range`

`replace-raw-range` exists as an escape hatch for zones that are not yet structurally parsed.

## Projection Format

The internal cache format should be JSON. The LLM-facing format should be Markdown rendered from that JSON.

Reason:

- JSON is easier to validate and diff internally
- Markdown is cheaper and more model-friendly than dumping raw JSON into context

### Internal projection shape

```json
{
  "version": 1,
  "sourcePath": "src/Button.loom",
  "sourceHash": "sha256:...",
  "language": "loom",
  "componentName": "Button",
  "diagnostics": [],
  "blocks": [
    {
      "id": "logic:0",
      "kind": "logic",
      "span": { "start": 12, "end": 88 },
      "summary": "imports useState, defines count state",
      "content": "import { useState } from 'react'..."
    }
  ],
  "symbols": {
    "imports": ["useState"],
    "props": [],
    "elements": ["button"]
  }
}
```

### LLM-facing `edit` view

```md
# File: src/Button.loom
Component: Button
Mode: edit

## Blocks
[logic:0]
import { useState } from 'react'
const [count, setCount] = useState(0)

[markup:0]
button
  @click
    setCount(count + 1)
  Count: {count}
```

This is intentionally descriptive, not cryptic. Token savings come from not sending the rest of the file and not forcing full-file rewrites.

## CLI

`loom-llm` should ship as its own binary first.

Long-term, `loomc llm ...` aliases can be added if that proves useful.

### Commands

#### `loom-llm index`
Build or refresh the projection cache.

Example:

```bash
loom-llm index
loom-llm index src/components/Button.loom
```

Behavior:

- Hash source files
- Rebuild only stale projections
- Record token estimates for `source`, `outline`, and `edit` modes

#### `loom-llm show <path>`
Render an LLM-facing view.

Example:

```bash
loom-llm show src/components/Button.loom --mode outline
loom-llm show src/components/Button.loom --mode edit
```

Behavior:

- `outline` returns structure and summaries only
- `edit` returns only canonical editable blocks
- `--blocks logic:0,markup:0` can narrow context further

#### `loom-llm apply <path>`
Apply patch ops back to source.

Example:

```bash
loom-llm apply src/components/Button.loom --ops /tmp/button.ops.json
```

Behavior:

- Validate the source hash before applying
- Reject stale patches unless `--force` is explicitly passed
- Run Loom formatting/printer pass after patching

#### `loom-llm diff <path>`
Show how a patch or regenerated projection differs from source.

#### `loom-llm verify`
Run the minimal validation contract after apply.

Initial contract:

- parse/analyze for `.loom`
- compiler health for touched `.loom` files

Long-term:

- package tests or typechecks for impacted areas

## Universal LLM Contract

This is the small universal rule set the agent should follow. It replaces the idea of a giant mapping table.

1. Prefer `.loom` source, not generated React/Vue/Svelte output, when changing component behavior or structure.
2. Ask for `outline` before opening full editable content.
3. Ask for `edit` only for files that will actually change.
4. Prefer patch ops over full-file rewrites.
5. If a change only touches one block, only replace that block.
6. Fall back to raw source only when the projection lacks required fidelity.

This is the right kind of universal rule because it changes workflow, not language semantics.

## Why This Beats a Shorthand Language

The plugin should optimize for:

- less context
- narrower edits
- deterministic views
- stronger tooling

It should not optimize for:

- making every token shorter at the cost of reasoning quality

A shorthand language creates hidden token costs:

- mapping instructions
- decoding effort
- review overhead
- more mistakes during generation

Projection plus patching avoids those costs.

## Why This Beats Full Codebase Conversion

A lossless whole-repo conversion engine is tempting, but it should not be the base architecture.

Problems:

- Requires a real reversible printer for every supported syntax
- Any formatting drift looks like a semantic change in diffs
- Makes normal developer tooling harder to trust
- Forces every edit through a heavyweight conversion cycle

What to borrow from that idea:

- The projection cache is still an ephemeral alternative representation
- The important difference is that it is disposable and narrow, not a second working tree

## Why This Beats Parallel Codebases

Parallel codebases should be treated as a last resort, not a design goal.

Problems:

- Sync bugs become inevitable
- Humans review one tree while LLMs edit another
- Merge conflict resolution gets ambiguous
- Local tooling must understand both trees or pick a favorite

A cache projection plus source-hash-checked patch application gives most of the upside without permanent divergence.

## Scope by File Type

### Phase 1: `.loom` only
This is where Loom has the strongest structural advantage today.

Supported:

- component outline projection
- block-level edit projection
- structural markup edits
- block replacement for logic/style/behavior

### Phase 2: companion TS/CSS/HTML files
Add projections for adjacent files that agents often need, but keep the patch system conservative.

Suggested parsers:

- TypeScript: SWC or TypeScript compiler API
- CSS: Lightning CSS or PostCSS
- HTML: parse5

### Phase 3: mixed-file edit sessions
Let the projection engine emit cross-file edit bundles for a Loom component plus its closely related support files.

## Performance and Rust

Rust is reasonable as a future accelerator, but it should not be the first implementation choice.

Reason:

- Rust does not directly solve token usage
- Rust only helps if indexing/projection becomes a runtime bottleneck
- The current repo is TypeScript-first, so a TS reference implementation will validate the architecture faster

Recommended path:

1. Ship the first version in TypeScript
2. Measure projection build time, cache hit rates, and apply latency
3. Only then decide whether to move hashing, indexing, or projection rendering into a Rust core

If native acceleration becomes necessary, use a narrow core:

- hashing
- token estimation
- projection serialization
- cache diffing

Do not move policy and workflow logic into Rust unless profiling proves it necessary.

## Required Prerequisites

The current repo state implies a few prerequisites before `loom-llm` can be trusted for write workflows:

1. A real Loom printer
   - The current formatter only trims whitespace
2. Stable block extraction
   - `props`, `logic`, `markup`, styles, behaviors
3. Better round-trip tests
   - parse -> project -> apply -> print must be deterministic
4. Stable spans and node identity
   - patch ops need durable targets

Without these, read-only projections are still valuable, but write-time projection must stay conservative.

## Testing Strategy

### Projection tests
- Golden tests for `outline` and `edit` views
- Token estimate tests against representative files

### Round-trip tests
- source -> projection -> patch -> source
- compile result before and after no-op patch must match

### Drift tests
- Reject patches whose source hash no longer matches
- Regenerate projections after direct human edits

### Integration tests
- Agent-style workflow on sample Loom components
- Narrow change requests should not require full-file rewrite

## Success Metrics

The plugin is successful when all of the following are true:

1. LLM workflows open fewer full files per task
2. Common edits can be expressed as patch ops instead of full-file rewrites
3. No second source tree is required
4. Human-readable source remains reviewable and stable
5. Projection generation is fast enough to be used by default

Suggested measurable targets for the first stable milestone:

- `outline` view costs materially fewer tokens than raw source for representative components
- At least the common single-component edit path works without full-file rewrite
- No-op projection/apply round-trips produce zero source diff

## Initial Implementation Plan

### Phase 0
Foundation inside `packages/compiler`

- Add canonical printer
- Add block extraction utilities
- Add stable block ids

### Phase 1
Read-side `loom-llm` for `.loom`

- `index`
- `show --mode outline`
- `show --mode edit`
- cache manifest

### Phase 2
Write-side `loom-llm` for `.loom`

- patch op schema
- patch validator
- patch applier
- hash checking
- verification command

### Phase 3
Companion file support

- TS
- CSS
- HTML

### Phase 4
Optimization pass

- benchmark token savings
- benchmark latency
- decide whether a Rust core is justified

## Final Recommendation

The best architecture for `loom-llm` is not a new shorthand language and not a synchronized second codebase.

It is:

- one human source of truth
- one ephemeral LLM projection cache
- one structured patch protocol

That gives Loom the real token savings that matter:

- less context loaded
- less boilerplate repeated
- less full-file rewriting
- less prompt overhead

And it does so without making the project harder for humans to understand, review, or maintain.
