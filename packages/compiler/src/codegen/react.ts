import type {
  LoomFile,
  PropDecl,
  MarkupNode,
  ElementNode,
  DataAttr,
  BehaviorBlock,
  ControlNode,
  IfNode,
  ElseIfNode,
  ElseNode,
  EachNode,
  TextNode,
  SlotDefNode,
  SlotUseNode,
  
  StyleBlock,
} from '../ast.js'
import type { CodegenTarget, CompileResult, TargetGenerateOptions } from './target.js'
import type { CompilerDiagnostic } from '../validate.js'
import { collectComponentCSS, scopeKeyForElement, type DynamicStyleBinding } from './css.js'
import { warnReactBehavior, warnMissingLoopKey } from './warnings.js'
import { buildSourceMap, type Mapping } from '../sourcemap.js'

// ─── React codegen ────────────────────────────────────────────────────────────

export class ReactTarget implements CodegenTarget {
  generate(
    file: LoomFile,
    componentName: string,
    options: TargetGenerateOptions = {},
  ): CompileResult {
    const ctx = new ReactGenContext(componentName, options)
    const code = ctx.generateComponent(file)
    const map = options.sourceFile
      ? buildSourceMap(options.sourceFile, options.sourceContent ?? '', ctx.mappings)
      : undefined
    return {
      code,
      css: ctx.cssText,
      map,
      warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
    }
  }
}

// ─── Generation context ───────────────────────────────────────────────────────

class ReactGenContext {
  private styleBlocks: Array<{ scopeKey: string; block: StyleBlock }> = []
  private classMap: Map<string, string> = new Map()
  private dynamicStyleMap: Map<string, DynamicStyleBinding[]> = new Map()
  cssText = ''
  private hasCSSModules = false
  readonly warnings: CompilerDiagnostic[] = []
  /** Source map mappings accumulated during codegen. */
  readonly mappings: Mapping[] = []
  /** Tracks the current output line number (0-based). */
  private outputLine = 0
  private renderCursorLine: number | null = null

  constructor(
    private componentName: string,
    private options: TargetGenerateOptions,
  ) {}

  /**
   * Push lines into an output array and record a source mapping for the first
   * line if the node carries a source span.
   */
  private emit(
    out: string[],
    newLines: string[],
    span?: { start: { line: number; column: number } },
  ): void {
    if (newLines.length > 0 && span) {
      this.mappings.push({
        genLine: this.outputLine,
        genCol: 0,
        srcLine: span.start.line - 1,
        srcCol: span.start.column - 1,
      })
    }
    out.push(...newLines)
    this.outputLine += newLines.length
  }

  private transformLogic(src: string, file: LoomFile): string {
    return src;
  }

  private detectDependencies(expr: string, file: LoomFile): string[] {
    return [];
  }

  private pushLines(out: string[], newLines: string[]): void {
    out.push(...newLines)
    this.outputLine += newLines.length
  }

  private renderWithCursor<T>(startLine: number, render: () => T): T {
    const previous = this.renderCursorLine
    this.renderCursorLine = startLine
    try {
      return render()
    } finally {
      this.renderCursorLine = previous
    }
  }

  private advanceRenderCursor(lines: number): void {
    if (this.renderCursorLine !== null) {
      this.renderCursorLine += lines
    }
  }

  generateComponent(file: LoomFile): string {
    // Collect styles first to build classMap before generating markup
    if (file.markup) this.collectStyles(file.markup)
    const { cssText, classMap, dynamicStyleMap } = collectComponentCSS(
      this.componentName,
      this.styleBlocks,
    )
    this.cssText = cssText
    this.classMap = classMap
    this.dynamicStyleMap = dynamicStyleMap
    this.hasCSSModules = this.styleBlocks.length > 0

    const lines: string[] = []

    // Imports
    this.pushLines(lines, [`import React, { useState, useMemo, useEffect } from 'react'`])
    if (this.hasCSSModules) {
      const cssImportPath = this.options.cssImportPath ?? `./${this.componentName}.module.css`
      this.pushLines(lines, [`import styles from ${JSON.stringify(cssImportPath)}`])
    }

    // Logic zone statements
    const logicImports: string[] = []
    const logicBody: string[] = []

    if (file.logic) {
      for (const stmt of file.logic.statements) {
        if (stmt.kind === 'import' || stmt.kind === 'type' || stmt.kind === 'export') {
          logicImports.push(stmt.src)
        } else {
          logicBody.push(stmt.src)
        }
      }
    }

    if (logicImports.length > 0) {
      if (file.logic?.span) {
        this.mappings.push({
          genLine: this.outputLine,
          genCol: 0,
          srcLine: file.logic.span.start.line - 1,
          srcCol: 0,
        })
      }
      this.pushLines(lines, logicImports)
    }

    this.pushLines(lines, [''])

    // Function signature
    const sig = buildReactSignature(
      this.componentName,
      file.generics,
      file.props,
      collectNamedSlots(file.markup ?? []),
    )
    this.pushLines(lines, [sig.open])
    if (sig.destructure) {
      this.pushLines(lines, [`  ${sig.destructure}`, ''])
    }

    // Reactivity: State
    if (file.state && file.state.length > 0) {
      for (const s of file.state) {
        const setter = `set${capitalize(s.name)}`
        const type = s.type !== 'any' ? `<${s.type}>` : ''
        const defaultValue = s.defaultValue !== undefined ? s.defaultValue : ''
        this.pushLines(lines, [`  const [${s.name}, ${setter}] = useState${type}(${defaultValue})`])
      }
      this.pushLines(lines, [''])
    }

    // Reactivity: Computed
    if (file.computed && file.computed.length > 0) {
      for (const c of file.computed) {
        const deps = this.detectDependencies(c.expr, file)
        const depsStr = deps.length > 0 ? `[${deps.join(', ')}]` : '[]'
        this.pushLines(lines, [`  const ${c.name} = useMemo(() => ${c.expr}, ${depsStr})`])
      }
      this.pushLines(lines, [''])
    }

    // Reactivity: Lifecycles
    if (file.onMount && file.onMount.length > 0) {
      this.pushLines(lines, ['  useEffect(() => {'])
      for (const stmt of file.onMount) {
        this.pushLines(lines, [`    ${this.transformLogic(stmt.src, file)}`])
      }
      this.pushLines(lines, ['  }, [])', ''])
    }

    if (file.onUpdate && file.onUpdate.length > 0) {
      this.pushLines(lines, ['  useEffect(() => {'])
      for (const stmt of file.onUpdate) {
        this.pushLines(lines, [`    ${this.transformLogic(stmt.src, file)}`])
      }
      this.pushLines(lines, ['])', ''])
    }

    if (file.onUnmount && file.onUnmount.length > 0) {
      this.pushLines(lines, ['  useEffect(() => {', '    return () => {'])
      for (const stmt of file.onUnmount) {
        this.pushLines(lines, [`      ${this.transformLogic(stmt.src, file)}`])
      }
      this.pushLines(lines, ['    }', '  }, [])', ''])
    }

    // Logic body
    if (logicBody.length > 0) {
      this.pushLines(lines, [...logicBody.map((l) => `  ${this.transformLogic(l, file)}`), ''])
    }

    // Markup
    this.pushLines(lines, ['  return ('])
    if (file.markup && file.markup.length > 0) {
      const markup = file.markup
      const markupLines = this.renderWithCursor(this.outputLine, () =>
        this.renderMarkupList(markup, '    ', file),
      )
      this.pushLines(lines, markupLines)
    } else {
      this.pushLines(lines, ['    <></>'])
    }
    this.pushLines(lines, ['  )'])

    this.pushLines(lines, [sig.close])

    this.pushLines(lines, ['', `export default ${this.componentName}`])

    return lines.join('\n')
  }

  // ── Style collection pass ────────────────────────────────────────────────────

  private collectStyles(nodes: MarkupNode[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.kind === 'element') {
        const key = scopeKeyForElement(node)
        if (node.styles && node.styles.length > 0) {
          this.styleBlocks.push({ scopeKey: key, block: node.styles })
        }
        if (node.children.length > 0) {
          this.collectStyles(node.children)
        }
      } else if (node.kind === 'if') {
        this.collectStyles(node.consequent)
        if (node.alternate) this.collectStylesFromControl(node.alternate)
      } else if (node.kind === 'each') {
        this.collectStyles(node.children)
      }
    }
  }

  private collectStylesFromControl(node: ControlNode | ElseNode) {
    if (node.kind === 'elseif') {
      this.collectStyles(node.consequent)
      if (node.alternate) this.collectStylesFromControl(node.alternate)
    } else if (node.kind === 'else') {
      this.collectStyles(node.children)
    }
  }

  // ── Markup rendering ──────────────────────────────────────────────────────────

  renderMarkupList(nodes: MarkupNode[], indent: string, file: LoomFile): string[] {
    const filtered = nodes.filter((n) => n.kind !== 'comment')

    if (filtered.length === 0) return [`${indent}<></>`]
    if (filtered.length === 1) return this.renderNode(filtered[0], indent, file)

    // Multiple root nodes → wrap in Fragment
    const lines: string[] = []
    lines.push(`${indent}<>`)
    this.advanceRenderCursor(1)
    for (const node of filtered) {
      lines.push(...this.renderNode(node, indent + '  ', file))
    }
    lines.push(`${indent}</>`)
    return lines
  }

  private renderNode(node: MarkupNode, indent: string, file: LoomFile): string[] {
    const startLine = this.renderCursorLine ?? this.outputLine
    const lines = this.renderNodeInner(node, indent, file)
    if (lines.length > 0 && node.span) {
      this.mappings.push({
        genLine: startLine,
        genCol: indent.length,
        srcLine: node.span.start.line - 1,
        srcCol: node.span.start.column - 1,
      })
    }
    if (this.renderCursorLine !== null) {
      this.renderCursorLine = startLine + lines.length
    } else {
      this.outputLine += lines.length
    }
    return lines
  }

  private renderNodeInner(node: MarkupNode, indent: string, file: LoomFile): string[] {
    switch (node.kind) {
      case 'element':
        return this.renderElement(node, indent, file)
      case 'text':
        return this.renderText(node, indent)
      case 'if':
        return this.renderControl(node, indent, file)
      case 'each':
        return this.renderEach(node, indent, file)
      case 'slot-def':
        return this.renderSlotDef(node, indent)
      case 'slot-use':
        return [] // slot-use is handled by parent element
      case 'comment':
        return [`${indent}{/* ${node.value} */}`]
      default:
        return []
    }
  }

  private renderElement(node: ElementNode, indent: string, file: LoomFile): string[] {
    const scopeKey = scopeKeyForElement(node)

    // Resolve tag
    const resolvedTag = node.tag
    let isPolymorphic = false
    let polyExpr = ''

    if (node.tag === 'element') {
      const asAttr = node.data?.find((d) => d.kind === 'as')
      if (asAttr && asAttr.kind === 'as') {
        isPolymorphic = true
        polyExpr = asAttr.expr
      }
    }

    // Build attribute string
    const attrParts: string[] = []

    // className from classes + CSS Modules
    const classNames = this.buildClassNameAttr(node, scopeKey)
    if (classNames) attrParts.push(classNames)

    const dynamicStyleAttr = this.buildDynamicStyleAttr(scopeKey)
    if (dynamicStyleAttr) attrParts.push(dynamicStyleAttr)

    // id
    if (node.id) attrParts.push(`id="${escapeHtmlAttr(node.id)}"`)

    // Data attributes
    if (node.data) {
      for (const attr of node.data) {
        if (attr.kind === 'as') continue // already handled
        if (
          (attr.kind === 'static' || attr.kind === 'dynamic') &&
          (attr.name === 'class' || attr.name === 'className')
        )
          continue
        attrParts.push(renderDataAttr(attr))
      }
    }

    // Behavior attributes
    if (node.behaviors) {
      for (const beh of node.behaviors) {
        attrParts.push(renderBehaviorAttr(beh))
        this.warnings.push(...warnReactBehavior(beh, beh.span))
      }
    }

    const attrsStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : ''

    // Separate slot-use children from normal children
    const slotChildren = node.children.filter((c) => c.kind === 'slot-use') as SlotUseNode[]
    const normalChildren = node.children.filter((c) => c.kind !== 'slot-use')

    // Named slot children → extra props
    const slotProps: string[] = []
    for (const slot of slotChildren) {
      if (slot.name) {
        const slotLines = this.renderMarkupList(slot.children, indent + '  ')
        if (slot.children.length === 1 && isSimpleNode(slot.children[0])) {
          slotProps.push(` ${slot.name}={${this.renderInline(slot.children[0])}}`)
        } else {
          // Multi-line slot: use JSX expression
          slotProps.push(` ${slot.name}={(\n${slotLines.join('\n')}\n${indent})}`)
        }
      }
    }

    // Default slot children (unnamed slot-use or normal children)
    const defaultSlotChildren = [
      ...normalChildren,
      ...slotChildren.filter((s) => !s.name).flatMap((s) => s.children),
    ]

    const filteredChildren = defaultSlotChildren.filter((c) => c.kind !== 'comment')

    const lines: string[] = []

    if (isPolymorphic) {
      // React.createElement(expr, { ...props }, children)
      const propObj =
        attrParts.length > 0 ? `{ ${attrParts.map(jsxAttrToObjectEntry).join(', ')} }` : 'null'
      if (filteredChildren.length === 0) {
        lines.push(`${indent}<>{React.createElement(${polyExpr}, ${propObj})}</>`)
      } else {
        lines.push(`${indent}<>{React.createElement(${polyExpr}, ${propObj},`)
        this.advanceRenderCursor(1)
        for (const child of filteredChildren) {
          lines.push(...this.renderCreateElementChild(child, indent + '  '))
        }
        lines.push(`${indent})}</>`)
      }
      return lines
    }

    const fullAttrs = attrsStr + slotProps.join('')

    if (filteredChildren.length === 0) {
      lines.push(`${indent}<${resolvedTag}${fullAttrs} />`)
    } else {
      lines.push(`${indent}<${resolvedTag}${fullAttrs}>`)
      this.advanceRenderCursor(1)
      for (const child of filteredChildren) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
      lines.push(`${indent}</${resolvedTag}>`)
    }

    return lines
  }

  private buildClassNameAttr(node: ElementNode, scopeKey: string): string {
    const parts: string[] = []

    // CSS Modules scoped classes from :: dimension
    const moduleClass = this.classMap.get(scopeKey)

    // Direct class selectors from tag (div.card → "card")
    for (const cls of node.classes) {
      parts.push(`"${cls}"`)
    }

    for (const attr of node.data ?? []) {
      if (
        attr.kind === 'static' &&
        (attr.name === 'class' || attr.name === 'className') &&
        attr.value
      ) {
        parts.push(JSON.stringify(attr.value))
      } else if (attr.kind === 'dynamic' && (attr.name === 'class' || attr.name === 'className')) {
        parts.push(attr.expr)
      }
    }

    if (moduleClass) {
      parts.push(`styles['${moduleClass}']`)
    }

    if (parts.length === 0) return ''

    if (parts.length === 1 && parts[0].startsWith('"')) {
      return `className=${parts[0]}`
    }

    // Mix of string literals and expressions
    const hasExprs = parts.some((p) => !p.startsWith('"'))
    if (!hasExprs) {
      return `className="${parts.map((p) => p.slice(1, -1)).join(' ')}"`
    }

    return `className={[${parts.join(', ')}].filter(Boolean).join(' ')}`
  }

  private buildDynamicStyleAttr(scopeKey: string): string {
    const bindings = this.dynamicStyleMap.get(scopeKey)
    if (!bindings || bindings.length === 0) return ''

    const objectEntries = bindings.map((binding) => `"${binding.cssVar}": ${binding.expr}`)
    return `style={{ ${objectEntries.join(', ')} }}`
  }

  private renderText(node: TextNode, indent: string): string[] {
    // Plain text — interpolate {} expressions
    const interpolated = escapeTextWithExpressions(node.value, (expr) => `{${expr}}`)
    return [`${indent}${interpolated}`]
  }

  private renderControl(node: IfNode | ElseIfNode | ElseNode, indent: string, file: LoomFile): string[] {
    return this.renderTernary(node, indent, true, file)
  }

  private renderTernary(
    node: ControlNode | ElseNode,
    indent: string,
    wrapExpression: boolean,
    file: LoomFile,
  ): string[] {
    const lines: string[] = []

    if (node.kind === 'if' || node.kind === 'elseif') {
      lines.push(`${indent}${wrapExpression ? '{' : ''}${node.condition} ? (`)
      this.advanceRenderCursor(1)
      const consequentLines = unwrapJsxExpressionLines(
        this.renderMarkupList(node.consequent, indent + '  ', file),
      )
      lines.push(...consequentLines)
      lines.push(`${indent}) : (`)
      this.advanceRenderCursor(1)
      if (node.alternate) {
        const altLines = this.renderTernary(node.alternate, indent + '  ', false, file)
        lines.push(...altLines)
      } else {
        lines.push(`${indent}  null`)
      }
      lines.push(`${indent})${wrapExpression ? '}' : ''}`)
    } else if (node.kind === 'else') {
      lines.push(...this.renderMarkupList(node.children, indent, file))
    }

    return lines
  }

  private renderEach(node: EachNode, indent: string): string[] {
    const lines: string[] = []

    // Extract key from first child's : dimension if available
    let keyExpr = ''
    if (node.children[0]?.kind === 'element') {
      const keyAttr = node.children[0].data?.find((d) => d.kind === 'dynamic' && d.name === 'key')
      if (keyAttr && keyAttr.kind === 'dynamic') {
        keyExpr = ` key={${keyAttr.expr}}`
      }
    }

    if (!keyExpr) {
      this.warnings.push(...warnMissingLoopKey(node.list, node.span))
    }

    const indexParam = node.index ? `, ${node.index}` : ''
    lines.push(`${indent}{${node.list}.map((${node.item}${indexParam}) => (`)
    this.advanceRenderCursor(1)
    const childLines = this.renderMarkupList(node.children, indent + '  ')
    lines.push(...childLines)
    lines.push(`${indent}))}`)

    return lines
  }

  private renderSlotDef(node: SlotDefNode, indent: string): string[] {
    if (node.name) {
      return [`${indent}{props.${node.name}}`]
    }
    return [`${indent}{props.children}`]
  }

  /** Render a node to a compact inline string (for single-node slot values) */
  private renderInline(node: MarkupNode): string {
    if (node.kind === 'text') return JSON.stringify(node.value)
    if (node.kind === 'element') {
      const lines = this.renderWithCursor(-1, () => this.renderElement(node, ''))
      return lines.join('').trim()
    }
    return 'null'
  }

  private renderCreateElementChild(node: MarkupNode, indent: string): string[] {
    if (node.kind === 'text') {
      return [`${indent}${textToReactExpression(node.value)}`]
    }
    return this.renderNode(node, indent)
  }
}

function unwrapJsxExpressionLines(lines: string[]): string[] {
  if (lines.length === 0) return lines

  const first = lines[0]
  const last = lines[lines.length - 1]
  const firstMatch = first.match(/^(\s*)\{(.+)$/)
  if (!firstMatch || !last.trimEnd().endsWith('}')) return lines

  const next = [...lines]
  next[0] = `${firstMatch[1]}${firstMatch[2]}`
  next[next.length - 1] = last.replace(/\}\s*$/, '')
  return next
}

function textToReactExpression(value: string): string {
  const wholeExpression = value.match(/^\{([\s\S]+)\}$/)
  if (wholeExpression) return wholeExpression[1].trim()

  if (!value.includes('{')) return JSON.stringify(value)

  const template = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{([^{}]+)\}/g, '${$1}')
  return `\`${template}\``
}

// ─── Signature builder ────────────────────────────────────────────────────────

function buildReactSignature(
  name: string,
  generics?: string,
  props?: PropDecl[],
  namedSlots: string[] = [],
): { open: string; close: string; destructure?: string } {
  const g = generics ? `<${generics}>` : ''
  const propFields =
    props?.map(
      (prop) => `${prop.name}${prop.defaultValue !== undefined ? '?' : ''}: ${prop.type}`,
    ) ?? []
  propFields.push('children?: React.ReactNode')
  for (const slot of namedSlots) {
    propFields.push(`${slot}?: React.ReactNode`)
  }
  const typeAnnotation = `{ ${propFields.join('; ')} }`
  const destructure =
    props && props.length > 0
      ? `const { ${props.map((prop) => (prop.defaultValue !== undefined ? `${prop.name} = ${prop.defaultValue}` : prop.name)).join(', ')} } = props`
      : undefined

  return {
    open: `function ${name}${g}(props: ${typeAnnotation}) {`,
    close: '}',
    destructure,
  }
}

// ─── Attribute renderers ──────────────────────────────────────────────────────

function renderDataAttr(attr: DataAttr): string {
  switch (attr.kind) {
    case 'static':
      if (attr.value === '') return attr.name // boolean attr
      return `${toReactAttrName(attr.name)}="${escapeHtmlAttr(attr.value)}"`
    case 'dynamic':
      return `${toReactAttrName(attr.name)}={${attr.expr}}`
    case 'spread':
      return `{...${attr.expr}}`
    case 'as':
      return '' // handled separately
  }
}

const EVENT_MAP: Record<string, string> = {
  click: 'onClick',
  dblclick: 'onDoubleClick',
  submit: 'onSubmit',
  change: 'onChange',
  input: 'onInput',
  focus: 'onFocus',
  blur: 'onBlur',
  keydown: 'onKeyDown',
  keyup: 'onKeyUp',
  keypress: 'onKeyPress',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  mouseover: 'onMouseOver',
  mouseout: 'onMouseOut',
  mousedown: 'onMouseDown',
  mouseup: 'onMouseUp',
  scroll: 'onScroll',
  resize: 'onResize',
  load: 'onLoad',
  error: 'onError',
}

function toReactEvent(event: string): string {
  // If already has "on" prefix (e.g. onSubmit) → pass through
  if (event.startsWith('on') && event.length > 2 && event[2] === event[2].toUpperCase()) {
    return event
  }
  return EVENT_MAP[event.toLowerCase()] ?? `on${capitalize(event)}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function renderBehaviorAttr(beh: BehaviorBlock): string {
  const reactEvent = toReactEvent(beh.event)
  const modifiers = beh.modifiers

  // Build handler body
  const stmts: string[] = []

  if (modifiers.includes('prevent')) stmts.push('e.preventDefault()')
  if (modifiers.includes('stop')) stmts.push('e.stopPropagation()')
  if (modifiers.includes('self')) stmts.push('if (e.target !== e.currentTarget) return')

  // Key filter modifiers (enter, escape, tab, space, etc.)
  const keyModifiers: Record<string, string> = {
    enter: 'Enter',
    escape: 'Escape',
    tab: 'Tab',
    space: ' ',
    delete: 'Delete',
    backspace: 'Backspace',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
  }

  const keyMod = modifiers.find((m) => keyModifiers[m.toLowerCase()])
  if (keyMod) {
    const keyValue = keyModifiers[keyMod.toLowerCase()]
    stmts.push(`if (e.key !== '${keyValue}') return`)
  }

  stmts.push(...beh.body.map((s) => s.src).filter((l) => l.trim()))

  if (stmts.length === 0 && !beh.body.length) {
    return `${reactEvent}={() => {}}`
  }


  // Check if we need an event param
  const needsEvent =
    modifiers.includes('prevent') ||
    modifiers.includes('stop') ||
    modifiers.includes('self') ||
    keyMod !== undefined ||
    stmts.some((s) => /\be\./.test(s))
  const param = needsEvent ? 'e' : '_e'

  const bodyStr = stmts.map((l) => `    ${l}`).join('\n')
  return `${reactEvent}={(${param}) => {\n${bodyStr}\n  }}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSimpleNode(node: MarkupNode): boolean {
  return node.kind === 'text'
}

function toReactAttrName(name: string): string {
  if (name === 'class') return 'className'
  if (name === 'for') return 'htmlFor'
  return name
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeTextWithExpressions(
  value: string,
  renderExpression: (expr: string) => string,
): string {
  return value
    .split(/(\{[^}]+\})/g)
    .map((part) => {
      const match = part.match(/^\{([^}]+)\}$/)
      return match ? renderExpression(match[1]!) : escapeText(part)
    })
    .join('')
}

function jsxAttrToObjectEntry(attr: string): string {
  const trimmed = attr.trim()
  if (trimmed.startsWith('{...') && trimmed.endsWith('}')) {
    return `...${trimmed.slice(4, -1)}`
  }

  const equals = trimmed.indexOf('=')
  if (equals === -1) return `${JSON.stringify(toObjectKey(trimmed))}: true`

  const name = toObjectKey(trimmed.slice(0, equals))
  const value = trimmed.slice(equals + 1)
  if (value.startsWith('{') && value.endsWith('}')) {
    return `${JSON.stringify(name)}: ${value.slice(1, -1)}`
  }
  return `${JSON.stringify(name)}: ${JSON.stringify(unescapeHtmlAttr(value.slice(1, -1)))}`
}

function toObjectKey(name: string): string {
  return name === 'className' ? 'className' : name
}

function unescapeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function collectNamedSlots(nodes: MarkupNode[]): string[] {
  const slots = new Set<string>()
  const visit = (node: MarkupNode) => {
    if (node.kind === 'slot-def' && node.name) {
      slots.add(node.name)
      return
    }
    if (node.kind === 'element' || node.kind === 'slot-use') {
      node.children.forEach(visit)
      return
    }
    if (node.kind === 'if' || node.kind === 'elseif') {
      node.consequent.forEach(visit)
      if (node.alternate) visit(node.alternate)
      return
    }
    if (node.kind === 'else' || node.kind === 'each') {
      node.children.forEach(visit)
    }
  }
  nodes.forEach(visit)
  return [...slots]
}
