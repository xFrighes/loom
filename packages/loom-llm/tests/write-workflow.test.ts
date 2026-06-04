import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyPatchBundleToFile,
  hashText,
  indexWorkspace,
  type LoomPatchBundle,
} from '../src/index.js'
function createWorkspace(source: string, relativePath = 'src/App.loom') {
  const root = mkdtempSync(path.join(tmpdir(), 'loom-llm-write-'))
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, source, 'utf8')
  return { root, filePath, relativePath }
}

let roots: string[] = []

describe('loom-llm write-workflow', () => {
  afterEach(() => {
    // Clean up test workspaces
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true })
    }
    roots = []
  })

  it('indexes, replaces a logic block, and adds a markup node via node replacement', () => {
    const original = [
      '- ts',
      '  const count = 0',
      '',
      '- view',
      '  div',
      '    p {count}',
    ].join('\n')

    const { root, filePath } = createWorkspace(original)
    roots.push(root)

    // 1. Index the workspace
    indexWorkspace({ root })

    // ... (rest of test)

    // 2. Generate a structured patch bundle
    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(original),
      ops: [
        {
          op: 'replace-block',
          blockId: 'logic:0',
          content: 'const count = 1',
          lang: 'ts',
        },
        {
          op: 'replace-node',
          nodeId: 'markup:0/div:0', // replacing the div
          content: [
            'div',
            '  p {count}',
            '  footer Powered by Loom',
          ].join('\n'),
        },
      ],
    }

    // 3. Apply the patch
    const result = applyPatchBundleToFile(filePath, bundle)
    const nextSource = readFileSync(filePath, 'utf8')

    // 4. Verify against golden expectations
    expect(result.verification.ok).toBe(true)
    expect(nextSource).toContain('const count = 1')
    expect(nextSource).toContain('footer Powered by Loom')
    
    expect(nextSource).toMatch(/- ts\n {2}const count = 1/)
    expect(nextSource).toMatch(/footer Powered by Loom/)
  })

  it('prevents sibling-insertion drift when multiple blocks are inserted at the same position', () => {
    const source = '- view\n  div'
    const { root, filePath } = createWorkspace(source)
    roots.push(root)

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(source),
      ops: [
        {
          op: 'insert-block-after',
          afterBlockId: undefined, // insert at end
          blockKind: 'generics',
          content: '<T>',
        },
        {
          op: 'insert-block-after',
          afterBlockId: undefined, // also at end
          blockKind: 'props',
          content: 'name: string',
        },
      ],
    }

    applyPatchBundleToFile(filePath, bundle)
    const nextSource = readFileSync(filePath, 'utf8')

    expect(nextSource).toContain('- generics')
    expect(nextSource).toContain('- props')

    const genericsIndex = nextSource.indexOf('- generics')
    const propsIndex = nextSource.indexOf('- props')
    
    expect(propsIndex).toBeGreaterThan(genericsIndex)
  })

  it('provides a helpful error message when a file has drifted', () => {
    const original = '- view\n  div Hello'
    const { root, filePath } = createWorkspace(original)
    roots.push(root)
    
    // Modify the file to cause drift
    writeFileSync(filePath, '- view\n  div Modified', 'utf8')

    const bundle: LoomPatchBundle = {
      version: 1,
      sourceHash: hashText(original),
      ops: [
        {
          op: 'replace-block',
          blockId: 'markup:0',
          content: 'div Updated',
        },
      ],
    }

    expect(() => applyPatchBundleToFile(filePath, bundle)).toThrow(/File has drifted/i)
    expect(() => applyPatchBundleToFile(filePath, bundle)).toThrow(/regenerate the patch/i)
  })
})
