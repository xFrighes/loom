import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { formatLoom } from '@loom-ui/compiler'
import {
  applyPatchBundleToFile,
  createUnifiedDiff,
  ensureProjectionForPath,
  estimateTokenCount,
  hashText,
  indexWorkspace,
  previewApplyPatchBundle,
  renderLoomProjection,
  runCli,
  verifyWorkspace,
  readManifest,
  readProjection,
  resolveCacheRoot,
  type LoomPatchBundle,
} from '../src/index.js'

const activeWorkspaces: string[] = []

function createWorkspace(source: string, relativePath = 'src/App.loom') {
  const root = mkdtempSync(path.join(tmpdir(), 'loom-llm-'))
  activeWorkspaces.push(root)
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, source, 'utf8')
  return { root, filePath, relativePath }
}

function createIo() {
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  return {
    io: {
      stdout(value: string) {
        stdout += value
      },
      stderr(value: string) {
        stderr += value
      },
      exit(code: number) {
        exitCode = code
      },
    },
    read() {
      return { stdout, stderr, exitCode }
    },
  }
}

describe('loom-llm', () => {
  afterEach(() => {
    while (activeWorkspaces.length > 0) {
      const root = activeWorkspaces.pop()
      if (root) rmSync(root, { recursive: true, force: true })
    }
  })

  it('indexes projections and renders outline/edit views', () => {
    const source = [
      '- props',
      '  label: string = "Count"',
      '',
      '- ts',
      "  import { ref } from 'vue'",
      "  import { computed } from 'vue'",
      '  const count = ref(0)',
      '  const doubled = computed(() => count.value * 2)',
      "  const status = computed(() => count.value > 10 ? 'large' : 'small')",
      '',
      '- pug',
      '  section.wrapper',
      '    h1 {label}',
      '    p Current: {count}',
      '    p Doubled: {doubled}',
      '    p Status: {status}',
      '    button.primary',
      '      @click',
      '        count.value++',
      '      Increment',
    ].join('\n')
    const { root, relativePath } = createWorkspace(source)

    const indexed = indexWorkspace({ root })
    expect(indexed.indexed).toBe(1)

    const projection = ensureProjectionForPath({ root, input: relativePath })
    const outline = renderLoomProjection(projection, 'outline')
    const edit = renderLoomProjection(projection, 'edit', { blocks: ['logic:0'] })
    const focusedEditTokens = estimateTokenCount(edit)

    expect(outline).toContain('[logic:0]')
    expect(outline).toContain('[markup:0]')
    expect(edit).toContain('[logic:0]')
    expect(edit).not.toContain('[markup:0]')
    expect(projection.tokenEstimates.source).toBeGreaterThan(0)
    expect(focusedEditTokens).toBeLessThan(projection.tokenEstimates.source)
  })

  it('renders caveman projections with compact symbols, tree, and token estimates', () => {
    const source = [
      '- props',
      '  name: string',
      '  items: string[]',
      '',
      '- state',
      '  count: number = 0',
      '',
      '- computed',
      '  isBig = count > 10',
      '',
      '- pug',
      '  div.card',
      '    h1 Hello {name}',
      '    button',
      '      @click',
      '        count++',
      '      + Increment',
      '    if isBig',
      '      ul',
      '        each item in items',
      '          li {item}',
    ].join('\n')
    const { root, relativePath } = createWorkspace(source, 'Counter.loom')
    const projection = ensureProjectionForPath({ root, input: relativePath })

    const markdown = renderLoomProjection(projection, 'outline')
    const caveman = renderLoomProjection(projection, 'outline', { format: 'caveman' })
    const index = renderLoomProjection(projection, 'index', { format: 'caveman' })

    expect(caveman).toContain('@Counter.loom')
    expect(caveman).toContain('P:name,items|S:count|C:isBig')
    expect(caveman).toContain('T:')
    expect(caveman).toContain('div.card')
    expect(caveman).toContain('each:item<-items')
    expect(index).toContain('m:index')
    expect(index).not.toContain('T:')
    expect(projection.tokenEstimates.cavemanOutline).toBeLessThan(estimateTokenCount(markdown))
  })

  it('filters unused symbols from focused caveman edits by default', () => {
    const source = [
      '- props',
      '  title: string',
      '  ignored: string',
      '',
      '- ts',
      '  const count = 0',
      '',
      '- pug',
      '  h1 {title}',
    ].join('\n')
    const { root, relativePath } = createWorkspace(source)
    const projection = ensureProjectionForPath({ root, input: relativePath })

    const edit = renderLoomProjection(projection, 'edit', {
      blocks: ['markup:0'],
      format: 'caveman',
    })

    expect(edit).toContain('P:title')
    expect(edit).not.toContain('ignored')
    expect(edit).toContain('[markup:0]')
  })

  it('records repeated cross-file symbols once in global context', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-llm-global-'))
    activeWorkspaces.push(root)
    mkdirSync(path.join(root, 'src'), { recursive: true })
    writeFileSync(
      path.join(root, 'src/Card.loom'),
      ['- props', '  theme: Theme', '', '- pug', '  Button {theme}'].join('\n'),
      'utf8',
    )
    writeFileSync(
      path.join(root, 'src/Panel.loom'),
      ['- props', '  theme: Theme', '', '- pug', '  Button {theme}'].join('\n'),
      'utf8',
    )

    const result = indexWorkspace({ root })

    expect(result.manifest.globalContext.symbols).toContainEqual({
      id: 'G1',
      kind: 'props',
      name: 'theme',
      files: ['src/Card.loom', 'src/Panel.loom'],
    })
    expect(result.manifest.globalContext.symbols).toContainEqual({
      id: 'G2',
      kind: 'components',
      name: 'Button',
      files: ['src/Card.loom', 'src/Panel.loom'],
    })
  })

  it('keeps fallback indexing out of ignored large directories', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-llm-ignore-'))
    activeWorkspaces.push(root)
    mkdirSync(path.join(root, 'src'), { recursive: true })
    mkdirSync(path.join(root, 'node_modules', 'large'), { recursive: true })
    writeFileSync(path.join(root, 'src', 'App.loom'), '- pug\n  div App', 'utf8')
    for (let index = 0; index < 200; index += 1) {
      writeFileSync(path.join(root, 'node_modules', 'large', `Ignored${index}.loom`), '- pug\n  div Ignored', 'utf8')
    }

    const result = indexWorkspace({ root })

    expect(result.indexed).toBe(1)
    expect(result.manifest.files.map((file) => file.sourcePath)).toEqual(['src/App.loom'])
  })

  it('applies block replacement patches and preserves a valid file', () => {
    const source = ['- ts', '  let count = 0', '', '- pug', '  button', '    Count: {count}'].join(
      '\n',
    )
    const { filePath } = createWorkspace(source)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        {
          op: 'replace-block',
          blockId: 'logic:0',
          content: 'let count = 1',
          lang: 'ts',
        },
      ],
    }

    const result = applyPatchBundleToFile(filePath, bundle)
    const nextSource = readFileSync(filePath, 'utf8')

    expect(result.verification.ok).toBe(true)
    expect(nextSource).toContain('let count = 1')
  })

  it('applies node replacement patches with indentation preserved', () => {
    const source = ['- pug', '  div', '    span One', '    span Two'].join('\n')
    const { filePath } = createWorkspace(source)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        {
          op: 'replace-node',
          nodeId: 'markup:0/div:0/span:1',
          content: 'button Click',
        },
      ],
    }

    applyPatchBundleToFile(filePath, bundle)
    const nextSource = readFileSync(filePath, 'utf8')
    expect(nextSource).toContain('button Click')
    expect(nextSource).toContain('span One')
  })

  it('rejects stale patch bundles', () => {
    const source = '- pug\n  div Hello'
    const { filePath } = createWorkspace(source)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: 'sha256:stale',
      ops: [
        {
          op: 'replace-block',
          blockId: 'markup:0',
          content: 'div Updated',
        },
      ],
    }

    expect(() => previewApplyPatchBundle(readFileSync(filePath, 'utf8'), filePath, bundle)).toThrow(
      /stale/i,
    )
  })

  it('creates unified diffs for patch previews', () => {
    const source = '- pug\n  div Hello'
    const { filePath, relativePath } = createWorkspace(source)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        {
          op: 'replace-block',
          blockId: 'markup:0',
          content: 'div Updated',
        },
      ],
    }

    const preview = previewApplyPatchBundle(source, filePath, bundle)
    const diff = createUnifiedDiff(
      source,
      preview.nextSource,
      relativePath,
      `${relativePath} (patched)`,
    )

    expect(diff).toContain(`--- ${relativePath}`)
    expect(diff).toContain('+  div Updated')
  })

  it('produces a zero diff for a no-op block patch round trip', () => {
    const source = formatLoom(
      ['- ts', '  let count = 0', '', '- pug', '  button', '    Count: {count}'].join('\n'),
    )
    const { filePath, relativePath } = createWorkspace(source)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        {
          op: 'replace-block',
          blockId: 'logic:0',
          content: 'let count = 0',
          lang: 'ts',
        },
      ],
    }

    const preview = previewApplyPatchBundle(source, filePath, bundle)
    const diff = createUnifiedDiff(
      source,
      preview.nextSource,
      relativePath,
      `${relativePath} (patched)`,
    )
    expect(diff).toBe('')
  })

  it('verifies loom files across compiler targets', () => {
    const source = '- pug\n  div Hello'
    const { root } = createWorkspace(source)

    const results = verifyWorkspace({ root })
    expect(results).toHaveLength(1)
    expect(results[0]?.ok).toBe(true)
    expect(results[0]?.targets).toHaveLength(3)
  })

  it('exposes the workflow through the CLI', () => {
    const source = '- pug\n  div Hello'
    const { root, relativePath } = createWorkspace(source)
    const { io, read } = createIo()

    const exitCode = runCli(
      ['node', 'loom-llm', 'show', relativePath, '--root', root, '--mode', 'outline'],
      io,
    )

    const output = read()
    expect(exitCode).toBe(0)
    expect(output.stdout).toContain(`# File: ${relativePath}`)
    expect(output.stderr).toBe('')
  })

  it('exposes ultra caveman projections through the CLI', () => {
    const source = ['- props', '  label: string', '', '- pug', '  button {label}'].join('\n')
    const { root, relativePath } = createWorkspace(source)
    const { io, read } = createIo()

    const exitCode = runCli(
      [
        'node',
        'loom-llm',
        'show',
        relativePath,
        '--root',
        root,
        '--mode',
        'outline',
        '--format',
        'ultra',
      ],
      io,
    )

    const output = read()
    expect(exitCode).toBe(0)
    expect(output.stdout).toContain(`@${relativePath}`)
    expect(output.stdout).toContain('P:label')
    expect(output.stdout).not.toContain('# File:')
    expect(output.stderr).toBe('')
  })

  it('keeps apply paths inside the configured workspace root', () => {
    const source = '- pug\n  div Hello'
    const { root } = createWorkspace(source)
    const outside = path.join(mkdtempSync(path.join(tmpdir(), 'loom-llm-outside-')), 'Other.loom')
    writeFileSync(outside, source, 'utf8')
    const bundlePath = path.join(root, 'patch.json')
    writeFileSync(
      bundlePath,
      JSON.stringify({
        version: 1,
        sourceHash: hashText(source),
        ops: [{ op: 'replace-block', blockId: 'markup:0', content: 'div Updated' }],
      }),
      'utf8',
    )
    const { io, read } = createIo()

    const exitCode = runCli(
      ['node', 'loom-llm', 'apply', outside, '--root', root, '--ops', bundlePath],
      io,
    )

    expect(exitCode).toBe(1)
    expect(read().stderr).toContain('outside the workspace root')
  })

  it('treats corrupt cache JSON as a disposable cache miss', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-llm-cache-'))
    const cacheRoot = resolveCacheRoot(root)
    mkdirSync(path.join(cacheRoot, 'projections'), { recursive: true })
    writeFileSync(path.join(cacheRoot, 'index.json'), '{not json', 'utf8')
    writeFileSync(path.join(cacheRoot, 'projections', 'bad.json'), '{not json', 'utf8')

    expect(readManifest(cacheRoot)).toBeNull()
    expect(readProjection(cacheRoot, 'projections/bad.json')).toBeNull()
  })

  it('applies multi-operation patch bundles against the original source ranges', () => {
    const source = ['- pug', '  div', '    span One', '    span Two'].join('\n')
    const { filePath } = createWorkspace(source)
    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        { op: 'replace-node', nodeId: 'markup:0/div:0/span:0', content: 'span First' },
        { op: 'replace-node', nodeId: 'markup:0/div:0/span:1', content: 'button Second' },
      ],
    }

    applyPatchBundleToFile(filePath, bundle)
    const nextSource = readFileSync(filePath, 'utf8')
    expect(nextSource).toContain('span First')
    expect(nextSource).toContain('button Second')
    expect(nextSource).not.toContain('span Two')
  })
})
