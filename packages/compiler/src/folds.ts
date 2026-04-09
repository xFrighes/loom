import { tokenize, TK } from './lexer.js'

export type FoldRange = {
  kind: string
  startLine: number
  endLine: number
}

export function getFoldRanges(source: string): FoldRange[] {
  const { tokens } = tokenize(source)
  const ranges: FoldRange[] = []

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]

    if (t.type === TK.DIMENSION_DATA || t.type === TK.DIMENSION_STYLE || t.type === TK.DIMENSION_BEHAVIOR) {
      const kind = t.type === TK.DIMENSION_DATA ? 'data' : t.type === TK.DIMENSION_STYLE ? 'style' : 'behavior'
      const startLine = t.line
      let endLine = startLine
      
      i++
      while (i < tokens.length) {
        const next = tokens[i]
        if (next.type === TK.EOF) break
        if (next.type !== TK.INDENT && next.type !== TK.DEDENT && next.type !== TK.NEWLINE && next.type !== TK.COMMENT) {
          if (next.indent <= t.indent) {
            i-- // push back so outer loop can process it
            break
          }
          endLine = next.line
        }
        i++
      }
      ranges.push({ kind, startLine, endLine })
    } else {
      i++
    }
  }

  return ranges
}
