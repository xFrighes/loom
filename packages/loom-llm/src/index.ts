export { createUnifiedDiff } from './diff.js'
export {
  hashText,
  readManifest,
  readProjection,
  resolveCacheRoot,
  writeProjection,
} from './cache.js'
export { runCli } from './cli.js'
export {
  indexWorkspace,
  ensureProjectionForPath,
  verifyLoomSource,
  verifyWorkspace,
  formatDiagnostics,
} from './indexer.js'
export { createLoomProjection, renderLoomProjection } from './projector/loom.js'
export type {
  DeleteBlockOp,
  DeleteNodeOp,
  InsertBlockAfterOp,
  LoomPatchBundle,
  LoomPatchOp,
  ReplaceBlockOp,
  ReplaceNodeOp,
  ReplaceRawRangeOp,
} from './patch/ops.js'
export { readPatchBundleFromFile } from './patch/ops.js'
export { assertValidPatchBundle, validatePatchBundle } from './patch/validate.js'
export { applyPatchBundleToFile, previewApplyPatchBundle } from './patch/apply.js'
export { estimateTokenCount } from './tokens.js'
export type {
  IndexManifest,
  IndexManifestEntry,
  IndexResult,
  LoomProjection,
  ProjectionMode,
  ProjectionRenderOptions,
  ProjectionSymbols,
  TokenEstimates,
  VerifyFileResult,
  VerifyTargetResult,
} from './types.js'
