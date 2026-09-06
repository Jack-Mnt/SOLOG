import ts from 'typescript'

export function hasDynamicImport(source: string, specifier: string) {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === specifier) found = true
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}
