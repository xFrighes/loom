import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type StarterTemplate = 'react' | 'vue' | 'svelte' | 'loomkit'
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'
export type LoomAddon = 'loom-llm' | 'tailwind' | 'eslint' | 'testing' | 'devtools' | 'ui' | 'codemod'

export type TemplateInfo = {
  id: StarterTemplate
  label: string
  emoji: string
  target: 'react' | 'vue' | 'svelte'
  description: string
  nextMove: string
}

export type AddonInfo = {
  id: LoomAddon
  label: string
  emoji: string
  description: string
  packageName: string
  dependencyKind: 'dependencies' | 'devDependencies'
}

export type ScaffoldOptions = {
  name: string
  directory?: string
  template?: StarterTemplate
  packageManager?: PackageManager
  addons?: LoomAddon[]
  force?: boolean
}

export type ScaffoldResult = {
  projectName: string
  directory: string
  template: StarterTemplate
  addons: LoomAddon[]
  files: string[]
  nextSteps: string[]
  summary: string[]
}

export const starterTemplates: StarterTemplate[] = ['react', 'vue', 'svelte', 'loomkit']
export const addonIds: LoomAddon[] = ['loom-llm', 'tailwind', 'eslint', 'testing', 'devtools', 'ui', 'codemod']

export const templateCatalog: TemplateInfo[] = [
  {
    id: 'react',
    label: 'React',
    emoji: '⚛️',
    target: 'react',
    description: 'Vite + React with a typed Loom component entrypoint.',
    nextMove: 'Use this when you want Loom inside a familiar React app shell.',
  },
  {
    id: 'vue',
    label: 'Vue',
    emoji: '💚',
    target: 'vue',
    description: 'Vite + Vue with Loom compiling directly into Vue components.',
    nextMove: 'Use this when your team wants SFC-style ergonomics with Loom source.',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    emoji: '🔥',
    target: 'svelte',
    description: 'Vite + Svelte with Loom targeting Svelte output.',
    nextMove: 'Use this when you want compact generated output and Svelte integration.',
  },
  {
    id: 'loomkit',
    label: 'LoomKit',
    emoji: '🧭',
    target: 'react',
    description: 'React target plus LoomKit routing primitives for app experiments.',
    nextMove: 'Use this when you want to start with routes and framework-level patterns.',
  },
]

export const addonCatalog: AddonInfo[] = [
  {
    id: 'loom-llm',
    label: 'Loom LLM',
    emoji: '🤖',
    description: 'Projection, indexing, and patch workflows for AI-assisted Loom editing.',
    packageName: '@loom-kit/loom-llm',
    dependencyKind: 'devDependencies',
  },
  {
    id: 'tailwind',
    label: 'Tailwind extractor',
    emoji: '🎨',
    description: 'Extract Tailwind candidates from .loom files.',
    packageName: '@loom-kit/tailwind',
    dependencyKind: 'devDependencies',
  },
  {
    id: 'eslint',
    label: 'ESLint diagnostics',
    emoji: '🛡️',
    description: 'Run Loom compiler diagnostics through ESLint.',
    packageName: 'eslint-plugin-loom',
    dependencyKind: 'devDependencies',
  },
  {
    id: 'testing',
    label: 'Testing helpers',
    emoji: '🧪',
    description: 'Framework-agnostic test helpers for Loom components.',
    packageName: '@loom-kit/testing',
    dependencyKind: 'devDependencies',
  },
  {
    id: 'devtools',
    label: 'DevTools hook',
    emoji: '🔎',
    description: 'Development-only metadata hooks for inspecting Loom output.',
    packageName: '@loom-kit/devtools',
    dependencyKind: 'devDependencies',
  },
  {
    id: 'ui',
    label: 'Headless UI',
    emoji: '🧩',
    description: 'Headless Loom UI primitives for dialogs and interface building blocks.',
    packageName: '@loom-kit/ui',
    dependencyKind: 'dependencies',
  },
  {
    id: 'codemod',
    label: 'Migration codemod',
    emoji: '🔁',
    description: 'HTML/JSX-to-Loom migration utilities and CLI.',
    packageName: '@loom-kit/codemod',
    dependencyKind: 'devDependencies',
  },
]

export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  const template = options.template ?? 'react'
  const info = templateInfo(template)
  const projectName = normalizePackageName(options.name)
  const directory = path.resolve(options.directory ?? projectName)
  const packageManager = options.packageManager ?? 'bun'
  const addons = normalizeAddons(options.addons ?? [])

  ensureWritableDirectory(directory, options.force ?? false)

  const files = templateFiles(projectName, info, packageManager, addons)
  mkdirSync(directory, { recursive: true })

  const written: string[] = []
  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(directory, filePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
    written.push(filePath)
  }

  return {
    projectName,
    directory,
    template,
    addons,
    files: written.sort(),
    nextSteps: [
      `cd ${path.relative(process.cwd(), directory) || '.'}`,
      installCommand(packageManager),
      devCommand(packageManager),
    ],
    summary: [
      `${info.label} starter`,
      `Loom target: ${info.target}`,
      `Add-ons: ${addons.length > 0 ? addons.map((addon) => addonInfo(addon).label).join(', ') : 'none'}`,
      `${written.length} files created`,
      info.nextMove,
    ],
  }
}

export function addonInfo(addon: LoomAddon): AddonInfo {
  const info = addonCatalog.find((entry) => entry.id === addon)
  if (!info) {
    throw new Error(`Unknown add-on "${addon}". Expected one of: ${addonIds.join(', ')}`)
  }
  return info
}

export function normalizeAddons(addons: LoomAddon[]): LoomAddon[] {
  const seen = new Set<LoomAddon>()
  for (const addon of addons) {
    seen.add(addonInfo(addon).id)
  }
  return addonIds.filter((addon) => seen.has(addon))
}

export function normalizePackageName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    throw new Error('Project name is required')
  }
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(normalized)) {
    throw new Error(`Invalid package name "${value}"`)
  }
  return normalized
}

export function templateInfo(template: StarterTemplate): TemplateInfo {
  const info = templateCatalog.find((entry) => entry.id === template)
  if (!info) {
    throw new Error(`Unknown template "${template}". Expected one of: ${starterTemplates.join(', ')}`)
  }
  return info
}

export function installCommand(packageManager: PackageManager): string {
  if (packageManager === 'yarn') return 'yarn'
  return `${packageManager} install`
}

export function devCommand(packageManager: PackageManager): string {
  if (packageManager === 'npm') return 'npm run dev'
  if (packageManager === 'yarn') return 'yarn dev'
  return `${packageManager} run dev`
}

function ensureWritableDirectory(directory: string, force: boolean): void {
  if (!existsSync(directory)) return
  const entries = readdirSync(directory).filter((entry) => entry !== '.DS_Store')
  if (entries.length > 0 && !force) {
    throw new Error(`Directory ${directory} is not empty. Use --force to overwrite scaffold files.`)
  }
}

function templateFiles(projectName: string, info: TemplateInfo, packageManager: PackageManager, addons: LoomAddon[]): Record<string, string> {
  const shared = {
    'README.md': readme(projectName, info, packageManager, addons),
    '.gitignore': gitignore(),
    'index.html': indexHtml(info.id),
    'tsconfig.json': tsconfig(info.id),
    'src/App.loom': appLoom(info),
    'src/styles.css': stylesCss(),
    'src/vite-env.d.ts': viteEnv(),
    ...addonFiles(addons),
  }

  if (info.id === 'react' || info.id === 'loomkit') {
    return {
      ...shared,
      'package.json': packageJson(projectName, info.id, addons),
      'vite.config.ts': reactViteConfig(),
      'src/main.tsx': reactMain(info.id),
      ...(info.id === 'loomkit'
        ? {
            'src/routes.ts': loomkitRoutes(),
            'src/routes/home/page.loom': loomkitRoutePage(),
          }
        : {}),
    }
  }

  if (info.id === 'vue') {
    return {
      ...shared,
      'package.json': packageJson(projectName, info.id, addons),
      'vite.config.ts': vueViteConfig(),
      'src/main.ts': vueMain(),
    }
  }

  return {
    ...shared,
    'package.json': packageJson(projectName, info.id, addons),
    'vite.config.ts': svelteViteConfig(),
    'src/main.ts': svelteMain(),
  }
}

function packageJson(projectName: string, template: StarterTemplate, addons: LoomAddon[]): string {
  const dependencies: Record<string, string> = {}
  const devDependencies: Record<string, string> = {
    typescript: '^5.4.0',
    vite: '^5.0.0',
    'vite-plugin-loom': '^0.1.0',
  }
  const scripts: Record<string, string> = {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  }

  if (template === 'react' || template === 'loomkit') {
    dependencies.react = '^18.3.0'
    dependencies['react-dom'] = '^18.3.0'
    devDependencies['@types/react'] = '^18.3.0'
    devDependencies['@types/react-dom'] = '^18.3.0'
    devDependencies['@vitejs/plugin-react'] = '^4.3.0'
  }
  if (template === 'loomkit') {
    dependencies['@loom-kit/kit'] = '^0.1.0'
  }
  if (template === 'vue') {
    dependencies.vue = '^3.4.0'
    devDependencies['@vitejs/plugin-vue'] = '^5.0.0'
  }
  if (template === 'svelte') {
    dependencies.svelte = '^4.0.0'
    devDependencies['@sveltejs/vite-plugin-svelte'] = '^3.0.0'
  }
  for (const addon of addons) {
    const info = addonInfo(addon)
    const bucket = info.dependencyKind === 'dependencies' ? dependencies : devDependencies
    bucket[info.packageName] = '^0.1.0'
  }
  if (addons.includes('eslint')) {
    devDependencies.eslint = '^9.0.0'
    scripts.lint = 'eslint .'
  }
  if (addons.includes('tailwind')) {
    devDependencies.tailwindcss = '^3.4.0'
  }
  if (addons.includes('testing')) {
    devDependencies.vitest = '^1.6.0'
    devDependencies['@loom-kit/compiler'] = '^0.1.0'
    scripts.test = 'vitest run'
  }
  if (addons.includes('loom-llm')) {
    scripts['loom:index'] = 'loom-llm index src'
    scripts['loom:verify-ai'] = 'loom-llm verify src'
  }

  return `${JSON.stringify({
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts,
    dependencies,
    devDependencies,
  }, null, 2)}\n`
}

function readme(projectName: string, info: TemplateInfo, packageManager: PackageManager, addons: LoomAddon[]): string {
  const addonLines = addons.length > 0
    ? addons.map((addon) => {
        const addonDetails = addonInfo(addon)
        return `- ${addonDetails.emoji} **${addonDetails.label}:** ${addonDetails.description}`
      }).join('\n')
    : '- No optional add-ons selected yet.'

  return `# ${projectName}

Generated with \`create-loom-app\` using the ${info.emoji} ${info.label} starter.

${info.description}

## Development

\`\`\`bash
${installCommand(packageManager)}
${devCommand(packageManager)}
\`\`\`

Edit \`src/App.loom\` to start shaping the app. Loom keeps declarations in zones so state, logic, markup, and styles stay easy to scan.

## Loom Stack

${addonLines}
`
}

function gitignore(): string {
  return `node_modules
dist
.env
.env.local
*.log
`
}

function tsconfig(template: StarterTemplate): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      useDefineForClassFields: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      jsx: template === 'react' || template === 'loomkit' ? 'react-jsx' : 'preserve',
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src'],
  }, null, 2)}\n`
}

function viteEnv(): string {
  return `/// <reference types="vite/client" />

declare module '*.loom' {
  const component: unknown
  export default component
}
`
}

function indexHtml(template: StarterTemplate): string {
  const script = template === 'react' || template === 'loomkit' ? '/src/main.tsx' : '/src/main.ts'
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Loom App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${script}"></script>
  </body>
</html>
`
}

function reactViteConfig(): string {
  return `import react from '@vitejs/plugin-react'
import loom from 'vite-plugin-loom'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), loom({ target: 'react' })],
})
`
}

function vueViteConfig(): string {
  return `import vue from '@vitejs/plugin-vue'
import loom from 'vite-plugin-loom'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), loom({ target: 'vue' })],
})
`
}

function svelteViteConfig(): string {
  return `import { svelte } from '@sveltejs/vite-plugin-svelte'
import loom from 'vite-plugin-loom'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), loom({ target: 'svelte' })],
})
`
}

function reactMain(template: StarterTemplate): string {
  const routeImports = template === 'loomkit'
    ? `import { matchRoute } from '@loom-kit/kit'\nimport { routes } from './routes'\n\nconst route = matchRoute(window.location.pathname, routes) ?? routes[0]\nconsole.info('LoomKit route:', route)\n`
    : ''

  return `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.loom'
import './styles.css'
${routeImports}
createRoot(document.getElementById('app')!).render(<App />)
`
}

function vueMain(): string {
  return `import { createApp } from 'vue'
import App from './App.loom'
import './styles.css'

createApp(App).mount('#app')
`
}

function svelteMain(): string {
  return `import App from './App.loom'
import './styles.css'

new App({ target: document.getElementById('app')! })
`
}

function loomkitRoutes(): string {
  return `import { createRouteEntry } from '@loom-kit/kit'

export const routes = [
  createRouteEntry('src/routes/home/page.loom', { routesRoot: 'src/routes' }),
]
`
}

function appLoom(info: TemplateInfo): string {
  const title = info.id === 'loomkit' ? 'LoomKit Command Center' : `${info.label} Loom Starter`
  return `- props
  launchLabel: string = 'Open src/App.loom'

- state
  count: number = 0

- computed
  doubled = count * 2

- ts
  const features = [
    'One .loom component can target React, Vue, or Svelte',
    'Zones keep state, markup, and styles in predictable places',
    'Dimension-driven UI scales without scattering framework glue',
  ]

- view
  main.shell
    ::
      min-height 100vh
      display grid
      place-content center
      gap 28px
      padding 56px 24px
      color #17202a

    section.hero
      ::
        max-width 760px

      p.eyebrow ${info.label} starter
        ::
          text-transform uppercase
          letter-spacing 0.12em
          font-size 0.78rem
          font-weight 800
          color #4568f0

      h1 ${title}
        ::
          margin 0
          font-size clamp(2.5rem, 7vw, 5.6rem)
          line-height 0.95

      p.lede Build in Loom, keep the framework output boring, typed, and easy to ship.
        ::
          max-width 620px
          font-size 1.18rem
          line-height 1.7
          color #4a5568

      div.actions
        ::
          display flex
          flex-wrap wrap
          align-items center
          gap 14px
          margin-top 24px

        button.primary {launchLabel}
          ::
            border 0
            border-radius 8px
            padding 12px 18px
            background #17202a
            color white
            font-weight 800
            cursor pointer
          @click
            count = count + 1

        span.counter Clicks: {count} / doubled: {doubled}
          ::
            color #4a5568
            font-weight 700

    section.panel
      ::
        max-width 760px
        border 1px solid #d8deea
        border-radius 8px
        padding 24px
        background white

      h2 What is ready
      ul
        ::
          margin 0
          padding-left 20px

        each feature in features
          li {feature}
            ::
              margin 10px 0

    section.next
      ::
        max-width 760px
        color #4a5568

      h2 Next move
      p ${info.nextMove}
`
}

function stylesCss(): string {
  return `:root {
  color-scheme: light;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f8fc;
}

body {
  margin: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}
`
}

function addonFiles(addons: LoomAddon[]): Record<string, string> {
  const files: Record<string, string> = {}
  if (addons.includes('eslint')) {
    files['eslint.config.js'] = eslintConfig()
  }
  if (addons.includes('tailwind')) {
    files['tailwind.config.ts'] = tailwindConfig()
  }
  if (addons.includes('loom-llm')) {
    files['.loom/README.md'] = loomLlmReadme()
  }
  if (addons.includes('testing')) {
    files['src/App.test.ts'] = testingStarter()
  }
  return files
}

function eslintConfig(): string {
  return `import loom from 'eslint-plugin-loom'

export default [
  ...loom.configs.recommended,
]
`
}

function tailwindConfig(): string {
  return `import { createLoomTailwindExtractor } from '@loom-kit/tailwind'
import type { Config } from 'tailwindcss'

export default {
  content: {
    files: ['./index.html', './src/**/*.{ts,tsx,js,jsx,vue,svelte,loom}'],
    extract: {
      loom: createLoomTailwindExtractor().extract,
    },
  },
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
`
}

function loomLlmReadme(): string {
  return `# Loom LLM Workspace

This project includes @loom-kit/loom-llm.

Useful commands:

\`\`\`bash
loom-llm index src
loom-llm verify src
loom-llm show src/App.loom --mode outline
\`\`\`
`
}

function testingStarter(): string {
  return `import { describe, expect, it } from 'vitest'
import { parseWithDiagnostics } from '@loom-kit/compiler'
import source from './App.loom?raw'

describe('App.loom', () => {
  it('parses without diagnostics', () => {
    expect(parseWithDiagnostics(source).diagnostics).toEqual([])
  })
})
`
}

function loomkitRoutePage(): string {
  return "- view\n  section\n    h1 Home\n    p This route is ready for LoomKit experiments.\n";
}

