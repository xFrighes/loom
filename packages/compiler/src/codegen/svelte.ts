import type {
  LoomFile,
  PropDecl,
  MarkupNode,
  ElementNode,
  DataAttr,
  BehaviorBlock,
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
import { generateCSS, scopeKeyForElement } from './css.js'
import { warnMissingLoopKey } from './warnings.js'
import { buildSourceMap, type Mapping } from '../sourcemap.js'

export class SvelteTarget implements CodegenTarget {
  generate(file: LoomFile, componentName: string, options: TargetGenerateOptions = {}): CompileResult {
    const ctx = new SvelteGenContext(componentName)
    const code = ctx.generateComponent(file)
    const map = options.sourceFile
      ? buildSourceMap(options.sourceFile, options.sourceContent ?? '', ctx.mappings)
      : undefined
    return { code, css: '', map, warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined }
  }
}

class SvelteGenContext {
  private cssBlocks: Array<{ scopeKey: string; block: StyleBlock; className: string }> = []
  readonly warnings: CompilerDiagnostic[] = []
  readonly mappings: Mapping[] = []
  private outputLine = 0

  constructor(private componentName: string) {}

  generateComponent(file: LoomFile): string {
    if (file.markup) this.collectStyles(file.markup)

    const parts: string[] = []

    const push = (...lines: string[]) => {
      parts.push(...lines)
      this.outputLine += lines.length
    }

    // <script lang="ts">
    push('<script lang="ts">')

    if (file.generics) {
      push(`// Generic parameter: ${file.generics}`)
    }

    if (file.props && file.props.length > 0) {
      for (const p of buildSvelteProps(file.props)) {
        push(p)
      }
      push('')
    }

    if (file.logic) {
      if (file.logic.span) {
        this.mappings.push({
          genLine: this.outputLine,
          genCol: 0,
          srcLine: file.logic.span.start.line - 1,
          srcCol: 0,
        })
      }
      push(file.logic.src)
    }

    push('</script>', '')

    // Markup
    if (file.markup && file.markup.length > 0) {
      for (const node of file.markup) {
        push(...this.renderNode(node, ''))
      }
    }

    // <style>
    const allCss = this.cssBlocks.map(b => generateCSS(b.block, b.className)).join('\n\n')
    if (allCss.trim()) {
      push('', '<style>')
      push(allCss)
      push('</style>')
    }

    return parts.join('\n')
  }

  private collectStyles(nodes: MarkupNode[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.kind === 'element') {
        const key = scopeKeyForElement(node)
        if (node.styles && node.styles.length > 0) {
          const className = key.replace(/[^a-zA-Z0-9_-]/g, '_')
          this.cssBlocks.push({ scopeKey: key, block: node.styles, className })
        }
        if (node.children.length > 0) this.collectStyles(node.children)
      } else if (node.kind === 'if') {
        this.collectStyles(node.consequent)
        if (node.alternate) this.collectStylesFromControl(node.alternate)
      } else if (node.kind === 'each') {
        this.collectStyles(node.children)
      }
    }
  }

  private collectStylesFromControl(node: IfNode['alternate'] | ElseNode) {
    if (!node) return
    if (node.kind === 'elseif') {
      this.collectStyles(node.consequent)
      if (node.alternate) this.collectStylesFromControl(node.alternate)
    } else if (node.kind === 'else') {
      this.collectStyles(node.children)
    }
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
      case 'if': return this.renderIf(node, indent)
      case 'each': return this.renderEach(node, indent)
      case 'slot-def': return this.renderSlotDef(node, indent)
      case 'slot-use': return []
      case 'comment': return [`${indent}<!-- ${node.value} -->`]
      default: return []
    }
  }

  private renderElement(node: ElementNode, indent: string): string[] {
    const key = scopeKeyForElement(node)

    // Polymorphic
    const asAttr = node.data?.find(d => d.kind === 'as')
    const isPolymorphic = node.tag === 'element' && asAttr?.kind === 'as'

    let tag = node.tag
    if (isPolymorphic) tag = 'svelte:element'

    const attrs: string[] = []

    if (isPolymorphic && asAttr?.kind === 'as') {
      attrs.push(`this={${asAttr.expr}}`)
    }

    // Classes — Svelte scopes natively
    if (node.classes.length > 0) {
      const cssBlock = this.cssBlocks.find(b => b.scopeKey === key)
      const extraClass = cssBlock ? ` ${cssBlock.className}` : ''
      attrs.push(`class="${node.classes.join(' ')}${extraClass}"`)
    } else {
      const cssBlock = this.cssBlocks.find(b => b.scopeKey === key)
      if (cssBlock) attrs.push(`class="${cssBlock.className}"`)
    }

    if (node.id) attrs.push(`id="${node.id}"`)

    if (node.data) {
      for (const attr of node.data) {
        if (attr.kind === 'as') continue
        attrs.push(renderSvelteDataAttr(attr))
      }
    }

    if (node.behaviors) {
      for (const beh of node.behaviors) {
        attrs.push(renderSvelteBehavior(beh))
      }
    }

    // Slot-use handling
    const slotChildren = node.children.filter(c => c.kind === 'slot-use') as SlotUseNode[]
    const normalChildren = node.children.filter(c => c.kind !== 'slot-use')
    const defaultChildren = [
      ...normalChildren,
      ...slotChildren.filter(s => !s.name).flatMap(s => s.children),
    ].filter(c => c.kind !== 'comment')

    const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
    const lines: string[] = []

    if (defaultChildren.length === 0 && slotChildren.filter(s => s.name).length === 0) {
      lines.push(`${indent}<${tag}${attrsStr} />`)
    } else {
      lines.push(`${indent}<${tag}${attrsStr}>`)

      // Named slots
      for (const slot of slotChildren) {
        if (slot.name) {
          lines.push(`${indent}  <svelte:fragment slot="${slot.name}">`)
          for (const child of slot.children) {
            lines.push(...this.renderNode(child, indent + '    '))
          }
          lines.push(`${indent}  </svelte:fragment>`)
        }
      }

      for (const child of defaultChildren) {
        lines.push(...this.renderNode(child, indent + '  '))
      }

      lines.push(`${indent}</${tag}>`)
    }

    return lines
  }

  private renderText(node: TextNode, indent: string): string[] {
    if (/<[a-z][\s\S]*?>/i.test(node.value)) {
      return [`${indent}<span>{@html ${JSON.stringify(node.value)}}</span>`]
    }
    const interpolated = node.value.replace(/\{([^}]+)\}/g, (_m, expr) => `{${expr}}`)
    return [`${indent}${interpolated}`]
  }

  private renderIf(node: IfNode, indent: string): string[] {
    const lines: string[] = []
    lines.push(`${indent}{#if ${node.condition}}`)
    for (const child of node.consequent) {
      lines.push(...this.renderNode(child, indent + '  '))
    }
    if (node.alternate) {
      lines.push(...this.renderAlt(node.alternate, indent))
    }
    lines.push(`${indent}{/if}`)
    return lines
  }

  private renderAlt(node: IfNode['alternate'], indent: string): string[] {
    if (!node) return []
    const lines: string[] = []
    if (node.kind === 'elseif') {
      lines.push(`${indent}{:else if ${node.condition}}`)
      for (const child of node.consequent) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
      if (node.alternate) lines.push(...this.renderAlt(node.alternate, indent))
    } else if (node.kind === 'else') {
      lines.push(`${indent}{:else}`)
      for (const child of node.children) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
    }
    return lines
  }

  private renderEach(node: EachNode, indent: string): string[] {
    const lines: string[] = []

    let keyExpr = ''
    if (node.children[0]?.kind === 'element') {
      const keyAttr = node.children[0].data?.find(d => d.kind === 'dynamic' && d.name === 'key')
      if (keyAttr?.kind === 'dynamic') keyExpr = keyAttr.expr
    }

    if (!keyExpr) {
      this.warnings.push(...warnMissingLoopKey(node.list, node.span))
    }

    const indexPart = node.index ? `, ${node.index}` : ''
    const keyPart = keyExpr ? ` (${keyExpr})` : ''
    lines.push(`${indent}{#each ${node.list} as ${node.item}${indexPart}${keyPart}}`)
    for (const child of node.children) {
      lines.push(...this.renderNode(child, indent + '  '))
    }
    lines.push(`${indent}{/each}`)
    return lines
  }

  private renderSlotDef(node: SlotDefNode, indent: string): string[] {
    if (node.name) return [`${indent}<slot name="${node.name}" />`]
    return [`${indent}<slot />`]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSvelteProps(props: PropDecl[]): string[] {
  return props.map(p => {
    const type = p.type !== 'any' ? `: ${p.type}` : ''
    const def = p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''
    return `export let ${p.name}${type}${def};`
  })
}

function renderSvelteDataAttr(attr: DataAttr): string {
  switch (attr.kind) {
    case 'static':
      if (attr.value === '') return attr.name
      return `${attr.name}="${attr.value}"`
    case 'dynamic':
      return `${attr.name}={${attr.expr}}`
    case 'spread':
      return `{...${attr.expr}}`
    case 'as':
      return ''
  }
}

function renderSvelteBehavior(beh: BehaviorBlock): string {
  const modifierStr = beh.modifiers.length > 0 ? '|' + beh.modifiers.join('|') : ''
  const event = beh.event.startsWith('on') && beh.event.length > 2
    ? beh.event.slice(2, 3).toLowerCase() + beh.event.slice(3)
    : beh.event

  const bodyLines = beh.body.split('\n').filter(l => l.trim())
  const handler = bodyLines.length === 1
    ? `{() => { ${bodyLines[0].trim()} }}`
    : `{() => { ${bodyLines.map(l => l.trim()).join('; ')} }}`

  return `on:${event}${modifierStr}=${handler}`
}
