import type {
  BehaviorBlock,
  ControlNode,
  DataAttr,
  ElementNode,
  LogicStatement,
  LoomFile,
  MarkupNode,
  PropDecl,
  StateDecl,
  ComputedDecl,
  SourceSpan,
} from './ast.js'
import { isAssignableBindingExpression } from './codegen/bindings.js'

export type DiagnosticSeverity = 'error' | 'warning'
export type DiagnosticSource = 'parser' | 'validator' | 'codegen' | 'bundler' | 'doctor'

export type CompilerDiagnostic = {
  code: string
  severity: DiagnosticSeverity
  message: string
  span: SourceSpan
  suggestion?: string
  source?: DiagnosticSource
}

export type ValidateOptions = {
  strictA11y?: boolean
  security?: boolean
}

const KNOWN_MODIFIERS = new Set([
  'prevent',
  'stop',
  'self',
  'once',
  'capture',
  'passive',
  'enter',
  'escape',
  'tab',
  'space',
  'delete',
  'backspace',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
])

const KEY_MODIFIERS = new Set([
  'enter',
  'escape',
  'tab',
  'space',
  'delete',
  'backspace',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
])

function diagnostic(
  code: string,
  message: string,
  span: SourceSpan | undefined,
  severity: DiagnosticSeverity = 'error',
): CompilerDiagnostic[] {
  return span ? [{ code, severity, message, span, source: 'validator', suggestion: suggestFix(code) }] : []
}

function isComponentLikeTag(tag: string): boolean {
  return tag === 'element' || /^[A-Z]/.test(tag)
}

export function hasErrors(diagnostics: CompilerDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

export function formatDiagnostic(diagnostic: CompilerDiagnostic): string {
  const { line, column } = diagnostic.span.start
  const suggestion = diagnostic.suggestion ? ` Suggestion: ${diagnostic.suggestion}` : ''
  return `${diagnostic.code} ${line}:${column} ${diagnostic.message}${suggestion}`
}

function suggestFix(code: string): string | undefined {
  switch (code) {
    case 'loom/duplicate-attr':
      return 'Remove one duplicate attribute or merge the dynamic expression.'
    case 'loom/control-flow-placement':
      return 'Move else/else-if directly after an if or else-if sibling.'
    case 'loom/slot-use':
      return 'Move named slot content inside a component-like element.'
    case 'loom/prop-type':
      return 'Add an explicit TypeScript type to this prop.'
    case 'loom/state-type':
      return 'Add an explicit TypeScript type to this state declaration.'
    case 'loom/computed-expr':
      return 'Add an expression after the computed declaration.'
    case 'loom/a11y-label':
      return 'Add visible text, an associated label, or aria-label.'
    case 'loom/a11y-role':
      return 'Use a valid ARIA role or remove the role attribute.'
    case 'loom/a11y-keyboard':
      return 'Add @keydown.enter or @keyup.enter handling.'
    case 'loom/security-unsafe-html':
      return 'Sanitize HTML first or avoid raw HTML sinks.'
    case 'loom/security-url':
      return 'Use http, https, mailto, tel, or a routed internal URL.'
    case 'loom/security-expression':
      return 'Replace eval or Function with explicit typed logic.'
    case 'loom/bind-expression':
      return 'Use a writable identifier or member path, such as value, form.email, or items[index].name.'
    case 'loom/void-element-children':
      return 'Move nested content to a sibling element or wrap it in a non-void parent.'
    case 'loom/reactivity-mutation':
      return 'Use direct state assignment, ++, --, or compound assignment; move advanced mutations into target-specific logic.'
    default:
      if (code.endsWith('-name')) return 'Use a valid JavaScript identifier.'
      return undefined
  }
}

export function validate(file: LoomFile, options: ValidateOptions = {}): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  for (const prop of file.props ?? []) {
    diagnostics.push(...validateProp(prop))
  }

  for (const state of file.state ?? []) {
    diagnostics.push(...validateState(state))
  }

  for (const computed of file.computed ?? []) {
    diagnostics.push(...validateComputed(computed))
  }

  diagnostics.push(...validatePortableReactivity(file))
  diagnostics.push(...validateMarkupList(file.markup ?? [], undefined, options))

  return diagnostics
}

function validateIdentifier(name: string, label: string, span: SourceSpan | undefined): CompilerDiagnostic[] {
  if (!name) {
    return diagnostic(`loom/${label}-name`, `${capitalize(label)} name cannot be empty.`, span)
  }

  if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
    return diagnostic(`loom/${label}-name`, `Invalid ${label} name "${name}".`, span)
  }

  return []
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function validateProp(prop: PropDecl): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  diagnostics.push(...validateIdentifier(prop.name, 'prop', prop.span))

  if (!prop.type.trim()) {
    diagnostics.push(...diagnostic('loom/prop-type', `Prop "${prop.name || '<anonymous>'}" must declare a type.`, prop.span))
  }

  return diagnostics
}

function validateState(state: StateDecl): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  diagnostics.push(...validateIdentifier(state.name, 'state', state.span))

  if (!state.type.trim()) {
    diagnostics.push(...diagnostic('loom/state-type', `State "${state.name || '<anonymous>'}" must declare a type.`, state.span))
  }

  return diagnostics
}

function validateComputed(computed: ComputedDecl): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  diagnostics.push(...validateIdentifier(computed.name, 'computed', computed.span))

  if (!computed.expr.trim()) {
    diagnostics.push(...diagnostic('loom/computed-expr', `Computed "${computed.name || '<anonymous>'}" must declare an expression.`, computed.span))
  }

  return diagnostics
}

function validateMarkupList(
  nodes: MarkupNode[],
  parentElement: ElementNode | undefined,
  options: ValidateOptions,
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  let previousControl: ControlNode | undefined

  for (const node of nodes) {
    if (node.kind === 'elseif' || node.kind === 'else') {
      if (!previousControl || (previousControl.kind !== 'if' && previousControl.kind !== 'elseif')) {
        diagnostics.push(...diagnostic(
          'loom/control-flow-placement',
          `"${node.kind === 'elseif' ? 'else if' : 'else'}" must immediately follow "if" or "else if".`,
          node.span,
        ))
      }
    }

    diagnostics.push(...validateNode(node, parentElement, options))

    previousControl = node.kind === 'if' || node.kind === 'elseif' ? node : undefined
  }

  return diagnostics
}

function validateNode(
  node: MarkupNode,
  parentElement: ElementNode | undefined,
  options: ValidateOptions,
): CompilerDiagnostic[] {
  switch (node.kind) {
    case 'element':
      return validateElement(node, options)
    case 'if':
      return validateMarkupList(node.consequent, parentElement, options).concat(
        node.alternate ? validateNode(node.alternate, parentElement, options) : [],
      )
    case 'elseif':
      return validateMarkupList(node.consequent, parentElement, options).concat(
        node.alternate ? validateNode(node.alternate, parentElement, options) : [],
      )
    case 'else':
      return validateMarkupList(node.children, parentElement, options)
    case 'each':
      return validateMarkupList(node.children, parentElement, options)
    case 'slot-use':
      return !parentElement || !isComponentLikeTag(parentElement.tag)
        ? diagnostic('loom/slot-use', 'Named slot content can only appear inside component-like elements.', node.span)
        : []
    default:
      return []
  }
}

function validateElement(node: ElementNode, options: ValidateOptions): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  if (VOID_ELEMENTS.has(node.tag) && node.children.some((child) => child.kind !== 'comment')) {
    diagnostics.push(...diagnostic(
      'loom/void-element-children',
      `Void element "${node.tag}" cannot contain child markup. This usually means a sibling is indented too far.`,
      node.span,
    ))
  }

  if (node.data) {
    diagnostics.push(...validateAttrs(node.data))
    if (options.security) diagnostics.push(...scanSecurityAttrs(node))
  }

  for (const behavior of node.behaviors ?? []) {
    diagnostics.push(...validateBehavior(behavior))
    if (options.security) diagnostics.push(...scanSecurityBehavior(behavior))
  }

  if (options.strictA11y) {
    diagnostics.push(...validateA11yElement(node))
  }

  diagnostics.push(...validateMarkupList(node.children, node, options))

  return diagnostics
}

function validatePortableReactivity(file: LoomFile): CompilerDiagnostic[] {
  const stateNames = new Set((file.state ?? []).map((state) => state.name).filter(Boolean))
  if (stateNames.size === 0) return []

  const diagnostics: CompilerDiagnostic[] = []
  for (const statement of collectLogicStatements(file)) {
    diagnostics.push(...scanStateMutation(statement.src, stateNames, statement.span))
  }
  return diagnostics
}

function collectLogicStatements(file: LoomFile): LogicStatement[] {
  const statements: LogicStatement[] = []
  statements.push(...(file.logic?.statements ?? []))
  statements.push(...(file.onMount ?? []))
  statements.push(...(file.onUpdate ?? []))
  statements.push(...(file.onUnmount ?? []))
  collectMarkupLogic(file.markup ?? [], statements)
  return statements
}

function collectMarkupLogic(nodes: MarkupNode[], statements: LogicStatement[]): void {
  for (const node of nodes) {
    if (node.kind === 'element') {
      for (const behavior of node.behaviors ?? []) {
        statements.push(...behavior.body)
      }
      collectMarkupLogic(node.children, statements)
    } else if (node.kind === 'if' || node.kind === 'elseif') {
      collectMarkupLogic(node.consequent, statements)
      if (node.alternate) collectMarkupLogic([node.alternate], statements)
    } else if (node.kind === 'else') {
      collectMarkupLogic(node.children, statements)
    } else if (node.kind === 'each') {
      collectMarkupLogic(node.children, statements)
    }
  }
}

function scanStateMutation(
  src: string,
  stateNames: Set<string>,
  span: SourceSpan | undefined,
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const mutatingMethods = 'copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift'

  for (const name of stateNames) {
    const escaped = escapeRegExp(name)
    const memberAssignment = new RegExp(`\\b${escaped}\\s*\\.\\s*[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*\\s*(?:=|[+\\-*/%&|^?]{1,3}=)`)
    const mutatingCall = new RegExp(`\\b${escaped}\\s*\\.\\s*(?:${mutatingMethods})\\s*\\(`)

    if (memberAssignment.test(src) || mutatingCall.test(src)) {
      diagnostics.push(...diagnostic(
        'loom/reactivity-mutation',
        `State "${name}" is mutated through a member path or mutating method that is not portable across targets.`,
        span,
        'warning',
      ))
    }
  }

  return diagnostics
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function validateA11yElement(node: ElementNode): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const ariaLabel = findAttr(node, 'aria-label')
  const labelLike = hasTextChild(node) || Boolean(ariaLabel)

  if ((node.tag === 'button' || node.tag === 'input' || node.tag === 'select' || node.tag === 'textarea') && !labelLike) {
    diagnostics.push(...diagnostic(
      'loom/a11y-label',
      `Interactive "${node.tag}" must have visible text or aria-label.`,
      node.span,
    ))
  }

  const role = findAttrValue(node, 'role')
  if (role && !KNOWN_ARIA_ROLES.has(role)) {
    diagnostics.push(...diagnostic(
      'loom/a11y-role',
      `Unknown ARIA role "${role}".`,
      node.span,
    ))
  }

  const hasClick = (node.behaviors ?? []).some((behavior) => behavior.event === 'click')
  const hasKeyboard = (node.behaviors ?? []).some((behavior) => behavior.event === 'keydown' || behavior.event === 'keyup')
  if (role === 'button' && hasClick && !hasKeyboard) {
    diagnostics.push(...diagnostic(
      'loom/a11y-keyboard',
      'role="button" with click handling must also handle keyboard activation.',
      node.span,
    ))
  }

  return diagnostics
}

function scanSecurityAttrs(node: ElementNode): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  for (const attr of node.data ?? []) {
    if (attr.kind === 'spread' || attr.kind === 'as') continue
    const name = attr.name.toLowerCase()
    const value = attr.kind === 'static' ? attr.value : attr.expr
    if (name === 'innerhtml' || name === 'dangerouslysetinnerhtml' || name === 'v-html') {
      diagnostics.push(...diagnostic(
        'loom/security-unsafe-html',
        `Unsafe HTML sink "${attr.name}" must be sanitized before codegen.`,
        attr.span,
      ))
    }
    if ((name === 'href' || name === 'src') && /javascript:/i.test(value)) {
      diagnostics.push(...diagnostic(
        'loom/security-url',
        `Unsafe javascript: URL in "${attr.name}".`,
        attr.span,
      ))
    }
  }
  return diagnostics
}

function scanSecurityBehavior(behavior: BehaviorBlock): CompilerDiagnostic[] {
  const source = behavior.body.map((statement) => statement.src).join('\n')
  if (/\b(eval|Function)\s*\(/.test(source)) {
    return diagnostic(
      'loom/security-expression',
      'Event handler uses eval or Function constructor.',
      behavior.span,
    )
  }
  return []
}

function validateAttrs(attrs: DataAttr[]): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const seenNames = new Map<string, DataAttr>()
  let asAttr: DataAttr | undefined

  for (const attr of attrs) {
    if (attr.kind === 'spread') continue

    if (attr.kind === 'as') {
      if (asAttr) {
        diagnostics.push(...diagnostic('loom/duplicate-attr', 'Duplicate "as" binding.', attr.span))
      }
      asAttr = attr
      continue
    }

    if (attr.kind === 'bind' && !isAssignableBindingExpression(attr.expr)) {
      diagnostics.push(...diagnostic(
        'loom/bind-expression',
        `bind:${attr.name} must target a writable identifier or member path, not "${attr.expr}".`,
        attr.span,
      ))
    }

    const existing = seenNames.get(attr.name)
    if (existing) {
      diagnostics.push(...diagnostic('loom/duplicate-attr', `Duplicate attribute "${attr.name}".`, attr.span))
      continue
    }
    seenNames.set(attr.name, attr)
  }

  return diagnostics
}

function validateBehavior(behavior: BehaviorBlock): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const normalized = behavior.modifiers.map((modifier) => modifier.toLowerCase())
  const keyModifiers = normalized.filter((modifier) => KEY_MODIFIERS.has(modifier))

  for (const modifier of normalized) {
    if (!KNOWN_MODIFIERS.has(modifier)) {
      diagnostics.push(...diagnostic(
        'loom/unsupported-modifier',
        `Unsupported event modifier "${modifier}".`,
        behavior.span,
      ))
    }
  }

  if (normalized.includes('passive') && normalized.includes('prevent')) {
    diagnostics.push(...diagnostic(
      'loom/incompatible-modifiers',
      'Event modifiers "passive" and "prevent" cannot be used together.',
      behavior.span,
    ))
  }

  if (keyModifiers.length > 1) {
    diagnostics.push(...diagnostic(
      'loom/incompatible-modifiers',
      `Only one key modifier is allowed, received ${keyModifiers.join(', ')}.`,
      behavior.span,
    ))
  }

  return diagnostics
}

const KNOWN_ARIA_ROLES = new Set([
  'alert',
  'button',
  'checkbox',
  'dialog',
  'link',
  'list',
  'listitem',
  'menu',
  'menuitem',
  'navigation',
  'region',
  'status',
  'switch',
  'tab',
  'tabpanel',
  'textbox',
])

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function findAttr(node: ElementNode, name: string): DataAttr | undefined {
  return (node.data ?? []).find((attr) => attr.kind !== 'spread' && attr.kind !== 'as' && attr.name === name)
}

function findAttrValue(node: ElementNode, name: string): string | undefined {
  const attr = findAttr(node, name)
  if (!attr || attr.kind !== 'static') return undefined
  return attr.value.replace(/^["']|["']$/g, '')
}

function hasTextChild(node: ElementNode): boolean {
  return node.children.some((child) => {
    if (child.kind === 'text') return child.value.trim().length > 0
    if (child.kind === 'element') return hasTextChild(child)
    return false
  })
}
