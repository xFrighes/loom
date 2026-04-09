export function formatLoom(source: string): string {
  const lines = String(source ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))

  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return `${lines.join('\n')}\n`
}
