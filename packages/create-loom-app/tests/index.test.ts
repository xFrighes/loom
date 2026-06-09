import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.js'
import { addonCatalog, devCommand, installCommand, scaffoldProject, starterTemplates, templateCatalog } from '../src/index.js'
import { parseWithDiagnostics } from '../../compiler/src/parser.js'

function tempProject(name: string): string {
  return path.join(tmpdir(), `create-loom-app-${name}-${crypto.randomUUID()}`)
}

describe('create-loom-app', () => {
  it.each(starterTemplates)('scaffolds the %s starter', (template) => {
    const directory = tempProject(template)
    const packageManager = template === 'vue' ? 'pnpm' : 'bun'
    const result = scaffoldProject({
      name: `demo-${template}`,
      directory,
      template,
      packageManager,
      addons: template === 'react' ? ['loom-llm', 'tailwind', 'eslint', 'testing'] : [],
    })

    expect(result.files).toContain('package.json')
    expect(result.files).toContain('src/App.loom')
    expect(result.files).toContain('src/styles.css')
    expect(result.files).toContain('src/vite-env.d.ts')
    expect(result.nextSteps).toContain(installCommand(packageManager))
    expect(result.summary.join('\n')).toContain('Loom target:')
    expect(result.summary.join('\n')).toContain('Add-ons:')

    const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
    const viteConfig = readFileSync(path.join(directory, 'vite.config.ts'), 'utf8')
    const app = readFileSync(path.join(directory, 'src/App.loom'), 'utf8')
    const readme = readFileSync(path.join(directory, 'README.md'), 'utf8')

    expect(pkg.name).toBe(`demo-${template}`)
    expect(pkg.devDependencies['vite-plugin-loom']).toBeDefined()
    expect(pkg.dependencies?.['@loom-kit/devtools']).toBeUndefined()
    expect(pkg.devDependencies?.['@loom-kit/devtools']).toBeUndefined()
    expect(viteConfig).toContain(`loom({ target: '${template === 'loomkit' ? 'react' : template}' })`)
    expect(app).toContain('- view')
    expect(app).toContain('- computed')
    expect(app).toContain('@click')
    expect(app).not.toContain('- style')
    expect(parseWithDiagnostics(app).diagnostics).toEqual([])
    expect(readme).toContain(templateCatalog.find((entry) => entry.id === template)?.label)

    if (template === 'react') {
      expect(pkg.devDependencies['@loom-kit/loom-llm']).toBeDefined()
      expect(pkg.devDependencies['@loom-kit/tailwind']).toBeDefined()
      expect(pkg.devDependencies['eslint-plugin-loom']).toBeDefined()
      expect(pkg.devDependencies['@loom-kit/testing']).toBeDefined()
      expect(pkg.devDependencies['@loom-kit/compiler']).toBeDefined()
      expect(pkg.scripts['loom:index']).toBe('loom-llm index src')
      expect(pkg.scripts.lint).toBe('eslint .')
      expect(pkg.scripts.test).toBe('vitest run')
      expect(result.files).toContain('.loom/README.md')
      expect(result.files).toContain('tailwind.config.ts')
      expect(result.files).toContain('eslint.config.js')
      expect(result.files).toContain('src/App.test.ts')
    }

    if (template === 'loomkit') {
      expect(pkg.dependencies['@loom-kit/kit']).toBeDefined()
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

  it('runs from the CLI without prompting', async () => {
    const directory = tempProject('cli')
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    const code = await runCli(
      ['node', 'create-loom-app', 'CLI Demo', '--template', 'vue', '--dir', directory, '--no-addons'],
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
    expect(stdout).toContain('✨ Created cli-demo')
    expect(stdout).toContain('🧬 Project:')
    expect(readFileSync(path.join(directory, 'src/main.ts'), 'utf8')).toContain('createApp')
  })

  it('supports template shortcuts, add-ons, and package manager next steps', async () => {
    const directory = tempProject('shortcut')
    let stdout = ''

    const code = await runCli(
      ['node', 'create-loom-app', 'Shortcut Demo', '--svelte', '--pm', 'yarn', '--with', 'devtools,ui,codemod', '--dir', directory],
      {
        stdout(value) {
          stdout += value
        },
        stderr() {},
        exit() {},
      },
    )

    expect(code).toBe(0)
    expect(stdout).toContain('Svelte starter')
    expect(stdout).toContain('Add-ons:')
    expect(stdout).toContain('yarn dev')
    const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
    expect(pkg.devDependencies['@loom-kit/devtools']).toBeDefined()
    expect(pkg.dependencies['@loom-kit/ui']).toBeDefined()
    expect(pkg.devDependencies['@loom-kit/codemod']).toBeDefined()
    expect(readFileSync(path.join(directory, 'README.md'), 'utf8')).toContain('🧩')
  })

  it('lists templates/add-ons and previews dry runs without writing files', async () => {
    const directory = tempProject('dry-run')
    let stdout = ''

    const listCode = await runCli(['node', 'create-loom-app', '--list'], {
      stdout(value) {
        stdout += value
      },
      stderr() {},
      exit() {},
    })

    expect(listCode).toBe(0)
    expect(stdout).toContain('🧵 Available Loom starters')
    expect(stdout).toContain('loomkit')
    expect(stdout).toContain('✨ Add-ons')
    expect(stdout).toContain(addonCatalog[0].label)

    stdout = ''
    const dryRunCode = await runCli(['node', 'create-loom-app', 'Dry Run', '--loomkit', '--addons', 'all', '--dir', directory, '--dry-run'], {
      stdout(value) {
        stdout += value
      },
      stderr() {},
      exit() {},
    })

    expect(dryRunCode).toBe(0)
    expect(stdout).toContain('🧪 create-loom-app dry run')
    expect(stdout).toContain('template: loomkit')
    expect(stdout).toContain('loom-llm')
    expect(() => readFileSync(path.join(directory, 'package.json'), 'utf8')).toThrow()
  })

  it('exposes package-manager command helpers', () => {
    expect(installCommand('bun')).toBe('bun install')
    expect(installCommand('yarn')).toBe('yarn')
    expect(devCommand('npm')).toBe('npm run dev')
    expect(devCommand('pnpm')).toBe('pnpm run dev')
  })
})
