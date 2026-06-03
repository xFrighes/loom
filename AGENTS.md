# 🤖 Loom Agentic Orchestration

This document defines the unified protocols for AI agents (Gemini CLI, Claude Code, Cursor, Windsurf, etc.) working on the Loom project.

## 🧭 Navigation
- **Repository Map:** Refer to `REPOMAP.md` for signature-level awareness of all monorepo packages and exports.
- **Task Tracking:** `TODO.md` is the "Mission Control". Use the defined status markers (`[ ]`, `[/]`, `[x]`, `[!]`) to track progress.
- **Architectural Specs:** Read `docs/architecture/` before implementing complex features. Many specs are compressed for token efficiency.

## 📜 Agent-Specific Instructions
- **Gemini CLI:** Follow rules in `GEMINI.md`.
- **Claude Code:** Follow rules in `CLAUDE.md`.
- **Cursor/Windsurf:** Follow rules in `.cursorrules`.

## 🏗️ Monorepo Boundary Rules
1. **Parser-First:** `packages/loom_core` (Rust) is the source of truth for the language grammar.
2. **Compiler-Second:** `packages/compiler` (TypeScript) handles AST manipulation and multi-target codegen.
3. **Cross-Package Changes:** If you change a core AST node in `loom_core`, you MUST update the `compiler` package to handle the new node.

## 🛡️ Verification Protocol
Before submitting any change or marking a task as `[x]` done:
1. Run `bun run verify`.
2. Ensure `REPOMAP.md` is updated (automatic during verify).
3. Verify that the change adheres to the "Loom Way" (Declarative zones, Dimension-driven UI).

## 🎨 Style Mandates
- **Strict Typing:** No `any`. Use interfaces for public APIs.
- **Deterministic Codegen:** Use the canonical printer in `packages/compiler/src/printer/`.
- **Zero-Runtime:** Loom components must compile to standard framework code with no heavy runtime dependencies.
