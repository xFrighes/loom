const TOKEN_PATTERN = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g

export function estimateTokenCount(text: string): number {
  const normalized = String(text ?? '').trim()
  if (!normalized) return 0
  const matches = normalized.match(TOKEN_PATTERN)
  return matches?.length ?? 0
}
