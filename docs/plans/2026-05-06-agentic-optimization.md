# Implementation Plan: Agentic Coding Optimization

Optimize the Loom repository for maximum efficiency with AI coding agents (Gemini CLI, Claude Code, Cursor, Windsurf, etc.).

## 1. Unified Instruction Files
Create standard instruction files that agents look for to understand project rules, style, and scripts.
- [x] Create `GEMINI.md`: Root instructions for Gemini CLI.
- [x] Create `CLAUDE.md`: Root instructions for Claude Code.
- [x] Create `.cursorrules`: Rules for Cursor/Windsurf.
- [x] Create `.geminiignore`: Explicitly ignore large build artifacts or distracting files to keep `glob` results clean.

## 2. Token-Efficient Documentation
Compress large architectural specs into a terse, machine-readable format.
- [x] Compress `docs/architecture/loom-llm-spec.md` using the "Caveman" protocol.
- [x] Ensure all new specs in `docs/architecture/` follow a structured, low-token format (Pipe-tables for state/transitions).

## 3. Standardized Validation & Tooling
Ensure agents have a single, reliable way to verify changes.
- [x] Update `package.json` to ensure `pnpm run verify` is the definitive health check.
- [x] Add `loom-llm` shortcuts if applicable to help agents use the "projection-and-patch" workflow.

## 4. Agentic Task Tracking
Refine `TODO.md` to be the "Mission Control" for agents.
- [x] Standardize `TODO.md` with status markers (`[ ]`, `[/]`, `[x]`, `[!]`) that agents can easily grep.

## 5. Sub-directory Specialization
- [x] Create `packages/compiler/GEMINI.md`: Specific rules for the TS/Rust boundary.
- [x] Create `packages/loom_core/GEMINI.md`: Rules for Rust-based parsing.

---

## Verification
- Run `pnpm run verify` to ensure no files were broken.
- Ask Gemini CLI to "Check drift" to verify the new `GEMINI.md` instructions are picked up.
