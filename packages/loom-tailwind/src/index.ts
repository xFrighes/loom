import { parse, type DataAttr, type MarkupNode } from '@loom-kit/compiler'

export type TailwindExtraction = {
  classes: string[]
  dynamicExpressions: string[]
}

export function extractTailwindCandidates(source: string): TailwindExtraction {
  const classes = new Set<string>()
  const dynamicExpressions: string[] = []

  try {
    const file = parse(source)
    visitNodes(file.markup ?? [], classes, dynamicExpressions)
  } catch {
    return { classes: [], dynamicExpressions: [] }
  }

  return {
    classes: [...classes],
    dynamicExpressions,
  }
}

export function extractTailwindClassList(source: string): string[] {
  return extractTailwindCandidates(source).classes
}

export function createLoomTailwindExtractor() {
  return {
    extensions: ['loom'],
    extract(content: string) {
      return extractTailwindClassList(content)
    },
  }
}

function visitNodes(nodes: MarkupNode[], classes: Set<string>, dynamicExpressions: string[]) {
  for (const node of nodes) {
    switch (node.kind) {
      case 'element':
        for (const className of node.classes) {
          classes.add(className)
        }
        for (const attr of node.data ?? []) {
          collectClassAttr(attr, classes, dynamicExpressions)
        }
        visitNodes(node.children, classes, dynamicExpressions)
        break
      case 'if':
      case 'elseif':
        visitNodes(node.consequent, classes, dynamicExpressions)
        if (node.alternate) visitNodes([node.alternate], classes, dynamicExpressions)
        break
      case 'else':
      case 'each':
      case 'slot-use':
        visitNodes(node.children, classes, dynamicExpressions)
        break
      default:
        break
    }
  }
}

function collectClassAttr(attr: DataAttr, classes: Set<string>, dynamicExpressions: string[]) {
  if (attr.kind === 'static' && isClassAttr(attr.name)) {
    for (const candidate of normalizeStaticClassValue(attr.value)) {
      classes.add(candidate)
    }
  }

  if (attr.kind === 'dynamic' && isClassAttr(attr.name)) {
    dynamicExpressions.push(attr.expr)
  }
}

function isClassAttr(name: string): boolean {
  return name === 'class' || name === 'className'
}

function normalizeStaticClassValue(value: string): string[] {
  const trimmed = value.trim()
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed

  return unquoted
    .split(/\s+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
}
