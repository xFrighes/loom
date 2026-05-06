import { describe, it, expect } from 'vitest'
import { analyzeMigration, convertToLoom, formatMigrationReport } from '../src/index.js'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('codemod', () => {
  it('converts a basic React component to Loom', async () => {
    const sourcePath = join(__dirname, 'fixtures/Button.tsx')
    const result = await convertToLoom({ sourcePath })

    expect(result).toContain('- props')
    expect(result).toContain('label: string')
    expect(result).toContain('onClick: () => void')
    expect(result).toContain('- ts')
    expect(result).toContain('const [count, setCount] = useState(0)')
    expect(result).toContain('- pug')
    expect(result).toContain('button')
    expect(result).toContain('onClick {handleClick}')
    expect(result).toContain('className "my-button"')
  })

  it('generates a guided migration report for React components', async () => {
    const sourcePath = join(__dirname, 'fixtures/Button.tsx')
    const report = await analyzeMigration({ sourcePath })
    const formatted = formatMigrationReport(report)

    expect(report.score).toBeGreaterThan(80)
    expect(report.supportedPatterns).toContain('typed props')
    expect(report.supportedPatterns).toContain('local state')
    expect(formatted).toContain('Loom Migration Report')
    expect(formatted).toContain('Score:')
  })
})
