import {
  Project,
  SyntaxKind,
  Node,
  type SourceFile,
  type JsxElement,
  type JsxSelfClosingElement,
  type FunctionDeclaration,
  type ArrowFunction,
} from 'ts-morph'

export interface CodemodOptions {
  sourcePath: string
}

export type ConversionSource = 'jsx' | 'html'

export interface SourceConversionOptions {
  source: string
  from: ConversionSource
  sourcePath?: string
}

export type SourceConversionReport = {
  source: string
  findings: MigrationFinding[]
}

export type MigrationFinding = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  fixUrl: string
}

export type MigrationReport = {
  sourcePath: string
  componentName: string
  score: number
  supportedPatterns: string[]
  findings: MigrationFinding[]
  recommendedNextStep: string
}

export async function convertToLoom(options: CodemodOptions): Promise<string> {
  const component = loadFirstComponent(options.sourcePath)
  return convertComponentToLoom(component)
}

export async function convertSourceToLoom(options: SourceConversionOptions): Promise<string> {
  const report = await convertSourceToLoomWithReport(options)
  return report.source
}

export async function convertSourceToLoomWithReport(options: SourceConversionOptions): Promise<SourceConversionReport> {
  if (options.from === 'html') {
    const converted = convertHtmlSourceToLoom(options.source)
    return {
      source: assembleLoom('', '', converted.source),
      findings: converted.findings,
    }
  }

  const sourcePath = options.sourcePath ?? 'Snippet.tsx'
  const project = new Project()
  const sourceFile = project.createSourceFile(sourcePath, options.source, { overwrite: true })
  let component = loadFirstComponentFromSourceFile(sourceFile)
  const findings: MigrationFinding[] = []

  if (!component) {
    const wrappedFile = project.createSourceFile(
      sourcePath.replace(/(\.[cm]?[jt]sx?)?$/, '.Snippet.tsx'),
      `export const Snippet = () => (${options.source})`,
      { overwrite: true },
    )
    component = loadFirstComponentFromSourceFile(wrappedFile)
    if (component) {
      findings.push(finding(
        'loom-migrate/jsx-snippet',
        'info',
        'JSX source was converted as an expression snippet.',
        'https://loom.dev/docs/migration/react#jsx-snippets',
      ))
    }
  }

  if (!component) {
    throw new Error('No exported component or JSX expression found in source.')
  }
  findings.unshift(...collectMigrationFindings(component))

  return {
    source: convertComponentToLoom(component),
    findings,
  }
}

function convertComponentToLoom(component: FunctionDeclaration | ArrowFunction): string {
  const props = extractProps(component)
  const logic = extractLogic(component)
  const markup = extractMarkup(component)

  return assembleLoom(props, logic, markup)
}

export async function analyzeMigration(options: CodemodOptions): Promise<MigrationReport> {
  const component = loadFirstComponent(options.sourcePath)
  const findings = collectMigrationFindings(component)
  const supportedPatterns = collectSupportedPatterns(component)

  const score = Math.max(0, 100 - findings.reduce((total, item) => {
    if (item.severity === 'error') return total + 35
    if (item.severity === 'warning') return total + 15
    return total + 5
  }, 0))

  return {
    sourcePath: options.sourcePath,
    componentName: component.getSymbol()?.getName() ?? 'Component',
    score,
    supportedPatterns,
    findings,
    recommendedNextStep: score >= 80
      ? 'Run loom-codemod and review generated markup.'
      : 'Resolve migration findings before relying on generated Loom output.',
  }
}

export function formatMigrationReport(report: MigrationReport): string {
  const lines = [
    `# Loom Migration Report`,
    '',
    `Component: ${report.componentName}`,
    `Source: ${report.sourcePath}`,
    `Score: ${report.score}/100`,
    '',
    `## Supported Patterns`,
    ...(report.supportedPatterns.length > 0
      ? report.supportedPatterns.map((item) => `- ${item}`)
      : ['- none detected']),
    '',
    `## Findings`,
    ...(report.findings.length > 0
      ? report.findings.map((item) => `- [${item.severity}] ${item.code}: ${item.message} (${item.fixUrl})`)
      : ['- none']),
    '',
    `## Next Step`,
    report.recommendedNextStep,
    '',
  ]
  return lines.join('\n')
}

function loadFirstComponent(sourcePath: string): FunctionDeclaration | ArrowFunction {
  const project = new Project()
  const sourceFile = project.addSourceFileAtPath(sourcePath)
  const component = loadFirstComponentFromSourceFile(sourceFile)

  if (!component) {
    throw new Error('No exported component found in source file.')
  }

  return component
}

function loadFirstComponentFromSourceFile(sourceFile: SourceFile): FunctionDeclaration | ArrowFunction | undefined {
  for (const declarations of sourceFile.getExportedDeclarations().values()) {
    const declaration = declarations[0]
    if (!declaration) continue

    if (Node.isFunctionDeclaration(declaration)) {
      return declaration
    }

    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer()
      if (initializer && Node.isArrowFunction(initializer)) return initializer
    }
  }

  return undefined
}

function collectSupportedPatterns(component: FunctionDeclaration | ArrowFunction): string[] {
  const supportedPatterns: string[] = []
  if (component.getParameters().length > 0) {
    supportedPatterns.push('typed props')
  }
  if (component.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    component.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0) {
    supportedPatterns.push('JSX markup')
  }
  if (component.getText().includes('useState(')) {
    supportedPatterns.push('local state')
  }
  return supportedPatterns
}

function collectMigrationFindings(component: FunctionDeclaration | ArrowFunction): MigrationFinding[] {
  const sourceFile = component.getSourceFile()
  const findings: MigrationFinding[] = []

  if (component.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute).length > 0) {
    findings.push(finding(
      'loom-migrate/jsx-spread',
      'warning',
      'JSX spread attributes need manual review before conversion.',
      'https://loom.dev/docs/migration/react#spread-attributes',
    ))
  }

  if (sourceFile.getFullText().includes('dangerouslySetInnerHTML')) {
    findings.push(finding(
      'loom-migrate/unsafe-html',
      'error',
      'dangerouslySetInnerHTML requires an explicit unsafe HTML migration decision.',
      'https://loom.dev/docs/migration/react#unsafe-html',
    ))
  }

  if (component.getText().includes('.map(')) {
    findings.push(finding(
      'loom-migrate/list-key',
      'warning',
      'Array map rendering should become an each block with a stable key.',
      'https://loom.dev/docs/migration/react#lists-and-keys',
    ))
  }

  if (component.getText().includes('useEffect(')) {
    findings.push(finding(
      'loom-migrate/effects',
      'warning',
      'Effects remain target-specific logic and should stay in the ts zone.',
      'https://loom.dev/docs/migration/react#effects',
    ))
  }

  return findings
}

function finding(code: string, severity: MigrationFinding['severity'], message: string, fixUrl: string): MigrationFinding {
  return { code, severity, message, fixUrl }
}

function extractProps(component: FunctionDeclaration | ArrowFunction): string {
  const params = component.getParameters()
  if (params.length === 0) return ''

  const propsParam = params[0]
  const typeNode = propsParam.getTypeNode()

  if (!typeNode) return ''

  const type = typeNode.getType()
  const symbol = type.getSymbol() || type.getAliasSymbol()

  if (symbol) {
    const declarations = symbol.getDeclarations()
    for (const decl of declarations) {
      if (Node.isInterfaceDeclaration(decl) || Node.isTypeAliasDeclaration(decl)) {
        if (Node.isInterfaceDeclaration(decl)) {
          return decl
            .getProperties()
            .map((p) => p.getText())
            .join('\n  ')
        } else {
          const typeNode = decl.getTypeNode()
          if (typeNode && Node.isTypeLiteral(typeNode)) {
            return typeNode
              .getProperties()
              .map((p) => p.getText())
              .join('\n  ')
          }
        }
      }
    }
  }

  // Fallback to text representation
  const typeText = typeNode.getText()
  if (typeText.startsWith('{') && typeText.endsWith('}')) {
    return typeText
      .slice(1, -1)
      .split(',')
      .map((p) => p.trim())
      .join('\n  ')
  }

  return `// Props: ${typeText}`
}

function extractLogic(component: FunctionDeclaration | ArrowFunction): string {
  const body = component.getBody()
  if (!body) return ''

  const statements = body.getChildrenOfKind(SyntaxKind.SyntaxList)[0]?.getChildren() || []
  const logicLines: string[] = []

  for (const statement of statements) {
    if (statement.getKind() === SyntaxKind.ReturnStatement) continue
    logicLines.push(statement.getText())
  }

  return logicLines.join('\n')
}

function extractMarkup(component: FunctionDeclaration | ArrowFunction): string {
  const body = component.getBody()
  if (!body) return ''

  let returnStatement: Node | undefined
  if (Node.isBlock(body)) {
    returnStatement = body.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
  } else {
    returnStatement = body
  }

  if (!returnStatement) return ''

  let expression = Node.isReturnStatement(returnStatement)
    ? returnStatement.getExpression()
    : returnStatement

  while (expression && Node.isParenthesizedExpression(expression)) {
    expression = expression.getExpression()
  }

  if (
    expression &&
    (Node.isJsxElement(expression) || Node.isJsxSelfClosingElement(expression))
  ) {
    return convertJsxToLoom(expression, 0)
  }

  return ''
}

function convertJsxToLoom(node: JsxElement | JsxSelfClosingElement, depth: number): string {
  const indent = '  '.repeat(depth)

  const { tagName, attributes, children } = Node.isJsxElement(node)
    ? (() => {
        const opening = node.getOpeningElement()
        return {
          tagName: opening.getTagNameNode().getText(),
          attributes: opening.getAttributes().map((attr) => convertAttribute(attr)),
          children: node.getJsxChildren().map((child) => {
            if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
              return convertJsxToLoom(child, depth + 1)
            } else if (Node.isJsxText(child)) {
              const text = child.getText().trim()
              return text ? `${'  '.repeat(depth + 1)}${text}` : ''
            } else if (Node.isJsxExpression(child)) {
              return `${'  '.repeat(depth + 1)}{${child.getExpression()?.getText()}}`
            }
            return ''
          }).filter((c) => c !== ''),
        }
      })()
    : {
        tagName: node.getTagNameNode().getText(),
        attributes: node.getAttributes().map((attr) => convertAttribute(attr)),
        children: [],
      }

  let result = `${indent}${tagName}`
  if (attributes.length > 0) {
    result += '\n' + indent + '  :'
    attributes.forEach((attr) => {
      result += '\n' + indent + '    ' + attr
    })
  }

  if (children.length > 0) {
    result += '\n' + children.join('\n')
  }

  return result
}

function convertAttribute(attr: any): string {
  if (Node.isJsxAttribute(attr)) {
    const name = attr.getNameNode().getText()
    const initializer = attr.getInitializer()
    if (!initializer) return name

    if (Node.isStringLiteral(initializer)) {
      return `${name} ${initializer.getText()}`
    } else if (Node.isJsxExpression(initializer)) {
      return `${name} {${initializer.getExpression()?.getText()}}`
    }
  } else if (Node.isJsxSpreadAttribute(attr)) {
    return `...{${attr.getExpression().getText()}}`
  }
  return attr.getText()
}

type HtmlNode =
  | { kind: 'element'; tag: string; id?: string; classes: string[]; attrs: string[]; children: HtmlNode[]; unsupported?: string }
  | { kind: 'text'; value: string }
  | { kind: 'comment'; value: string }

const HTML_VOID_ELEMENTS = new Set([
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

function convertHtmlSourceToLoom(source: string): SourceConversionReport {
  const root: HtmlNode = { kind: 'element', tag: 'root', classes: [], attrs: [], children: [] }
  const stack: HtmlNode[] = [root]
  const findings: MigrationFinding[] = []
  const tokenPattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/gi

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0]
    const parent = stack[stack.length - 1] as Extract<HtmlNode, { kind: 'element' }>

    if (token.startsWith('<!--')) {
      const value = token.slice(4, -3).trim()
      if (value) parent.children.push({ kind: 'comment', value })
      findings.push(finding(
        'loom-migrate/html-comment',
        'warning',
        'HTML comments were preserved as Loom comments and need review.',
        'https://loom.dev/docs/migration/html#comments',
      ))
      continue
    }

    if (/^<!doctype/i.test(token)) {
      parent.children.push({ kind: 'comment', value: `Unsupported HTML doctype preserved from paste: ${token}` })
      findings.push(finding(
        'loom-migrate/html-doctype',
        'warning',
        'HTML doctype declarations are not Loom markup and were preserved as comments.',
        'https://loom.dev/docs/migration/html#doctype',
      ))
      continue
    }

    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim().toLowerCase()
      const index = findLastOpenHtmlElement(stack, tag)
      if (index > 0) stack.length = index
      continue
    }

    if (token.startsWith('<')) {
      const element = parseHtmlElement(token)
      parent.children.push(element)
      if (element.unsupported) {
        findings.push(finding(
          'loom-migrate/html-namespaced-tag',
          'warning',
          element.unsupported,
          'https://loom.dev/docs/migration/html#namespaced-tags',
        ))
      }
      if (!HTML_VOID_ELEMENTS.has(element.tag.toLowerCase()) && !token.endsWith('/>')) {
        stack.push(element)
      }
      continue
    }

    const text = collapseHtmlText(token)
    if (text) parent.children.push({ kind: 'text', value: text })
  }

  return {
    source: root.children.map((node) => printHtmlNode(node, 0)).filter(Boolean).join('\n'),
    findings,
  }
}

function findLastOpenHtmlElement(stack: HtmlNode[], tag: string): number {
  for (let index = stack.length - 1; index >= 0; index--) {
    const node = stack[index]
    if (node?.kind === 'element' && node.tag.toLowerCase() === tag) return index
  }
  return -1
}

function parseHtmlElement(token: string): Extract<HtmlNode, { kind: 'element' }> {
  const inner = token.replace(/^</, '').replace(/\/?>$/, '').trim()
  const nameMatch = inner.match(/^([A-Za-z][\w:-]*)/)
  const rawTag = nameMatch?.[1] ?? 'div'
  const tag = normalizeHtmlTag(rawTag)
  const attrSource = inner.slice(rawTag.length).trim()
  const { attrs, classes, id } = convertHtmlAttrs(attrSource)
  const unsupported = rawTag.includes(':')
    ? `Unsupported namespaced tag "${rawTag}" converted to "${tag}".`
    : undefined

  return { kind: 'element', tag, id, classes, attrs, children: [], unsupported }
}

function normalizeHtmlTag(tag: string): string {
  const cleaned = tag.replace(/:/g, '-')
  return /^[A-Z]/.test(cleaned) ? cleaned : cleaned.toLowerCase()
}

function convertHtmlAttrs(source: string): { attrs: string[]; classes: string[]; id?: string } {
  const attrs: string[] = []
  const classes: string[] = []
  let id: string | undefined
  if (!source) return { attrs, classes, id }
  const attrPattern = /([:@A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

  for (const match of source.matchAll(attrPattern)) {
    const rawName = match[1]
    const rawValue = match[2] ?? match[3] ?? match[4]
    if (!rawName) continue

    const name = normalizeHtmlAttrName(rawName)
    if (name === 'class' && rawValue !== undefined) {
      classes.push(...rawValue.split(/\s+/).filter(Boolean).map(toSelectorPart))
      continue
    }
    if (name === 'id' && rawValue !== undefined && !id) {
      id = toSelectorPart(rawValue)
      continue
    }

    if (rawValue === undefined) {
      attrs.push(name)
      continue
    }

    attrs.push(`${name} ${JSON.stringify(rawValue)}`)
  }

  return { attrs, classes, id }
}

function normalizeHtmlAttrName(name: string): string {
  if (name === 'class') return 'class'
  if (name === 'for') return 'for'
  return name.replace(/:/g, '-')
}

function collapseHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toSelectorPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}

function printHtmlNode(node: HtmlNode, depth: number): string {
  const indent = '  '.repeat(depth)
  if (node.kind === 'text') return `${indent}${node.value}`
  if (node.kind === 'comment') return `${indent}// ${node.value}`

  const selector = `${node.tag}${node.classes.map((name) => `.${name}`).join('')}${node.id ? `#${node.id}` : ''}`
  const lines = [`${indent}${selector}`]
  if (node.unsupported) lines.push(`${indent}  // ${node.unsupported}`)
  if (node.attrs.length > 0) {
    lines.push(`${indent}  :`)
    for (const attr of node.attrs) {
      lines.push(`${indent}    ${attr}`)
    }
  }
  for (const child of node.children) {
    lines.push(printHtmlNode(child, depth + 1))
  }
  return lines.filter(Boolean).join('\n')
}

function assembleLoom(props: string, logic: string, markup: string): string {
  let result = ''
  if (props) {
    result += `- props\n  ${props}\n\n`
  }
  if (logic) {
    result += `- ts\n  ${logic.split('\n').join('\n  ')}\n\n`
  }
  if (markup) {
    result += `- pug\n${markup}`
  }
  return result
}
