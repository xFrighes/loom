type DiffLine = {
  kind: ' ' | '+' | '-'
  value: string
}

export function createUnifiedDiff(
  before: string,
  after: string,
  fromFile = 'before',
  toFile = 'after',
): string {
  if (before === after) return ''

  const beforeLines = splitLines(before)
  const afterLines = splitLines(after)
  const diffLines = diff(beforeLines, afterLines)

  return [
    `--- ${fromFile}`,
    `+++ ${toFile}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...diffLines.map((line) => `${line.kind}${line.value}`),
  ].join('\n')
}

function diff(beforeLines: string[], afterLines: string[]): DiffLine[] {
  const table = buildLcsTable(beforeLines, afterLines)
  const output: DiffLine[] = []

  let i = 0
  let j = 0

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      output.push({ kind: ' ', value: beforeLines[i]! })
      i += 1
      j += 1
      continue
    }

    if (table[i + 1]![j] >= table[i]![j + 1]) {
      output.push({ kind: '-', value: beforeLines[i]! })
      i += 1
    } else {
      output.push({ kind: '+', value: afterLines[j]! })
      j += 1
    }
  }

  while (i < beforeLines.length) {
    output.push({ kind: '-', value: beforeLines[i]! })
    i += 1
  }

  while (j < afterLines.length) {
    output.push({ kind: '+', value: afterLines[j]! })
    j += 1
  }

  return output
}

function buildLcsTable(beforeLines: string[], afterLines: string[]): number[][] {
  const table = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from({ length: afterLines.length + 1 }, () => 0),
  )

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        beforeLines[i] === afterLines[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  return table
}

function splitLines(value: string): string[] {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
}
