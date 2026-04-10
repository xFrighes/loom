/**
 * Cross-target behaviour warnings.
 *
 * Loom maps a single syntax to React, Vue, and Svelte. Most semantics are
 * equivalent, but a handful of event modifiers and features have no direct
 * counterpart on some targets. This module collects those warnings so callers
 * can surface them without crashing the build.
 *
 * ## Target parity matrix
 *
 * | Feature                        | React     | Vue 3       | Svelte 4      |
 * |-------------------------------|-----------|-------------|---------------|
 * | `@event.prevent`              | ✓ manual  | ✓ `.prevent`| ✓ `\|prevent`  |
 * | `@event.stop`                 | ✓ manual  | ✓ `.stop`   | ✓ `\|stopProp` |
 * | `@event.once`                 | ✗ dropped | ✓ `.once`   | ✓ `\|once`     |
 * | `@event.passive`              | ✗ dropped | ✓ `.passive`| ✓ `\|passive`  |
 * | `@event.capture`              | ✗ dropped | ✓ `.capture`| ✓ `\|capture`  |
 * | `@event.self`                 | ✓ manual  | ✓ `.self`   | ✓ `\|self`     |
 * | `element :as`                 | ✓ createElement | ✓ `:is` | ✓ svelte:element |
 * | named slots                   | ✓ props   | ✓ #slot     | ✓ slot attr   |
 * | default slot (`{props.children}`)| ✓      | ✓ `<slot />`| ✓ `<slot />`  |
 * | inline HTML                   | dangerouslySetInnerHTML | v-html | {@html} |
 * | loops without key             | ⚠ no key  | ⚠ no :key  | ⚠ no (key)    |
 */

import type { BehaviorBlock, SourceSpan } from '../ast.js'
import type { CompilerDiagnostic } from '../validate.js'

/**
 * Modifiers that React cannot honour natively.
 * They are silently dropped from the emitted handler.
 */
const REACT_UNSUPPORTED_MODIFIERS = new Set(['once', 'passive', 'capture'])

export function warnReactBehavior(
  beh: BehaviorBlock,
  span: SourceSpan | undefined,
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const fallbackSpan: SourceSpan = span ?? {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
  for (const mod of beh.modifiers) {
    if (REACT_UNSUPPORTED_MODIFIERS.has(mod.toLowerCase())) {
      diagnostics.push({
        code: 'loom/react-modifier-unsupported',
        severity: 'warning',
        message: `Event modifier ".${mod}" has no React equivalent and is silently dropped. Use Vue or Svelte if you need native "${mod}" support.`,
        span: fallbackSpan,
      })
    }
  }
  return diagnostics
}

export function warnMissingLoopKey(
  listExpr: string,
  span: SourceSpan | undefined,
): CompilerDiagnostic[] {
  const fallbackSpan: SourceSpan = span ?? {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
  return [
    {
      code: 'loom/missing-loop-key',
      severity: 'warning',
      message: `"each ${listExpr}" has no key binding. Add ": key {expr}" on the loop child for stable reconciliation.`,
      span: fallbackSpan,
    },
  ]
}
