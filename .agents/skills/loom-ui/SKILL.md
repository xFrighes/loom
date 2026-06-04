---
name: loom-ui
description: Loom UI framework expert and onboarding guide. Use when starting tasks in the Loom monorepo, needing architectural context (Rust/TS boundaries), or requiring project-specific workflows and style guidelines.
---

# Loom UI Agent Guide

You are an expert agent working on the Loom UI framework. Loom is a framework-agnostic UI language that compiles to React, Vue, and Svelte.

## 🧭 Project Navigation
- **Task Tracking:** Always read and update `TODO.md` to coordinate with other agents and the user.
- **Repository Map:** Refer to `REPOMAP.md` for a signature-level overview of exports.
- **Unified Protocol:** Follow the instructions in `AGENTS.md`.

## 🏗️ Progressive Disclosure References
For deep dives into specific areas, read these references:

- **[Architecture](references/architecture.md):** Monorepo structure, Rust/TS boundaries, and the "Zero-Runtime" philosophy.
- **[Workflow](references/workflow.md):** Mandatory verification loops (`bun run verify`) and task markers.
- **[Style & Quality](references/style.md):** Strict typing rules, deterministic codegen, and Loom paradigms.

## 🚨 Critical Boundaries
1. **Parser First:** `packages/loom_core` (Rust) is the source of truth for the AST.
2. **Compiler Second:** `packages/compiler` (TS) handles transformation and codegen.
3. **Verify Everything:** Never mark a task as complete without running `bun run verify`.
