import ts from 'typescript'
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
import { collectComponentCSS, scopeKeyForElement, type DynamicStyleBinding } from './css.js'
import { warnMissingLoopKey } from './warnings.js'
import { buildSourceMap, type Mapping } from '../sourcemap.js'

export class VueTarget implements CodegenTarget {
  generate(file: LoomFile, componentName: string, options: TargetGenerateOptions = {}): CompileResult {
    const ctx = new VueGenContext(componentName, options)
    const code = ctx.generateComponent(file)
    const map = options.sourceFile
      ? buildSourceMap(options.sourceFile, options.sourceContent ?? '', ctx.mappings)
      : undefined
    return { code, css: ctx.cssText, map, warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined }
  }
}

class VueGenContext {
  private styleBlocks: Array<{ scopeKey: string; block: StyleBlock }> = []
  private classMap: Map<string, string> = new Map()
  private dynamicStyleMap: Map<string, DynamicStyleBinding[]> = new Map()
  cssText = ''
  readonly warnings: CompilerDiagnostic[] = []
  readonly mappings: Mapping[] = []
  private outputLine = 0

  constructor(private componentName: string, private options: TargetGenerateOptions = {}) {}

  generateComponent(file: LoomFile): string {
    if (file.markup) this.collectStyles(file.markup)
    const { cssText, classMap, dynamicStyleMap } = collectComponentCSS(
      this.componentName,
      this.styleBlocks,
    )
    this.cssText = cssText
    this.classMap = classMap
    this.dynamicStyleMap = dynamicStyleMap

    const parts: string[] = []

    const push = (...lines: string[]) => {
      parts.push(...lines)
      this.outputLine += lines.length
    }

    // <script setup>
    push('<script setup lang="ts">')
    const vueImports = new Set<string>()

    if (file.state && file.state.length > 0) vueImports.add('ref')
    if (file.computed && file.computed.length > 0) vueImports.add('computed')
    if (file.onMount && file.onMount.length > 0) vueImports.add('onMounted')
    if (file.onUpdate && file.onUpdate.length > 0) vueImports.add('onUpdated')
    if (file.onUnmount && file.onUnmount.length > 0) vueImports.add('onUnmounted')

    if (vueImports.size > 0) {
      push(`import { ${[...vueImports].sort().join(', ')} } from 'vue'`)
    }

    if (file.generics) {
      push(`// Generic: ${file.generics}`)
    }

    if (file.props && file.props.length > 0) {
      push(buildVueProps(file.props, file.generics))
    }

    // Reactivity: State
    if (file.state && file.state.length > 0) {
      for (const s of file.state) {
        const type = s.type !== 'any' ? `<${s.type}>` : ''
        const def = s.defaultValue !== undefined ? s.defaultValue : ''
        push(`const ${s.name} = ref${type}(${def})`)
      }
    }

    // Reactivity: Computed
    if (file.computed && file.computed.length > 0) {
      for (const c of file.computed) {
        const transformed = transformVueLogic(c.expr, file)
        push(`const ${c.name} = computed(() => ${transformed})`)
      }
    }

    // Reactivity: Lifecycles
    if (file.onMount && file.onMount.length > 0) {
      push('onMounted(() => {')
      for (const s of file.onMount) {
        push(`  ${transformVueLogic(s.src, file)}`)
      }
      push('})')
    }
    if (file.onUpdate && file.onUpdate.length > 0) {
      push('onUpdated(() => {')
      for (const s of file.onUpdate) {
        push(`  ${transformVueLogic(s.src, file)}`)
      }
      push('})')
    }
    if (file.onUnmount && file.onUnmount.length > 0) {
      push('onUnmounted(() => {')
      for (const s of file.onUnmount) {
        push(`  ${transformVueLogic(s.src, file)}`)
      }
      push('})')
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

    // <template>
    push('<template>')
    if (file.markup && file.markup.length > 0) {
      const filtered = file.markup.filter(n => n.kind !== 'comment')
      if (filtered.length > 1) {
        // Vue 3 supports multiple root nodes natively
        for (const node of filtered) {
          push(...this.renderNode(node, '  ', file))
        }
      } else if (filtered.length === 1) {
        push(...this.renderNode(filtered[0], '  ', file))
      }
    }
    push('</template>', '')

    // <style module> — omitted in SSR mode (server cannot inject styles)
    if (this.cssText.trim() && !this.options.ssr) {
      push('<style module>')
      push(this.cssText)
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

  private renderNode(node: MarkupNode, indent: string, file: LoomFile, locals: Set<string> = new Set()): string[] {
    const lines = this.renderNodeInner(node, indent, file, locals)
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

  private renderNodeInner(node: MarkupNode, indent: string, file: LoomFile, locals: Set<string>): string[] {
    switch (node.kind) {
      case 'element': return this.renderElement(node, indent, file, locals)
      case 'text': return this.renderText(node, indent, file, locals)
      case 'if': return this.renderIf(node, indent, file, locals)
      case 'each': return this.renderEach(node, indent, file, locals)
      case 'slot-def': return this.renderSlotDef(node, indent)
      case 'slot-use': return []
      case 'comment': return [`${indent}<!-- ${node.value} -->`]
      default: return []
    }
  }

  private renderElement(node: ElementNode, indent: string, file: LoomFile, locals: Set<string>, extraAttrs: string[] = []): string[] {
    const scopeKey = scopeKeyForElement(node)

    let tag = node.tag

    // Polymorphic element
    const asAttr = node.data?.find(d => d.kind === 'as')
    if (tag === 'element' && asAttr?.kind === 'as') {
      tag = 'component'
    }

    const attrs: string[] = [...extraAttrs]

    // :is for polymorphic
    if (tag === 'component' && asAttr?.kind === 'as') {
      attrs.push(`:is="${asAttr.expr}"`)
    }

    // class/style
    const classAttr = this.buildClassAttr(node, scopeKey)
    if (classAttr) attrs.push(classAttr)

    const styleAttr = this.buildStyleAttr(scopeKey)
    if (styleAttr) attrs.push(styleAttr)

    if (node.id) attrs.push(`id="${node.id}"`)

    // Data attributes
    if (node.data) {
      for (const attr of node.data) {
        if (attr.kind === 'as') continue
        if (
          (attr.kind === 'static' || attr.kind === 'dynamic' || attr.kind === 'bind') &&
          'name' in attr &&
          (attr.name === 'class' || attr.name === 'id' || attr.name === 'key')
        )
          continue
        attrs.push(renderVueDataAttr(attr, file, locals))
      }
    }

    // Behaviors
    if (node.behaviors) {
      for (const beh of node.behaviors) {
        attrs.push(this.renderVueBehavior(beh, file, locals))
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

      // Named slots as <template #name> or <template #name="{ params }"> for scoped slots
      for (const slot of slotChildren) {
        if (slot.name) {
          const scopeSuffix =
            slot.slotParams && slot.slotParams.length > 0
              ? `="{ ${slot.slotParams.join(', ')} }"`
              : ''
          const slotLocals = new Set(locals)
          if (slot.slotParams) {
            for (const p of slot.slotParams) slotLocals.add(p)
          }
          lines.push(`${indent}  <template #${slot.name}${scopeSuffix}>`)
          for (const child of slot.children) {
            lines.push(...this.renderNode(child, indent + '    ', file, slotLocals))
          }
          lines.push(`${indent}  </template>`)
        }
      }

      for (const child of filteredChildren) {
        lines.push(...this.renderNode(child, indent + '  ', file, locals))
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

  private buildStyleAttr(scopeKey: string): string {
    const bindings = this.dynamicStyleMap.get(scopeKey)
    if (!bindings || bindings.length === 0) return ''

    const objectEntries = bindings.map((binding) => `'${binding.cssVar}': ${binding.expr}`)
    return `:style="{ ${objectEntries.join(', ')} }"`
  }

  private renderText(node: TextNode, indent: string, file: LoomFile, locals: Set<string>): string[] {
    if (/<[a-z][\s\S]*?>/i.test(node.value)) {
      return [`${indent}<span v-html="${escapeHtmlAttr(JSON.stringify(node.value))}" />`]
    }
    const interpolated = node.value.replace(/\{([^}]+)\}/g, (_m, expr) => `{{ ${transformVueLogic(expr, file, locals)} }}`)
    return [`${indent}${interpolated}`]
  }

  private renderIf(node: IfNode | ElseIfNode, indent: string, file: LoomFile, locals: Set<string>): string[] {
    const lines: string[] = []
    const directive = node.kind === 'if' ? 'v-if' : 'v-else-if'
    const condition = transformVueLogic(node.condition, file, locals)

    if (node.consequent.length === 1) {
      // Attach directive directly to element if single child
      const child = node.consequent[0]
      if (child.kind === 'element') {
        lines.push(...this.renderElement(child, indent, file, locals, [`${directive}="${condition}"`]))
      } else {
        lines.push(`${indent}<template ${directive}="${condition}">`)
        lines.push(...this.renderNode(child, indent + '  ', file, locals))
        lines.push(`${indent}</template>`)
      }
    } else {
      lines.push(`${indent}<template ${directive}="${condition}">`)
      for (const child of node.consequent) {
        lines.push(...this.renderNode(child, indent + '  ', file, locals))
      }
      lines.push(`${indent}</template>`)
    }

    if (node.alternate) {
      if (node.alternate.kind === 'elseif') {
        lines.push(...this.renderIf(node.alternate, indent, file, locals))
      } else if (node.alternate.kind === 'else') {
        lines.push(...this.renderElse(node.alternate, indent, file, locals))
      }
    }

    return lines
  }

  private renderElse(node: ElseNode, indent: string, file: LoomFile, locals: Set<string>): string[] {
    const lines: string[] = []
    if (node.children.length === 1) {
      const child = node.children[0]
      if (child.kind === 'element') {
        lines.push(...this.renderElement(child, indent, file, locals, ['v-else']))
      } else {
        lines.push(`${indent}<template v-else>`)
        lines.push(...this.renderNode(child, indent + '  ', file, locals))
        lines.push(`${indent}</template>`)
      }
    } else {
      lines.push(`${indent}<template v-else>`)
      for (const child of node.children) {
        lines.push(...this.renderNode(child, indent + '  ', file, locals))
      }
      lines.push(`${indent}</template>`)
    }
    return lines
  }

  private renderEach(node: EachNode, indent: string, file: LoomFile, locals: Set<string>): string[] {
    const lines: string[] = []

    // Extract key from first child
    let keyExpr = ''
    if (node.children[0]?.kind === 'element') {
      const keyAttr = node.children[0].data?.find(d => d.kind === 'dynamic' && d.name === 'key')
      if (keyAttr?.kind === 'dynamic') keyExpr = transformVueLogic(keyAttr.expr, file, locals)
    }

    if (!keyExpr) {
      this.warnings.push(...warnMissingLoopKey(node.list, node.span))
    }

    const indexPart = node.index ? `, ${node.index}` : ''
    const list = transformVueLogic(node.list, file, locals)
    const extraAttrs = [`v-for="(${node.item}${indexPart}) in ${list}"`]
    if (keyExpr) extraAttrs.push(`:key="${keyExpr}"`)

    const nextLocals = new Set(locals)
    nextLocals.add(node.item)
    if (node.index) nextLocals.add(node.index)

    if (node.children.length === 1 && node.children[0].kind === 'element') {
      lines.push(...this.renderElement(node.children[0] as ElementNode, indent, file, nextLocals, extraAttrs))
    } else {
      lines.push(`${indent}<template ${extraAttrs.join(' ')}>`)
      for (const child of node.children) {
        lines.push(...this.renderNode(child, indent + '  ', file, nextLocals))
      }
      lines.push(`${indent}</template>`)
    }

    return lines
  }

  private renderSlotDef(node: SlotDefNode, indent: string): string[] {
    if (node.name) {
      if (node.params && node.params.length > 0) {
        // Scoped slot: expose params as slot props
        const slotAttrs = node.params.map((p) => `:${p}="${p}"`).join(' ')
        return [`${indent}<slot name="${node.name}" ${slotAttrs} />`]
      }
      return [`${indent}<slot name="${node.name}" />`]
    }
    return [`${indent}<slot />`]
  }

  private renderVueBehavior(beh: BehaviorBlock, file: LoomFile, locals: Set<string>): string {
    const modifierStr = beh.modifiers.length > 0 ? '.' + beh.modifiers.join('.') : ''
    const event =
      beh.event.startsWith('on') && beh.event.length > 2
        ? beh.event.slice(2, 3).toLowerCase() + beh.event.slice(3) // onClick → click (but already stripped @)
        : beh.event

    const fullBody = beh.body.map((s) => s.src).join('\n')
    const transformed = transformVueLogic(fullBody, file, locals)
    const bodyLines = transformed.split('\n').filter((l) => l.trim())
    const handler =
      bodyLines.length === 1
        ? `"${bodyLines[0].trim()}"`
        : `"() => { ${bodyLines.map((l) => l.trim()).join('; ')} }"`

    return `@${event}${modifierStr}=${handler}`
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function transformVueLogic(src: string, file: LoomFile, additionalLocals: Set<string> = new Set()): string {
  const stateNames = new Set(file.state?.map((s) => s.name) ?? [])
  if (stateNames.size === 0) return src

  const sourceFile = ts.createSourceFile('logic.ts', src, ts.ScriptTarget.Latest, true)
  const replacements: Array<{ start: number; end: number; text: string }> = []
  const scopeStack: Array<Set<string>> = [new Set(additionalLocals)]

  const isShadowed = (name: string) => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return true
    }
    return false
  }

  const visit = (node: ts.Node) => {
    let pushedScope = false
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
      scopeStack.push(new Set())
      pushedScope = true
    }

    // Track declarations
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      scopeStack[scopeStack.length - 1].add(node.name.text)
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      scopeStack[scopeStack.length - 1].add(node.name.text)
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      scopeStack[scopeStack.length - 1].add(node.name.text)
    }

    if (ts.isIdentifier(node) && stateNames.has(node.text) && !isShadowed(node.text)) {
      // Ensure it's not a property name in a member access, e.g. obj.count
      const parent = node.parent
      if (parent) {
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
          // It's the property name, don't transform
        } else if (ts.isBindingElement(parent) && parent.name === node) {
          // It's a binding name, don't transform
        } else if (ts.isPropertyAssignment(parent) && parent.name === node) {
          // It's a property assignment key, don't transform
        } else {
          replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: `${node.text}.value` })
        }
      } else {
        replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: `${node.text}.value` })
      }
    }
    ts.forEachChild(node, visit)
    if (pushedScope) scopeStack.pop()
  }

  visit(sourceFile)

  // Sort backwards to avoid offset issues
  replacements.sort((a, b) => b.start - a.start)

  let out = src
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end)
  }

  return out
}

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

function renderVueDataAttr(attr: DataAttr, file: LoomFile, locals: Set<string>): string {
  switch (attr.kind) {
    case 'static':
      if (attr.value === '') return attr.name
      return `${attr.name}="${escapeHtmlAttr(attr.value)}"`
    case 'dynamic':
      return `:${attr.name}="${transformVueLogic(attr.expr, file, locals)}"`
    case 'spread':
      return `v-bind="${transformVueLogic(attr.expr, file, locals)}"`
    case 'as':
      return ''
    case 'bind': {
      const expr = transformVueLogic(attr.expr, file, locals)
      // Use v-model:name for named binding; v-model for "value" (common convention)
      return attr.name === 'value' || attr.name === 'modelValue'
        ? `v-model="${expr}"`
        : `v-model:${attr.name}="${expr}"`
    }
  }
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getTagName(tag: string): string {
  if (tag === 'element') return 'component'
  return tag
}
