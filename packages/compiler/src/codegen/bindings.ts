import ts from 'typescript'

export function isAssignableBindingExpression(expr: string): boolean {
  const sourceFile = ts.createSourceFile(
    'binding.ts',
    `(${expr})`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const parseDiagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[]
  }).parseDiagnostics
  if (parseDiagnostics && parseDiagnostics.length > 0) return false

  const statement = sourceFile.statements[0]
  if (!statement || !ts.isExpressionStatement(statement)) return false

  const parsed = ts.isParenthesizedExpression(statement.expression)
    ? statement.expression.expression
    : statement.expression

  return isSimpleAssignableExpression(parsed)
}

function isSimpleAssignableExpression(node: ts.Expression): boolean {
  if (ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword) return true

  if (ts.isPropertyAccessExpression(node)) {
    return isSimpleAssignableExpression(node.expression)
  }

  if (ts.isElementAccessExpression(node)) {
    return (
      isSimpleAssignableExpression(node.expression) &&
      node.argumentExpression !== undefined &&
      isSafeIndexExpression(node.argumentExpression)
    )
  }

  return false
}

function isSafeIndexExpression(node: ts.Expression): boolean {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    ts.isIdentifier(node) ||
    node.kind === ts.SyntaxKind.ThisKeyword ||
    ts.isPropertyAccessExpression(node)
  )
}
