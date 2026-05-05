import type { StyleBlock, StyleRule, CSSDecl, NestedRule } from '../ast.js'

export type DynamicStyleBinding = {
  cssVar: string
  expr: string
}

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
 * @returns Plain CSS string and any dynamic bindings found
 */
export function generateCSS(
  block: StyleBlock,
  scopeClass: string,
  isGlobalBlock = false,
): { cssText: string; dynamicBindings: DynamicStyleBinding[] } {
  const lines: string[] = []
  const dynamicBindings: DynamicStyleBinding[] = []
  expandRules(block, isGlobalBlock ? '' : `.${scopeClass}`, lines, dynamicBindings)
  return { cssText: lines.join('\n'), dynamicBindings }
}

function expandRules(
  rules: StyleRule[],
  selector: string,
  out: string[],
  dynamicBindings: DynamicStyleBinding[],
) {
  const decls: CSSDecl[] = []
  const nested: NestedRule[] = []

  for (const rule of rules) {
    if (rule.kind === 'decl') decls.push(rule)
    else nested.push(rule)
  }

  if (decls.length > 0 && selector) {
    out.push(`${selector} {`)
    for (const d of decls) {
      const { value, bindings } = processDynamicValue(d.prop, d.value)
      out.push(`  ${d.prop}: ${value};`)
      dynamicBindings.push(...bindings)
    }
    out.push('}')
  }

  for (const n of nested) {
    expandNested(n, selector, out, dynamicBindings)
  }
}

function processDynamicValue(
  prop: string,
  rawValue: string,
): { value: string; bindings: DynamicStyleBinding[] } {
  const bindings: DynamicStyleBinding[] = []
  // Matches {expression}
  const processed = rawValue.replace(/\{([^}]+)\}/g, (_, expr) => {
    const hash = hashString(expr)
    const cssVar = `--v-${hash}`
    bindings.push({ cssVar, expr: expr.trim() })
    return `var(${cssVar})`
  })

  return { value: processed, bindings }
}

function expandNested(
  rule: NestedRule,
  parentSelector: string,
  out: string[],
  dynamicBindings: DynamicStyleBinding[],
) {
  const sel = rule.selector

  if (sel.startsWith('@')) {
    // @media / @supports — wrap block
    out.push(`${sel} {`)
    const innerLines: string[] = []
    expandRules(rule.rules, parentSelector, innerLines, dynamicBindings)
    for (const l of innerLines) out.push(`  ${l}`)
    out.push('}')
  } else if (sel.startsWith(':global(')) {
    // :global(.class) — emit without parent scope
    const globalMatch = sel.match(/^:global\((.+)\)(\s+&)?$/)
    if (globalMatch) {
      const globalPart = globalMatch[1]
      const hasSelf = globalMatch[2]
      const combinedSelector = hasSelf ? `${globalPart} ${parentSelector}` : globalPart
      expandRules(rule.rules, combinedSelector, out, dynamicBindings)
    }
  } else if (sel.includes('&')) {
    // & is replaced with parent selector
    const resolved = sel.replace(/&/g, parentSelector)
    expandRules(rule.rules, resolved, out, dynamicBindings)
  } else {
    // Descendant selector
    const combined = parentSelector ? `${parentSelector} ${sel}` : sel
    expandRules(rule.rules, combined, out, dynamicBindings)
  }
}

/**
 * Collects all CSS from a component's elements into a single CSS Modules file.
 * Returns { cssText, classMap, dynamicStyleMap } where classMap maps scopeKey → CSS class name.
 */
export function collectComponentCSS(
  componentName: string,
  styleBlocks: Array<{ scopeKey: string; block: StyleBlock }>,
  options: { atomic?: boolean } = {},
): {
  cssText: string
  classMap: Map<string, string[]>
  dynamicStyleMap: Map<string, DynamicStyleBinding[]>
} {
  const classMap = new Map<string, string[]>()
  const dynamicStyleMap = new Map<string, DynamicStyleBinding[]>()
  const parts: string[] = []

  for (const { scopeKey, block } of styleBlocks) {
    if (options.atomic) {
      const atomic = generateAtomicCSS(block, componentName, scopeKey)
      classMap.set(scopeKey, atomic.classNames)
      if (atomic.cssText.trim()) parts.push(atomic.cssText)
      if (atomic.dynamicBindings.length > 0) {
        dynamicStyleMap.set(scopeKey, atomic.dynamicBindings)
      }
      continue
    }

    const hash = hashString(`${componentName}-${scopeKey}`)
    const className = `_${scopeKey.replace(/[^a-zA-Z0-9]/g, '_')}_${hash}`
    classMap.set(scopeKey, [className])
    const { cssText, dynamicBindings } = generateCSS(block, className)
    if (cssText.trim()) parts.push(cssText)
    if (dynamicBindings.length > 0) {
      dynamicStyleMap.set(scopeKey, dynamicBindings)
    }
  }

  return { cssText: parts.join('\n\n'), classMap, dynamicStyleMap }
}

export function generateAtomicCSS(
  block: StyleBlock,
  componentName: string,
  scopeKey: string,
): { cssText: string; classNames: string[]; dynamicBindings: DynamicStyleBinding[] } {
  const classNames: string[] = []
  const dynamicBindings: DynamicStyleBinding[] = []
  const parts: string[] = []
  collectAtomicRules(block, '', componentName, scopeKey, classNames, parts, dynamicBindings)
  return { cssText: parts.join('\n\n'), classNames, dynamicBindings }
}

function collectAtomicRules(
  rules: StyleRule[],
  selectorSuffix: string,
  componentName: string,
  scopeKey: string,
  classNames: string[],
  out: string[],
  dynamicBindings: DynamicStyleBinding[],
) {
  for (const rule of rules) {
    if (rule.kind === 'decl') {
      const hash = hashString(`${componentName}-${scopeKey}-${selectorSuffix}-${rule.prop}-${rule.value}`)
      const className = `_a_${hash}`
      classNames.push(className)
      const { value, bindings } = processDynamicValue(rule.prop, rule.value)
      dynamicBindings.push(...bindings)
      out.push(`.${className}${selectorSuffix} {\n  ${rule.prop}: ${value};\n}`)
      continue
    }

    const selector = atomicSelectorSuffix(rule.selector)
    if (selector.kind === 'at-rule') {
      const inner: string[] = []
      collectAtomicRules(rule.rules, selectorSuffix, componentName, scopeKey, classNames, inner, dynamicBindings)
      if (inner.length > 0) out.push(`${rule.selector} {\n${inner.map((line) => `  ${line.replace(/\n/g, '\n  ')}`).join('\n\n')}\n}`)
    } else {
      collectAtomicRules(rule.rules, selectorSuffix + selector.suffix, componentName, scopeKey, classNames, out, dynamicBindings)
    }
  }
}

function atomicSelectorSuffix(selector: string): { kind: 'selector'; suffix: string } | { kind: 'at-rule' } {
  if (selector.startsWith('@')) return { kind: 'at-rule' }
  if (selector.startsWith(':global(')) {
    const match = selector.match(/^:global\((.+)\)(\s+&)?$/)
    if (!match) return { kind: 'selector', suffix: '' }
    return { kind: 'selector', suffix: match[2] ? '' : ` ${match[1]}` }
  }
  if (selector.includes('&')) return { kind: 'selector', suffix: selector.replace(/&/g, '') }
  return { kind: 'selector', suffix: ` ${selector}` }
}

export function scopeKeyForElement(node: {
  tag: string
  span?: { start: { line: number; column: number } }
}): string {
  if (node.span) {
    return `${node.tag}_${node.span.start.line}_${node.span.start.column}`
  }
  return `${node.tag}_unknown`
}
