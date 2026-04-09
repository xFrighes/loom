import type { StyleBlock, StyleRule, CSSDecl, NestedRule } from '../ast.js'

/**
 * Generates a short deterministic hash for CSS scoping.
 * Based on a simple djb2 variant — good enough for dev-time hashing.
 */
export function hashString(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h >>> 0 // keep 32-bit unsigned
  }
  return h.toString(36).slice(0, 6)
}

/**
 * Converts a Loom StyleBlock into flat CSS, expanding nested selectors.
 *
 * @param block - The StyleBlock (array of StyleRule) from the AST
 * @param scopeClass - The CSS Modules class name to scope declarations under
 * @param isGlobalBlock - When true, no scoping is applied (used inside :global)
 * @returns Plain CSS string
 */
export function generateCSS(
  block: StyleBlock,
  scopeClass: string,
  isGlobalBlock = false,
): string {
  const lines: string[] = []
  expandRules(block, isGlobalBlock ? '' : `.${scopeClass}`, lines)
  return lines.join('\n')
}

function expandRules(rules: StyleRule[], selector: string, out: string[]) {
  const decls: CSSDecl[] = []
  const nested: NestedRule[] = []

  for (const rule of rules) {
    if (rule.kind === 'decl') decls.push(rule)
    else nested.push(rule)
  }

  if (decls.length > 0 && selector) {
    out.push(`${selector} {`)
    for (const d of decls) out.push(`  ${d.prop}: ${d.value};`)
    out.push('}')
  }

  for (const n of nested) {
    expandNested(n, selector, out)
  }
}

function expandNested(rule: NestedRule, parentSelector: string, out: string[]) {
  const sel = rule.selector

  if (sel.startsWith('@')) {
    // @media / @supports — wrap block
    out.push(`${sel} {`)
    const innerLines: string[] = []
    expandRules(rule.rules, parentSelector, innerLines)
    for (const l of innerLines) out.push(`  ${l}`)
    out.push('}')
  } else if (sel.startsWith(':global(')) {
    // :global(.class) — emit without parent scope
    const globalMatch = sel.match(/^:global\((.+)\)(\s+&)?$/)
    if (globalMatch) {
      const globalPart = globalMatch[1]
      const hasSelf = globalMatch[2]
      const combinedSelector = hasSelf ? `${globalPart} ${parentSelector}` : globalPart
      expandRules(rule.rules, combinedSelector, out)
    }
  } else if (sel.includes('&')) {
    // & is replaced with parent selector
    const resolved = sel.replace(/&/g, parentSelector)
    expandRules(rule.rules, resolved, out)
  } else {
    // Descendant selector
    const combined = parentSelector ? `${parentSelector} ${sel}` : sel
    expandRules(rule.rules, combined, out)
  }
}

/**
 * Collects all CSS from a component's elements into a single CSS Modules file.
 * Returns { cssText, classMap } where classMap maps scopeKey → CSS class name.
 */
export function collectComponentCSS(
  componentName: string,
  styleBlocks: Array<{ scopeKey: string; block: StyleBlock }>,
): { cssText: string; classMap: Map<string, string> } {
  const classMap = new Map<string, string>()
  const parts: string[] = []

  for (const { scopeKey, block } of styleBlocks) {
    const hash = hashString(`${componentName}-${scopeKey}`)
    const className = `_${scopeKey.replace(/[^a-zA-Z0-9]/g, '_')}_${hash}`
    classMap.set(scopeKey, className)
    const css = generateCSS(block, className)
    if (css.trim()) parts.push(css)
  }

  return { cssText: parts.join('\n\n'), classMap }
}

export function scopeKeyForElement(node: { tag: string; span?: { start: { line: number; column: number } } }): string {
  if (node.span) {
    return `${node.tag}_${node.span.start.line}_${node.span.start.column}`
  }
  return `${node.tag}_unknown`
}
