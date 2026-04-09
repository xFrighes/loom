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
import { collectComponentCSS, scopeKeyForElement } from './css.js'

export class VueTarget implements CodegenTarget {
  generate(file: LoomFile, componentName: string, _options: TargetGenerateOptions = {}): CompileResult {
    const ctx = new VueGenContext(componentName)
    const code = ctx.generateComponent(file)
    return { code, css: ctx.cssText }
  }
}

class VueGenContext {
  private styleBlocks: Array<{ scopeKey: string; block: StyleBlock }> = []
  private classMap: Map<string, string> = new Map()
  cssText = ''

  constructor(private componentName: string) {}

  generateComponent(file: LoomFile): string {
    if (file.markup) this.collectStyles(file.markup)
    const { cssText, classMap } = collectComponentCSS(this.componentName, this.styleBlocks)
    this.cssText = cssText
    this.classMap = classMap

    const parts: string[] = []

    // <script setup>
    parts.push('<script setup lang="ts">')

    if (file.generics) {
      parts.push(`// Generic: ${file.generics}`)
    }

    if (file.props && file.props.length > 0) {
      parts.push(buildVueProps(file.props, file.generics))
    }

    if (file.logic) {
      parts.push(file.logic.src)
    }

    parts.push('</script>')
    parts.push('')

    // <template>
    parts.push('<template>')
    if (file.markup && file.markup.length > 0) {
      const filtered = file.markup.filter(n => n.kind !== 'comment')
      if (filtered.length > 1) {
        // Vue 3 supports multiple root nodes natively
        for (const node of filtered) {
          parts.push(...this.renderNode(node, '  '))
        }
      } else if (filtered.length === 1) {
        parts.push(...this.renderNode(filtered[0], '  '))
      }
    }
    parts.push('</template>')
    parts.push('')

    // <style module>
    if (this.cssText.trim()) {
      parts.push('<style module>')
      parts.push(this.cssText)
      parts.push('</style>')
    }

    return parts.join('\n')
  }

  private collectStyles(nodes: MarkupNode[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.kind === 'element') {
        const key = scopeKeyForElement(node)
        if (node.styles && node.styles.length > 0) {
          this.styleBlocks.push({ scopeKey: key, block: node.styles })
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
    const scopeKey = scopeKeyForElement(node)

    let tag = node.tag

    // Polymorphic element
    const asAttr = node.data?.find(d => d.kind === 'as')
    if (tag === 'element' && asAttr?.kind === 'as') {
      tag = 'component'
    }

    const attrs: string[] = []

    // :is for polymorphic
    if (tag === 'component' && asAttr?.kind === 'as') {
      attrs.push(`:is="${asAttr.expr}"`)
    }

    // class/style
    const classAttr = this.buildClassAttr(node, scopeKey)
    if (classAttr) attrs.push(classAttr)

    if (node.id) attrs.push(`id="${node.id}"`)

    // Data attributes
    if (node.data) {
      for (const attr of node.data) {
        if (attr.kind === 'as') continue
        attrs.push(renderVueDataAttr(attr))
      }
    }

    // Behaviors
    if (node.behaviors) {
      for (const beh of node.behaviors) {
        attrs.push(renderVueBehavior(beh))
      }
    }

    // Separate slot-use children
    const slotChildren = node.children.filter(c => c.kind === 'slot-use') as SlotUseNode[]
    const normalChildren = node.children.filter(c => c.kind !== 'slot-use')
    const defaultSlotChildren = [
      ...normalChildren,
      ...slotChildren.filter(s => !s.name).flatMap(s => s.children),
    ]
    const filteredChildren = defaultSlotChildren.filter(c => c.kind !== 'comment')

    const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
    const lines: string[] = []

    if (filteredChildren.length === 0 && slotChildren.filter(s => s.name).length === 0) {
      lines.push(`${indent}<${tag}${attrsStr} />`)
    } else {
      lines.push(`${indent}<${tag}${attrsStr}>`)

      // Named slots as <template #name>
      for (const slot of slotChildren) {
        if (slot.name) {
          lines.push(`${indent}  <template #${slot.name}>`)
          for (const child of slot.children) {
            lines.push(...this.renderNode(child, indent + '    '))
          }
          lines.push(`${indent}  </template>`)
        }
      }

      for (const child of filteredChildren) {
        lines.push(...this.renderNode(child, indent + '  '))
      }

      lines.push(`${indent}</${tag}>`)
    }

    return lines
  }

  private buildClassAttr(node: ElementNode, scopeKey: string): string {
    const moduleClass = this.classMap.get(scopeKey)
    const parts: string[] = []
    if (moduleClass) {
      parts.push(`$style['${moduleClass}']`)
    }

    if (node.classes.length > 0 && !moduleClass) {
      return `class="${node.classes.join(' ')}"`
    }

    if (node.classes.length > 0 && moduleClass) {
      return `:class="['${node.classes.join(' ')}', ${parts[0]}]"`
    }

    if (parts.length === 0) return ''
    if (parts.length === 1) return `:class="${parts[0]}"`
    return `:class="[${parts.join(', ')}]"`
  }

  private renderText(node: TextNode, indent: string): string[] {
    if (/<[a-z][\s\S]*?>/i.test(node.value)) {
      return [`${indent}<span v-html="${escapeAttr(node.value)}" />`]
    }
    const interpolated = node.value.replace(/\{([^}]+)\}/g, (_m, expr) => `{{ ${expr} }}`)
    return [`${indent}${interpolated}`]
  }

  private renderIf(node: IfNode | ElseIfNode, indent: string): string[] {
    const lines: string[] = []
    const directive = node.kind === 'if' ? 'v-if' : 'v-else-if'

    if (node.consequent.length === 1) {
      // Attach directive directly to element if single child
      const child = node.consequent[0]
      if (child.kind === 'element') {
        const childLines = this.renderElement(child, indent)
        // Inject directive into first opening tag
        const first = childLines[0].replace('<' + getTagName(child.tag), `<${getTagName(child.tag)} ${directive}="${node.condition}"`)
        lines.push(first, ...childLines.slice(1))
      } else {
        lines.push(`${indent}<template ${directive}="${node.condition}">`)
        lines.push(...this.renderNode(child, indent + '  '))
        lines.push(`${indent}</template>`)
      }
    } else {
      lines.push(`${indent}<template ${directive}="${node.condition}">`)
      for (const child of node.consequent) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
      lines.push(`${indent}</template>`)
    }

    if (node.alternate) {
      if (node.alternate.kind === 'elseif') {
        lines.push(...this.renderIf(node.alternate, indent))
      } else if (node.alternate.kind === 'else') {
        lines.push(...this.renderElse(node.alternate, indent))
      }
    }

    return lines
  }

  private renderElse(node: ElseNode, indent: string): string[] {
    const lines: string[] = []
    if (node.children.length === 1) {
      const child = node.children[0]
      if (child.kind === 'element') {
        const childLines = this.renderElement(child, indent)
        const first = childLines[0].replace('<' + getTagName(child.tag), `<${getTagName(child.tag)} v-else`)
        lines.push(first, ...childLines.slice(1))
      } else {
        lines.push(`${indent}<template v-else>`)
        lines.push(...this.renderNode(child, indent + '  '))
        lines.push(`${indent}</template>`)
      }
    } else {
      lines.push(`${indent}<template v-else>`)
      for (const child of node.children) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
      lines.push(`${indent}</template>`)
    }
    return lines
  }

  private renderEach(node: EachNode, indent: string): string[] {
    const lines: string[] = []

    // Extract key from first child
    let keyExpr = ''
    if (node.children[0]?.kind === 'element') {
      const keyAttr = node.children[0].data?.find(d => d.kind === 'dynamic' && d.name === 'key')
      if (keyAttr?.kind === 'dynamic') keyExpr = keyAttr.expr
    }

    const indexPart = node.index ? `, ${node.index}` : ''
    const vFor = `v-for="(${node.item}${indexPart}) in ${node.list}"`
    const vKey = keyExpr ? ` :key="${keyExpr}"` : ''

    if (node.children.length === 1 && node.children[0].kind === 'element') {
      const child = node.children[0] as ElementNode
      const childLines = this.renderElement(child, indent)
      const first = childLines[0].replace(
        '<' + getTagName(child.tag),
        `<${getTagName(child.tag)} ${vFor}${vKey}`,
      )
      lines.push(first, ...childLines.slice(1))
    } else {
      lines.push(`${indent}<template ${vFor}${vKey}>`)
      for (const child of node.children) {
        lines.push(...this.renderNode(child, indent + '  '))
      }
      lines.push(`${indent}</template>`)
    }

    return lines
  }

  private renderSlotDef(node: SlotDefNode, indent: string): string[] {
    if (node.name) return [`${indent}<slot name="${node.name}" />`]
    return [`${indent}<slot />`]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildVueProps(props: PropDecl[], generics?: string): string {
  const typeFields = props.map(p => `  ${p.name}${p.defaultValue !== undefined ? '?' : ''}: ${p.type}`).join('\n')
  const g = generics ? `<${generics}>` : ''
  const lines = [`const props = withDefaults(defineProps${g}<{`]
  lines.push(typeFields)
  lines.push(`}>(), {`)
  const defaults = props.filter(p => p.defaultValue !== undefined)
  for (const p of defaults) {
    lines.push(`  ${p.name}: ${p.defaultValue},`)
  }
  lines.push('})')
  return lines.join('\n')
}

function renderVueDataAttr(attr: DataAttr): string {
  switch (attr.kind) {
    case 'static':
      if (attr.value === '') return attr.name
      return `${attr.name}="${attr.value}"`
    case 'dynamic':
      return `:${attr.name}="${attr.expr}"`
    case 'spread':
      return `v-bind="${attr.expr}"`
    case 'as':
      return ''
  }
}

function renderVueBehavior(beh: BehaviorBlock): string {
  const modifierStr = beh.modifiers.length > 0 ? '.' + beh.modifiers.join('.') : ''
  const event = beh.event.startsWith('on') && beh.event.length > 2
    ? beh.event.slice(2, 3).toLowerCase() + beh.event.slice(3) // onClick → click (but already stripped @)
    : beh.event

  const bodyLines = beh.body.split('\n').filter(l => l.trim())
  const handler = bodyLines.length === 1
    ? `"${bodyLines[0].trim()}"`
    : `"() => { ${bodyLines.map(l => l.trim()).join('; ')} }"`

  return `@${event}${modifierStr}=${handler}`
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function getTagName(tag: string): string {
  if (tag === 'element') return 'component'
  return tag
}
