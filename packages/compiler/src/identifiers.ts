export function toComponentIdentifier(name: string): string {
  const parts = name
    .replace(/\.[^.]+$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

  let identifier = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  if (/^[0-9]/.test(identifier)) {
    identifier = 'Component' + identifier
  }

  return identifier.replace(/^[^A-Za-z_$]+/, '') || 'Component'
}
