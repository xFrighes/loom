import type {
  BehaviorBlock,
  ControlNode,
  DataAttr,
  ElementNode,
  LoomFile,
  MarkupNode,
  PropDecl,
  SourceSpan,
} from './ast.js'

export type DiagnosticSeverity = 'error' | 'warning'

export type CompilerDiagnostic = {
  code: string
  severity: DiagnosticSeverity
  message: string
  span: SourceSpan
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
  return span ? [{ code, severity, message, span }] : []
}

function isComponentLikeTag(tag: string): boolean {
  return tag === 'element' || /^[A-Z]/.test(tag)
}

export function hasErrors(diagnostics: CompilerDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

export function formatDiagnostic(diagnostic: CompilerDiagnostic): string {
  const { line, column } = diagnostic.span.start
  return `${diagnostic.code} ${line}:${column} ${diagnostic.message}`
}

export function validate(file: LoomFile): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  for (const prop of file.props ?? []) {
    diagnostics.push(...validateProp(prop))
  }

  diagnostics.push(...validateMarkupList(file.markup ?? [], undefined))

  return diagnostics
}

function validateProp(prop: PropDecl): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  if (!prop.name) {
    diagnostics.push(...diagnostic('loom/prop-name', 'Prop name cannot be empty.', prop.span))
  } else if (!/^[A-Za-z_$][\w$]*$/.test(prop.name)) {
    diagnostics.push(...diagnostic('loom/prop-name', `Invalid prop name "${prop.name}".`, prop.span))
  }

  if (!prop.type.trim()) {
    diagnostics.push(...diagnostic('loom/prop-type', `Prop "${prop.name || '<anonymous>'}" must declare a type.`, prop.span))
  }

  return diagnostics
}

function validateMarkupList(nodes: MarkupNode[], parentElement: ElementNode | undefined): CompilerDiagnostic[] {
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

    diagnostics.push(...validateNode(node, parentElement))

    previousControl = node.kind === 'if' || node.kind === 'elseif' ? node : undefined
  }

  return diagnostics
}

function validateNode(node: MarkupNode, parentElement: ElementNode | undefined): CompilerDiagnostic[] {
  switch (node.kind) {
    case 'element':
      return validateElement(node)
    case 'if':
      return validateMarkupList(node.consequent, parentElement).concat(
        node.alternate ? validateNode(node.alternate, parentElement) : [],
      )
    case 'elseif':
      return validateMarkupList(node.consequent, parentElement).concat(
        node.alternate ? validateNode(node.alternate, parentElement) : [],
      )
    case 'else':
      return validateMarkupList(node.children, parentElement)
    case 'each':
      return validateMarkupList(node.children, parentElement)
    case 'slot-use':
      return !parentElement || !isComponentLikeTag(parentElement.tag)
        ? diagnostic('loom/slot-use', 'Named slot content can only appear inside component-like elements.', node.span)
        : []
    default:
      return []
  }
}

function validateElement(node: ElementNode): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  if (node.data) {
    diagnostics.push(...validateAttrs(node.data))
  }

  for (const behavior of node.behaviors ?? []) {
    diagnostics.push(...validateBehavior(behavior))
  }

  diagnostics.push(...validateMarkupList(node.children, node))

  return diagnostics
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
