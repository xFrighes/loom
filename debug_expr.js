const ts = require('typescript')
const src = `
    const count = 5
    console.log(count)
    count = 10
`
const sourceFile = ts.createSourceFile('logic.ts', src, ts.ScriptTarget.Latest, true)
const scopeStack = [new Set()]
const isShadowed = (name) => {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    if (scopeStack[i].has(name)) return true
  }
  return false
}
const visit = (node) => {
  let pushedScope = false
  if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
    scopeStack.push(new Set())
    pushedScope = true
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    scopeStack[scopeStack.length - 1].add(node.name.text)
  }
  if (ts.isBinaryExpression(node)) {
    const left = node.left
    if (ts.isIdentifier(left)) {
        console.log('Binary expr:', left.text, 'shadowed?', isShadowed(left.text))
    }
  }
  ts.forEachChild(node, visit)
  if (pushedScope) scopeStack.pop()
}
visit(sourceFile)
