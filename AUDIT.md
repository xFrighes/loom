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
- **Why it matters:** Regex-based HTML sanitizers are inherently flawed and trivial to bypass. 
    1. **Event Handler Bypass:** The regex `/\s+on[a-z]+\s*=\s*/gi` requires a leading space. In many browsers, a forward slash can act as a delimiter (e.g., `<img/onload=alert(1)>`), bypassing the filter.
    2. **Incomplete Attribute List:** The sanitizer only checks `href`, `src`, and `xlink:href`. It misses other dangerous attributes that can execute JavaScript, such as `formaction`, `data` (for `<object>`), `poster` (for `<video>`), and `background`.
    3. **Embedded Payloads:** It blocks `javascript:` protocols but misses `data:` URIs (e.g., `data:text/html;base64,...`) embedded in iframes, which can lead to XSS in a different origin or bypass filters if the base64 content is executed.
    4. **Unsafe Sinks:** When Loom compiles Markdown or HTML nodes to framework code, it relies on unsafe sinks (`dangerouslySetInnerHTML`, `v-html`, `{@html}`). An attacker who controls markdown or HTML blocks can achieve XSS.
- **Suggested fix:** Remove the custom regex implementation entirely. Integrate a proven, spec-compliant HTML sanitizer library (such as `DOMPurify` or `sanitize-html`) into the compiler pipeline before generating the AST output.
- **Confidence:** High

## Second-Pass Findings Not Covered in Initial Audit

### [MEDIUM] Universal Cross-Site Scripting (XSS) via Unsafe Sinks
- **File(s):** `packages/compiler/src/codegen/react.ts`, `vue.ts`, `svelte.ts`, `markdown.ts`
- **Area:** Security / Codegen
- **Evidence:** 
    - React uses `dangerouslySetInnerHTML` in `renderText` and `renderMarkdownElement`.
    - Vue uses `v-html` in the same locations.
    - Svelte uses `{@html}`.
    - All frameworks delegate to `sanitizeStaticHtml` which is already confirmed as weak.
- **Why it was missed or not covered before:** The initial audit identified the weak sanitizer in `html.ts` but did not explicitly link it to the universal usage across all framework targets and Markdown rendering.
- **Why it matters:** An attacker who can influence the content of a `.loom` file (e.g., via a CMS, user-generated content, or a malicious dependency) can execute arbitrary JavaScript in the user's browser across any target framework supported by Loom.
- **Suggested fix:** Implement a centralized, robust sanitization layer that is mandatory for all unsafe sinks. Replace `sanitizeStaticHtml` with a battle-tested library like `DOMPurify`.
- **Confidence:** High

### [MEDIUM] Logic Injection in React Bindings
- **File(s):** `packages/compiler/src/codegen/react.ts`
- **Area:** Security / Codegen
- **Evidence:** In `renderDataAttr` for `bind` attributes:
  ```typescript
  const onChange = setter
    ? `onChange={(e: React.ChangeEvent<HTMLInputElement>) => ${setter}(e.target.value)}`
    : `onChange={(e: React.ChangeEvent<HTMLInputElement>) => { ${attr.expr} = e.target.value }}`
  ```
- **Why it was missed or not covered before:** The first pass focused on HTML sinks and path traversal, missing the logic generation for two-way bindings.
- **Why it matters:** If `attr.expr` is not a known state variable, it is injected directly into a template string. An attacker providing a malicious `.loom` file could use an expression like `x; alert(1); y` to escape the assignment and execute arbitrary code.
- **Suggested fix:** Strictly validate that `attr.expr` in a `bind` attribute is a simple identifier or a safe member access. Reject complex expressions that could contain multiple statements.
- **Confidence:** High

### [LOW] Logic Injection in Vue Event Handlers
- **File(s):** `packages/compiler/src/codegen/vue.ts`
- **Area:** Security / Codegen
- **Evidence:** In `renderVueBehavior`:
  ```typescript
  const rawHandler =
    bodyLines.length === 1
      ? bodyLines[0].trim()
      : `() => { ${bodyLines.map((l) => l.trim()).join('; ')} }`
  ```
- **Why it was missed or not covered before:** Missed during initial event handler review.
- **Why it matters:** Similar to the React binding issue, if `bodyLines` can be influenced, an attacker can break out of the arrow function or inject additional logic. While less likely to be exploited via user input than a binding, it remains a structural weakness in the compiler.
- **Suggested fix:** Use the TypeScript AST to wrap and validate the handler body instead of simple string joining.
- **Confidence:** Medium

### [LOW] Accessibility Gap: Missing Focus Management in UI
- **File(s):** `packages/ui/src/index.ts`
- **Area:** Maintainability / Accessibility
- **Evidence:** `createDialog` (and `createModal`) provides keyboard listeners for Escape but lacks logic for focus trapping (preventing Tab from leaving the dialog) and focus restoration (returning focus to the trigger on close).
- **Why it was missed or not covered before:** The initial audit did not perform an accessibility (a11y) check on the UI primitives.
- **Why it matters:** Users relying on screen readers or keyboard navigation will find the modals difficult or impossible to use safely, as focus can easily drift into the background content while the modal is "open".
- **Suggested fix:** Implement a focus trap utility (using `focus-trap` or a custom implementation) and ensure `createDialog` handles focus entry and exit correctly.
- **Confidence:** High

### [LOW] Potential Panic in N-API Bridge
- **File(s):** `packages/loom_core/src/lib.rs`
- **Area:** Reliability / Rust Core
- **Evidence:** `parse_json_string` uses `.unwrap()` on `serde_json::to_string(&file)`.
- **Why it was missed or not covered before:** Initial audit focused on parser loops and lexer safety.
- **Why it matters:** While `serde_json` serialization of a valid AST is extremely unlikely to fail, a panic in the native Rust module will crash the entire Node.js process. In a long-running language server or CI environment, this leads to an ungraceful failure.
- **Suggested fix:** Use `serde_json::to_string(&file).unwrap_or_else(|_| "{\"error\": \"Serialization failed\"}".to_string())` or return a `Result` to the N-API caller.
- **Confidence:** Low (Theoretical)

## Updated Files Inspected
- `packages/loom_core/src/lib.rs` (N-API/Wasm bindings, unwrap safety)
- `packages/ui/src/index.ts` (Headless primitives - Deep Dive)
- `packages/ui/src/Modal.loom` (Component implementation)
- `packages/compiler/src/codegen/react.ts` (Binding logic, text sinks)
- `packages/compiler/src/codegen/vue.ts` (Event handler logic)
- `packages/compiler/src/codegen/svelte.ts` (Svelte HTML sinks)
- `packages/compiler/src/codegen/markdown.ts` (Markdown XSS vectors)
- `packages/compiler/src/codegen/css.ts` (CSS scoping and atomic generation)
- `packages/create-loom-app/src/index.ts` (Template security)
- `packages/create-loom-app/src/cli.ts` (CLI argument handling)
- `scripts/verify.mjs` (CI automation logic)

## Recommended Fix Plan (Extended)
5. **Re-evaluate Bindings:** Update `renderDataAttr` in `react.ts` to strictly validate `bind:` expressions.
6. **Hardened Event Handlers:** Refactor `renderVueBehavior` and similar logic in other targets to avoid raw string joining for multi-line handler bodies.
7. **Accessibility Sprint:** Add focus-trap and focus-restore logic to `packages/ui/src/index.ts`.
8. **Native Reliability:** Replace remaining unsafe `.unwrap()` calls in `packages/loom_core/src/lib.rs` with safe error handling.

## Open Questions / Needs Manual Verification
- **DevTools Production Usage:** Verify if `loom-devtools` is automatically stripped from production builds. If it persists, the `postMessage` risk is elevated to High.
- **Indexer Scalability:** Determine how large target user repositories will be. If user repositories approach tens of thousands of files, even the Rust `rayon` threading might consume excessive memory. Benchmarking the Rust indexer under stress conditions is recommended.
- **LoomKit Sanitization:** Audit how LoomKit users typically consume route parameters to determine if a centralized sanitization layer in `matchRoute` is feasible without breaking legitimate use cases.
