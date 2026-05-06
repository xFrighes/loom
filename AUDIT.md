# Repository Performance and Security Audit

## Executive Summary
This repository contains "Loom", a framework-agnostic UI language consisting of a Rust core parser/indexer, a TypeScript compiler, and several ecosystem tools including an LLM patch engine. Overall, the system has a strong defensive posture with robust path traversal mitigation, panic-free parsing in Rust, and safe default command execution in its VS Code plugin. 

However, two significant issues were discovered:
1. **Critical:** A weak regex-based HTML sanitizer in the TypeScript compiler exposes output targets to Cross-Site Scripting (XSS).
2. **High (Performance):** A synchronous, blocking filesystem traversal mechanism in the LLM tooling indexing fallback.

Addressing these two issues will significantly harden the compiler's output and improve the reliability of the tools.

## Repository Context
- **Core Engine:** Written in Rust (`packages/loom_core`), compiled to a Node.js module via N-API and WebAssembly. Handles tokenization, parsing, and AST generation.
- **Compiler:** Written in TypeScript (`packages/compiler`). Performs semantic validation and generates target code (React, Vue, Svelte).
- **Tooling:** `loom-llm` provides AI-driven patch integration and project indexing. `vscode-loom` provides IDE language support.
- **UI Primitives:** `packages/ui` provides headless UI components.
- **Entry Points:** CLI (`loomc`, `loom-llm`), VS Code extension, and bundler plugins (Vite, Rollup, Webpack, esbuild, rspack).

## Methodology
The codebase was audited systematically using a combination of targeted searches (`grep_search`), filesystem globbing, and manual source review (`read_file`).
- **Security Check:** Examined file system boundary enforcement (path traversal), command execution paths, HTML escaping/sanitization sinks, and Rust memory safety assertions (`unwrap`).
- **Performance Check:** Inspected Rust and TS algorithms for unbounded loops, blocking IO operations, and unoptimized repetitive allocations.

*Limitations:* The audit is based on static code analysis. External dependencies were analyzed based on manifests, but deeply nested transitive dependencies were not manually inspected. No live penetration testing was performed on generated targets.

## Files Inspected
**Core (Rust)**
- `packages/loom_core/src/parser.rs` (AST generation, loops)
- `packages/loom_core/src/lexer.rs` (Regex, indentation logic)
- `packages/loom_core/src/indexer.rs` (File reads)
- `packages/loom_core/src/expr.rs` (Top-level expressions, bracing checks)
- `packages/loom_core/src/lib.rs` (N-API/Wasm bindings, unwrap safety)
- `packages/loom_core/src/ast.rs` (Node definitions)

**Compiler & Tooling (TS/JS)**
- `packages/compiler/src/codegen/html.ts` (Sanitization)
- `packages/compiler/src/codegen/react.ts`, `vue.ts`, `svelte.ts` (HTML sinks)
- `packages/compiler/src/validate.ts` (Security validations)
- `packages/loom-llm/src/patch/apply.ts` (Patch generation)
- `packages/loom-llm/src/cli.ts` (Path handling, CLI commands)
- `packages/loom-llm/src/indexer.ts` (AST/Project indexing)
- `packages/vscode-loom/src/extension.ts` (Subprocess execution)
- `packages/ui/src/index.ts` (Headless primitives)
- `packages/loom-devtools/src/index.ts` (Global hook, postMessage)
- `packages/loomkit/src/index.ts` (Routing, param decoding)
- `packages/codemod/src/index.ts` (Migration logic, path handling)
- `packages/loom-tailwind/src/index.ts` (Tailwind extraction)
- `packages/create-loom-app/src/index.ts` (Scaffolding, normalization)
- `packages/vite-plugin-loom/src/index.ts` (Bundler integration)
- `.github/workflows/ci.yml` (CI/CD pipeline)

## Critical Findings

### [CRITICAL] Insecure Regex-Based HTML Sanitization
- **File(s):** `packages/compiler/src/codegen/html.ts`
- **Area:** Input validation / XSS
- **Evidence:** The `sanitizeStaticHtml` function relies on Regular Expressions (`/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi` and `/\s+on[a-z]+\s*=\s*/gi`) to remove scripts and event handlers.
- **Why it matters:** Regex-based HTML sanitizers are inherently flawed and trivial to bypass. The current implementation blocks `javascript:` protocols but misses `data:` URIs (e.g., `data:text/html;base64,...`) embedded in iframes, allows payload injection via `<object data="...">`, and fails to catch event handlers that are not prefixed by a space (e.g., `<svg/onload=alert(1)>`). When Loom compiles Markdown or HTML nodes to framework code, it relies on unsafe sinks (`dangerouslySetInnerHTML`, `v-html`, `{@html}`). An attacker who controls markdown or HTML blocks can achieve XSS.
- **Suggested fix:** Remove the custom regex implementation entirely. Integrate a proven, spec-compliant HTML sanitizer library (such as `DOMPurify` or `sanitize-html`) into the compiler pipeline before generating the AST output.
- **Confidence:** High

## Second-Pass Findings Not Covered in Initial Audit

### [MEDIUM] Information Exposure via Insecure postMessage Origin
- **File(s):** `packages/loom-devtools/src/index.ts`
- **Area:** Security / DevTools
- **Evidence:** The `emit` function in `installLoomDevtoolsHook` uses `target.postMessage?.({ source: 'loom-devtools-hook', event }, '*')`.
- **Why it was missed or not covered before:** The initial audit focused on the compiler and LLM path handling, missing the DevTools broadcast mechanism.
- **Why it matters:** Using the wildcard `'*'` as the target origin allows any script on the same page (including malicious ones in different origins/iframes) to listen for and capture DevTools events. These events contain the entire component state and metadata. If a developer uses Loom to build a page that also includes third-party scripts or advertisements, those scripts could harvest sensitive user data stored in the component state.
- **Suggested fix:** Allow developers to configure a safe `targetOrigin` for the DevTools hook, defaulting to `window.location.origin` if available, rather than using the wildcard.
- **Confidence:** High

### [LOW] Weak Security Validation Regex Bypasses
- **File(s):** `packages/compiler/src/validate.ts`
- **Area:** Security / Input Validation
- **Evidence:** 
    1. `/\b(eval|Function)\s*\(/.test(source)` is used to check for dynamic code execution.
    2. `/javascript:/i.test(value)` is used to check for dangerous URLs in `href` and `src`.
- **Why it was missed or not covered before:** These were likely seen as "best effort" checks, but they provide a false sense of security.
- **Why it matters:** The `eval` check is trivial to bypass using comments (e.g., `eval /* ... */ (code)`) or template literals. The URL check only covers `javascript:`, missing other dangerous schemes like `data:` or `vbscript:`. While the compiler *should* sanitize the output, the validator should also be robust to provide early warnings.
- **Suggested fix:** Use a proper AST-based analysis (via the Rust core or a TS parser) to identify `eval` calls. For URL validation, use a allowlist of safe protocols (e.g., `http:`, `https:`, `mailto:`, `tel:`, `#`).
- **Confidence:** High

### [LOW] Unsanitized URL Parameter Decoding
- **File(s):** `packages/loomkit/src/index.ts`
- **Area:** Security / Routing
- **Evidence:** `decodePart` uses `decodeURIComponent(part)` and returns the result directly to `params`.
- **Why it was missed or not covered before:** LoomKit was not previously inspected.
- **Why it matters:** Decoded URL parameters are often used directly in UI components. If a developer renders a dynamic route parameter like `[id]` into an unsafe sink (which is already a known risk in the compiler), this provides an easy injection point for attackers to pass encoded XSS payloads that bypass initial request filters but execute in the browser.
- **Suggested fix:** Ensure that parameters returned by `matchRoute` are treated as untrusted and either sanitize them at the routing layer or reinforce the compiler's sanitization of all dynamic expressions.
- **Confidence:** Medium

### [LOW] Potential Path Traversal in Codemod
- **File(s):** `packages/codemod/src/index.ts`
- **Area:** Security / File System
- **Evidence:** `loadFirstComponent(options.sourcePath)` calls `project.addSourceFileAtPath(sourcePath)` without validating that `sourcePath` is within an expected directory.
- **Why it was missed or not covered before:** Codemod package was not previously inspected.
- **Why it matters:** While codemod is a developer tool, misconfigured automation or malicious input could cause it to read sensitive files (e.g., `.env`, `~/.ssh/id_rsa`) if it's exposed via a web interface or a CI pipeline that accepts external paths.
- **Suggested fix:** Implement a `resolvePath` check similar to the one in `packages/loom-llm/src/cli.ts` to ensure the tool only operates on files within the intended workspace.
- **Confidence:** Medium

## Performance Findings

### [HIGH] Blocking Synchronous File System Hashing
- **File(s):** `packages/loom-llm/src/indexer.ts`
- **Area:** Build/runtime
- **Evidence:** If the native Rust module fallback (`tryRustIndexWorkspace`) is unavailable, `indexWorkspace` delegates to `walkForLoomFiles`. This function recursively walks the directory synchronously (`readdirSync`, `lstatSync`), followed by a synchronous loop over all discovered files that hashes (`hashText`) and reads them (`readFileSync`).
- **Why it matters:** While the Rust fast-path mitigates this on supported platforms, the TS implementation will severely block the Node.js event loop on unsupported platforms. For large mono-repos, this synchronous work will hang language servers and build tasks.
- **Suggested fix:** Refactor the fallback implementation to use `node:fs/promises`. Process file reads and hashes concurrently using `Promise.all()` to unblock the main thread.
- **Confidence:** High

## Security Findings

*All relevant findings have been grouped into Critical/High tiers above. Additional checks yielded positive results:*
- **Auth/Access Control:** N/A (Compiler framework)
- **Path Traversal:** Handled robustly in `loom-llm` via `resolveInputPath` which successfully prevents absolute path escapes and relative `../` traversal.
- **Command Injection:** Safely handled. `packages/vscode-loom` executes the compiler using `execFile`, which bypasses shell interpretation, securing the system against command injection even if file paths contain shell metacharacters.
- **Memory Safety:** The Rust core uses `.unwrap()` safely. Verification confirmed `indent_stack.last().unwrap()` in the lexer and dimension parsing in the AST cannot panic due to structural guarantees.

## Dependency and Configuration Review
- **Rust dependencies** (`Cargo.toml`) use established crates (`serde`, `napi`, `rayon`) without deprecated or notoriously vulnerable features enabled.
- **TS dependencies** (`package.json`) rely strictly on standard build tooling. No obvious supply-chain red flags or suspicious run-time packages are present in the core repository configs.

## Test and Verification Results
- **Searches (`grep_search`):** Checked for `eval`, `exec`, `spawn`, `unwrap`, `fs::read` across the repository.
- **Validation:** Found instances of `dangerouslySetInnerHTML` and `v-html` which led to the discovery of the custom HTML sanitizer logic. Verified `execFile` usage to ensure no shell injection exists.
- **Rust Audit:** Manually reviewed loop structures in `packages/loom_core/src/parser.rs` and unwrap safety in `lexer.rs` and `expr.rs`. No memory leaks or infinite loop risks detected.

## Recommended Fix Plan
1. **Immediate fixes:** Replace `sanitizeStaticHtml` in `packages/compiler/src/codegen/html.ts` with `DOMPurify` to seal the XSS vector across all target frameworks.
2. **Short-term hardening:** 
    - Update `packages/loom-llm/src/indexer.ts` to utilize asynchronous file operations for its TS fallback path to avoid locking the Node.js event loop.
    - Restrict `postMessage` origin in `packages/loom-devtools/src/index.ts` to `window.location.origin`.
3. **Medium-term improvements:** 
    - Expand compiler diagnostics in `packages/compiler/src/validate.ts` to warn users dynamically if `DOMPurify` encounters and scrubs dangerous payloads.
    - Replace regex-based `eval` and URL validation in `validate.ts` with AST-based checks and protocol allowlists.
    - Implement workspace boundary validation in `packages/codemod/src/index.ts`.
4. **Optional cleanup:** Refactor the custom dimension parser loops in `parser.rs` to rely on robust iterator chains rather than manual mutable loops, improving readability and mitigating future infinite-loop risks.

## Open Questions / Needs Manual Verification
- **DevTools Production Usage:** Verify if `loom-devtools` is automatically stripped from production builds. If it persists, the `postMessage` risk is elevated to High.
- **Indexer Scalability:** Determine how large target user repositories will be. If user repositories approach tens of thousands of files, even the Rust `rayon` threading might consume excessive memory. Benchmarking the Rust indexer under stress conditions is recommended.
- **LoomKit Sanitization:** Audit how LoomKit users typically consume route parameters to determine if a centralized sanitization layer in `matchRoute` is feasible without breaking legitimate use cases.
