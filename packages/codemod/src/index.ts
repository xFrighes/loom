import {
  Project,
  SyntaxKind,
  Node,
  type JsxElement,
  type JsxSelfClosingElement,
  type FunctionDeclaration,
  type ArrowFunction,
} from 'ts-morph'

export interface CodemodOptions {
  sourcePath: string
}

export async function convertToLoom(options: CodemodOptions): Promise<string> {
  const project = new Project()
  const sourceFile = project.addSourceFileAtPath(options.sourcePath)

  // Focus on the first exported declaration
  let component = sourceFile.getExportedDeclarations().values().next().value?.[0] as any

  if (component && component.getKind() === SyntaxKind.VariableDeclaration) {
    component = component.getInitializer()
  }

  if (
    !component ||
    (component.getKind() !== SyntaxKind.FunctionDeclaration &&
      component.getKind() !== SyntaxKind.ArrowFunction)
  ) {
    throw new Error('No exported component found in source file.')
  }

  const props = extractProps(component)
  const logic = extractLogic(component)
  const markup = extractMarkup(component)

  return assembleLoom(props, logic, markup)
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

function extractMarkup(component: any): string {
  const body = component.getBody()
  if (!body) return ''

  let returnStatement: any
  if (Node.isBlock(body)) {
    returnStatement = body.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
  } else {
    // Shorthand arrow function
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
