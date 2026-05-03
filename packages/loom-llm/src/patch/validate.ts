import type { LoomPatchBundle } from './ops.js'

export function validatePatchBundle(bundle: LoomPatchBundle): string[] {
  const errors: string[] = []

  if (bundle.version !== 1) {
    errors.push('Patch bundle version must be 1.')
  }

  if (!bundle.sourceHash || typeof bundle.sourceHash !== 'string') {
    errors.push('Patch bundle must include sourceHash.')
  }

  if (!Array.isArray(bundle.ops) || bundle.ops.length === 0) {
    errors.push('Patch bundle must include at least one operation.')
    return errors
  }

  bundle.ops.forEach((op, index) => {
    const prefix = `ops[${index}]`
    switch (op.op) {
      case 'replace-block':
        if (!op.blockId) errors.push(`${prefix}.blockId is required.`)
        if (typeof op.content !== 'string') errors.push(`${prefix}.content must be a string.`)
        if (op.lang && op.lang !== 'ts' && op.lang !== 'js')
          errors.push(`${prefix}.lang must be "ts" or "js".`)
        break
      case 'insert-block-after':
        if (!op.blockKind) errors.push(`${prefix}.blockKind is required.`)
        if (typeof op.content !== 'string') errors.push(`${prefix}.content must be a string.`)
        if (op.blockKind === 'logic' && op.lang !== 'ts' && op.lang !== 'js') {
          errors.push(`${prefix}.lang must be provided for logic block insertion.`)
        }
        break
      case 'delete-block':
        if (!op.blockId) errors.push(`${prefix}.blockId is required.`)
        break
      case 'replace-node':
        if (!op.nodeId) errors.push(`${prefix}.nodeId is required.`)
        if (typeof op.content !== 'string') errors.push(`${prefix}.content must be a string.`)
        break
      case 'delete-node':
        if (!op.nodeId) errors.push(`${prefix}.nodeId is required.`)
        break
      case 'replace-raw-range':
        if (!Number.isInteger(op.start) || op.start < 0)
          errors.push(`${prefix}.start must be a non-negative integer.`)
        if (!Number.isInteger(op.end) || op.end < op.start)
          errors.push(`${prefix}.end must be an integer >= start.`)
        if (typeof op.content !== 'string') errors.push(`${prefix}.content must be a string.`)
        break
      default:
        errors.push(`${prefix}.op is unsupported.`)
    }
  })

  return errors
}

export function assertValidPatchBundle(bundle: LoomPatchBundle): void {
  const errors = validatePatchBundle(bundle)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
}
