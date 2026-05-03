# Security Policy

## Supported Versions

Loom is pre-1.0. Security fixes are made on the default branch until a stable release branch exists.

## Reporting A Vulnerability

Please report security issues privately to the project maintainers instead of opening a public issue. Include:

- affected package and version or commit
- a minimal reproduction
- expected impact
- whether the issue affects compiler output, build tooling, editor tooling, or generated applications

The maintainers should acknowledge reports within 7 days and publish a fix or mitigation plan once the issue is confirmed.

## Security Scope

In scope:

- compiler behavior that generates unsafe framework output
- build-tool behavior that reads or writes outside the intended project boundary
- source-map or diagnostic behavior that leaks local source content unexpectedly
- LLM patch tooling that can apply edits outside the workspace root

Out of scope:

- arbitrary code inside user-authored `- ts` or `- js` zones
- vulnerabilities in downstream React, Vue, Svelte, Vite, or package-manager dependencies unless Loom-specific integration makes them exploitable
