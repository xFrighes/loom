import { describe, it, expect } from 'vitest'
import {
  analyzeMigration,
  convertSourceToLoom,
  convertSourceToLoomWithReport,
  convertToLoom,
  formatMigrationReport,
} from '../src/index.js'
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
    expect(result).toContain('- view')
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

  it('converts pasted HTML into Loom markup', async () => {
    const result = await convertSourceToLoom({
      from: 'html',
      source: '<div id="hero" class="card primary"><input type="email" placeholder="Email"><button disabled>Join</button></div>',
    })

    expect(result).toContain('- view')
    expect(result).toContain('div.card.primary#hero')
    expect(result).toContain('input')
    expect(result).toContain('type "email"')
    expect(result).toContain('placeholder "Email"')
    expect(result).toContain('button')
    expect(result).toContain('disabled')
    expect(result).toContain('Join')
  })

  it('returns source and findings from source conversion reports', async () => {
    const report = await convertSourceToLoomWithReport({
      from: 'html',
      source: '<section><!-- review copy --><h1>Hello</h1></section>',
    })

    expect(report.source).toContain('- view')
    expect(report.source).toContain('section')
    expect(report.source).toContain('// review copy')
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'loom-migrate/html-comment',
      severity: 'warning',
    }))
  })

  it('converts JSX source text without a real file path', async () => {
    const result = await convertSourceToLoom({
      from: 'jsx',
      source: `
        export const Banner = () => (
          <section className="hero">
            <h1>Hello</h1>
          </section>
        )
      `,
    })

    expect(result).toContain('- view')
    expect(result).toContain('section')
    expect(result).toContain('className "hero"')
    expect(result).toContain('h1')
    expect(result).toContain('Hello')
  })

  it('converts JSX expression snippets with a synthetic component', async () => {
    const report = await convertSourceToLoomWithReport({
      from: 'jsx',
      source: '<button disabled>Join</button>',
    })

    expect(report.source).toContain('button')
    expect(report.source).toContain('disabled')
    expect(report.source).toContain('Join')
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'loom-migrate/jsx-snippet',
      severity: 'info',
    }))
  })

  it('preserves unsupported HTML constructs as migration comments', async () => {
    const result = await convertSourceToLoom({
      from: 'html',
      source: '<!doctype html><svg:path d="M0 0" />',
    })

    expect(result).toContain('Unsupported HTML doctype preserved from paste')
    expect(result).toContain('Unsupported namespaced tag')
    expect(result).toContain('svg-path')
  })
})
