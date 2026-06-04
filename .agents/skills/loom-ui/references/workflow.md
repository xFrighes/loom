# Loom Agent Workflow

## Mission Control: TODO.md
`TODO.md` at the root is the source of truth for task progress. Agents must:
1. **Read** `TODO.md` before starting any task.
2. **Update** markers as they work:
   - `[ ]` Pending
   - `[/]` In Progress
   - `[x]` Completed
   - `[!]` Blocked / Issue found

## The Verification Loop
Never assume a fix works because it "looks right." You MUST run the following:
- `bun run verify`: Full project health check (build, test, typecheck).
- `bun run build`: Rebuild all packages.
- `bun run test`: Run all workspace tests.

A task is not complete until `bun run verify` passes.

## Documentation
- `AGENTS.md`: Unified protocol for all AI tools.
- `REPOMAP.md`: Signature-level overview of the codebase.
- `docs/architecture/`: Detailed design specs.
