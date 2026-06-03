import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.js'
import { scaffoldProject, starterTemplates } from '../src/index.js'

function tempProject(name: string): string {
  return path.join(tmpdir(), `create-loom-app-${name}-${crypto.randomUUID()}`)
}

describe('create-loom-app', () => {
  it.each(starterTemplates)('scaffolds the %s starter', (template) => {
    const directory = tempProject(template)
    const result = scaffoldProject({
      name: `demo-${template}`,
      directory,
      template,
    })

    expect(result.files).toContain('package.json')
    expect(result.files).toContain('src/App.loom')
    expect(result.nextSteps).toContain('bun install')

    const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
    const viteConfig = readFileSync(path.join(directory, 'vite.config.ts'), 'utf8')
    const app = readFileSync(path.join(directory, 'src/App.loom'), 'utf8')

    expect(pkg.name).toBe(`demo-${template}`)
    expect(pkg.devDependencies['vite-plugin-loom']).toBeDefined()
    expect(pkg.dependencies?.['@loom-ui/devtools']).toBeUndefined()
    expect(pkg.devDependencies?.['@loom-ui/devtools']).toBeUndefined()
    expect(viteConfig).toContain(`loom({ target: '${template === 'loomkit' ? 'react' : template}' })`)
    expect(app).toContain('- pug')

    if (template === 'loomkit') {
      expect(pkg.dependencies['@loom-ui/kit']).toBeDefined()
      expect(result.files).toContain('src/routes.ts')
      expect(result.files).toContain('src/routes/home/page.loom')
    }
  })

  it('refuses to scaffold over non-empty directories unless forced', () => {
    const directory = tempProject('non-empty')
    mkdirSync(directory, { recursive: true })
    writeFileSync(path.join(directory, 'keep.txt'), 'user file', 'utf8')

    expect(() => scaffoldProject({ name: 'demo', directory })).toThrow(/not empty/)
    expect(() => scaffoldProject({ name: 'demo', directory, force: true })).not.toThrow()
  })

  it('runs from the CLI without prompting', () => {
    const directory = tempProject('cli')
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    const code = runCli(
      ['node', 'create-loom-app', 'CLI Demo', '--template', 'vue', '--dir', directory],
      {
        stdout(value) {
          stdout += value
        },
        stderr(value) {
          stderr += value
        },
        exit(code) {
          exitCode = code
        },
      },
    )

    expect(code).toBe(0)
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Created cli-demo')
    expect(readFileSync(path.join(directory, 'src/main.ts'), 'utf8')).toContain('createApp')
  })
})
