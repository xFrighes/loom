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
  CommentNode,
  StyleBlock,
} from '../ast.js'
import type { CodegenTarget, CompileResult, TargetGenerateOptions } from './target.js'
import type { CompilerDiagnostic } from '../validate.js'
import { collectComponentCSS, scopeKeyForElement } from './css.js'
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
  cssText = ''
  private hasCSSModules = false
  readonly warnings: CompilerDiagnostic[] = []
  /** Source map mappings accumulated during codegen. */
  readonly mappings: Mapping[] = []
  /** Tracks the current output line number (0-based). */
  private outputLine = 0

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

  private pushLines(out: string[], newLines: string[]): void {
    out.push(...newLines)
    this.outputLine += newLines.length
  }

  generateComponent(file: LoomFile): string {
    // Collect styles first to build classMap before generating markup
    if (file.markup) this.collectStyles(file.markup)
    const { cssText, classMap } = collectComponentCSS(this.componentName, this.styleBlocks)
    this.cssText = cssText
    this.classMap = classMap
    this.hasCSSModules = this.styleBlocks.length > 0

    const lines: string[] = []

    // Imports
    this.pushLines(lines, [`import React from 'react'`])
    if (this.hasCSSModules) {
      const cssImportPath = this.options.cssImportPath ?? `./${this.componentName}.module.css`
      this.pushLines(lines, [`import styles from ${JSON.stringify(cssImportPath)}`])
    }

    // Logic zone imports (extracted first)
    const logicImports: string[] = []
    const logicBody: string[] = []

    if (file.logic) {
      for (const l of file.logic.src.split('\n')) {
        if (/^import\s/.test(l.trim())) logicImports.push(l)
        else logicBody.push(l)
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
    const sig = buildReactSignature(this.componentName, file.generics, file.props)
    this.pushLines(lines, [sig.open])
    if (sig.destructure) {
      this.pushLines(lines, [`  ${sig.destructure}`, ''])
    }

    // Logic body
    if (logicBody.length > 0) {
      const trimmed = trimLeadingBlank(logicBody)
      this.pushLines(lines, [...trimmed.map(l => `  ${l}`), ''])
    }

    // Markup
    this.pushLines(lines, ['  return ('])
    if (file.markup && file.markup.length > 0) {
      const markupLines = this.renderMarkupList(file.markup, '    ')
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

  renderMarkupList(nodes: MarkupNode[], indent: string): string[] {
    const filtered = nodes.filter(n => n.kind !== 'comment')

    if (filtered.length === 0) return [`${indent}<></>`]
    if (filtered.length === 1) return this.renderNode(filtered[0], indent)

    // Multiple root nodes → wrap in Fragment
    const lines: string[] = []
    lines.push(`${indent}<>`)
    for (const node of filtered) {
      lines.push(...this.renderNode(node, indent + '  '))
    }
    lines.push(`${indent}</>`)
    return lines
  }

  private renderNode(node: MarkupNode, indent: string): string[] {
    const lines = this.renderNodeInner(node, indent)
    if (lines.length > 0 && node.span) {
      this.mappings.push({
        genLine: this.outputLine,
        genCol: indent.length,
        srcLine: node.span.start.line - 1,
        srcCol: node.span.start.column - 1,
      })
    }
    this.outputLine += lines.length
    return lines
  }

  private renderNodeInner(node: MarkupNode, indent: string): string[] {
    switch (node.kind) {
      case 'element': return this.renderElement(node, indent)
      case 'text': return this.renderText(node, indent)
      case 'if': return this.renderControl(node, indent)
      case 'each': return this.renderEach(node, indent)
      case 'slot-def': return this.renderSlotDef(node, indent)
      case 'slot-use': return [] // slot-use is handled by parent element
      case 'comment': return [`${indent}{/* ${node.value} */}`]
      default: return []
    }
  }

  private renderElement(node: ElementNode, indent: string): string[] {
    const scopeKey = scopeKeyForElement(node)

    // Resolve tag
    let resolvedTag = node.tag
    let isPolymorphic = false
    let polyExpr = ''

    if (node.tag === 'element') {
      const asAttr = node.data?.find(d => d.kind === 'as')
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

    // id
    if (node.id) attrParts.push(`id="${node.id}"`)

    // Data attributes
    if (node.data) {
      for (const attr of node.data) {
        if (attr.kind === 'as') continue // already handled
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
    const slotChildren = node.children.filter(c => c.kind === 'slot-use') as SlotUseNode[]
    const normalChildren = node.children.filter(c => c.kind !== 'slot-use')

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
      ...slotChildren.filter(s => !s.name).flatMap(s => s.children),
    ]

    const filteredChildren = defaultSlotChildren.filter(c => c.kind !== 'comment')

    const lines: string[] = []

    if (isPolymorphic) {
      // React.createElement(expr, { ...props }, children)
      const propObj = attrParts.length > 0
        ? `{ ${attrParts.map(a => a.trim()).join(', ')} }`
        : 'null'
      if (filteredChildren.length === 0) {
        lines.push(`${indent}{React.createElement(${polyExpr}, ${propObj})}`)
      } else {
        lines.push(`${indent}{React.createElement(${polyExpr}, ${propObj},`)
        for (const child of filteredChildren) {
          lines.push(...this.renderNode(child, indent + '  '))
        }
        lines.push(`${indent})}`)
      }
      return lines
    }

    const fullAttrs = attrsStr + slotProps.join('')

    if (filteredChildren.length === 0) {
      lines.push(`${indent}<${resolvedTag}${fullAttrs} />`)
    } else {
      lines.push(`${indent}<${resolvedTag}${fullAttrs}>`)
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

    if (moduleClass) {
      parts.push(`styles['${moduleClass}']`)
    }

    if (parts.length === 0) return ''

    if (parts.length === 1 && parts[0].startsWith('"')) {
      return `className=${parts[0]}`
    }

    // Mix of string literals and expressions
    const hasExprs = parts.some(p => !p.startsWith('"'))
    if (!hasExprs) {
      return `className="${parts.map(p => p.slice(1, -1)).join(' ')}"`
    }

    return `className={[${parts.join(', ')}].filter(Boolean).join(' ')}`
  }

  private renderText(node: TextNode, indent: string): string[] {
    // Text with inline HTML — wrap in a span with dangerouslySetInnerHTML?
    // Per spec: "raw HTML string is treated as JSX literal"
    // We check if it contains HTML tags
    if (/<[a-z][\s\S]*?>/i.test(node.value)) {
      // Has HTML tags — emit as JSX literal by wrapping in a fragment
      // We emit the raw string inside dangerouslySetInnerHTML since JSX can't embed raw HTML
      return [`${indent}<span dangerouslySetInnerHTML={{ __html: ${JSON.stringify(node.value)} }} />`]
    }
    // Plain text — interpolate {} expressions
    const interpolated = node.value.replace(/\{([^}]+)\}/g, (_m, expr) => `{${expr}}`)
    return [`${indent}${interpolated}`]
  }

  private renderControl(node: IfNode | ElseIfNode | ElseNode, indent: string): string[] {
    return this.renderTernary(node, indent)
  }

  private renderTernary(node: ControlNode | ElseNode, indent: string): string[] {
    const lines: string[] = []

    if (node.kind === 'if' || node.kind === 'elseif') {
      const consequentLines = this.renderMarkupList(node.consequent, indent + '  ')
      lines.push(`${indent}{${node.condition} ? (`)
      lines.push(...consequentLines)
      lines.push(`${indent}) : (`)
      if (node.alternate) {
        const altLines = this.renderTernary(node.alternate, indent + '  ')
        lines.push(...altLines)
      } else {
        lines.push(`${indent}  null`)
      }
      lines.push(`${indent})}`)
    } else if (node.kind === 'else') {
      lines.push(...this.renderMarkupList(node.children, indent))
    }

    return lines
  }

  private renderEach(node: EachNode, indent: string): string[] {
    const lines: string[] = []
    const childLines = this.renderMarkupList(node.children, indent + '  ')

    // Extract key from first child's : dimension if available
    let keyExpr = ''
    if (node.children[0]?.kind === 'element') {
      const keyAttr = node.children[0].data?.find(
        d => d.kind === 'dynamic' && d.name === 'key'
      )
      if (keyAttr && keyAttr.kind === 'dynamic') {
        keyExpr = ` key={${keyAttr.expr}}`
      }
    }

    if (!keyExpr) {
      this.warnings.push(...warnMissingLoopKey(node.list, node.span))
    }

    const indexParam = node.index ? `, ${node.index}` : ''
    lines.push(`${indent}{${node.list}.map((${node.item}${indexParam}) => (`)
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
      const lines = this.renderElement(node, '')
      return lines.join('').trim()
    }
    return 'null'
  }
}

// ─── Signature builder ────────────────────────────────────────────────────────

function buildReactSignature(
  name: string,
  generics?: string,
  props?: PropDecl[],
): { open: string; close: string; destructure?: string } {
  const g = generics ? `<${generics}>` : ''
  const propFields = props?.map((prop) => `${prop.name}${prop.defaultValue !== undefined ? '?' : ''}: ${prop.type}`) ?? []
  propFields.push('children?: React.ReactNode')
  const typeAnnotation = `{ ${propFields.join('; ')} }`
  const destructure = props && props.length > 0
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
      return `${attr.name}="${attr.value}"`
    case 'dynamic':
      return `${attr.name}={${attr.expr}}`
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
  const bodyLines = beh.body
    .split('\n')
    .map(l => `    ${l}`)
    .join('\n')

  const modifiers = beh.modifiers

  // Build handler body
  const stmts: string[] = []

  if (modifiers.includes('prevent')) stmts.push('e.preventDefault()')
  if (modifiers.includes('stop')) stmts.push('e.stopPropagation()')

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

  const keyMod = modifiers.find(m => keyModifiers[m.toLowerCase()])
  if (keyMod) {
    const keyValue = keyModifiers[keyMod.toLowerCase()]
    stmts.push(`if (e.key !== '${keyValue}') return`)
  }

  stmts.push(...beh.body.split('\n').filter(l => l.trim()))

  if (stmts.length === 0 && !beh.body.trim()) {
    return `${reactEvent}={() => {}}`
  }

  // Check if we need an event param
  const needsEvent = modifiers.includes('prevent') || modifiers.includes('stop') || keyMod !== undefined || stmts.some(s => /\be\./.test(s))
  const param = needsEvent ? 'e' : '_e'

  const bodyStr = stmts.map(l => `    ${l}`).join('\n')
  return `${reactEvent}={(${param}) => {\n${bodyStr}\n  }}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSimpleNode(node: MarkupNode): boolean {
  return node.kind === 'text'
}

function trimLeadingBlank(lines: string[]): string[] {
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start++
  return lines.slice(start)
}
