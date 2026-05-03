import type { Mapping } from '../sourcemap.js'
import type { SourceSpan } from '../ast.js'

export class LineEmitter {
  readonly lines: string[] = []
  readonly mappings: Mapping[] = []
  outputLine = 0

  addLine(line: string, span?: SourceSpan, indent = 0): void {
    if (span) {
      this.mappings.push({
        genLine: this.outputLine,
        genCol: indent,
        srcLine: span.start.line - 1,
        srcCol: span.start.column - 1,
      })
    }
    this.lines.push(line)
    this.outputLine++
  }

  addLines(lines: string[], span?: SourceSpan, indent = 0): void {
    if (lines.length === 0) return
    if (span) {
      this.mappings.push({
        genLine: this.outputLine,
        genCol: indent,
        srcLine: span.start.line - 1,
        srcCol: span.start.column - 1,
      })
    }
    this.lines.push(...lines)
    this.outputLine += lines.length
  }

  addEmitter(other: LineEmitter): void {
    for (const m of other.mappings) {
      this.mappings.push({
        ...m,
        genLine: m.genLine + this.outputLine,
      })
    }
    this.lines.push(...other.lines)
    this.outputLine += other.lines.length
  }

  getContent(): string {
    return this.lines.join('\n')
  }

  isEmpty(): boolean {
    return this.lines.length === 0
  }
}
