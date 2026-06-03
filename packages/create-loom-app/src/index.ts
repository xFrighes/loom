import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type StarterTemplate = 'react' | 'vue' | 'svelte' | 'loomkit'
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export type ScaffoldOptions = {
  name: string
  directory?: string
  template?: StarterTemplate
  packageManager?: PackageManager
  force?: boolean
}

export type ScaffoldResult = {
  projectName: string
  directory: string
  template: StarterTemplate
  files: string[]
  nextSteps: string[]
}

export const starterTemplates: StarterTemplate[] = ['react', 'vue', 'svelte', 'loomkit']

export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  const template = options.template ?? 'react'
  if (!starterTemplates.includes(template)) {
    throw new Error(`Unknown template "${template}". Expected one of: ${starterTemplates.join(', ')}`)
  }

  const projectName = normalizePackageName(options.name)
  const directory = path.resolve(options.directory ?? options.name)
  ensureWritableDirectory(directory, options.force ?? false)

  const files = templateFiles(projectName, template)
  mkdirSync(directory, { recursive: true })

  const written: string[] = []
  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(directory, filePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
    written.push(filePath)
  }

  const packageManager = options.packageManager ?? 'bun'
  const runCommand = packageManager === 'npm' ? 'npm run dev' : `${packageManager} run dev`
  return {
    projectName,
    directory,
    template,
    files: written.sort(),
    nextSteps: [
      `cd ${path.relative(process.cwd(), directory) || '.'}`,
      `${packageManager} install`,
      runCommand,
    ],
  }
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

function ensureWritableDirectory(directory: string, force: boolean): void {
  if (!existsSync(directory)) return
  const entries = readdirSync(directory).filter((entry) => entry !== '.DS_Store')
  if (entries.length > 0 && !force) {
    throw new Error(`Directory ${directory} is not empty. Use --force to overwrite scaffold files.`)
  }
}

function templateFiles(projectName: string, template: StarterTemplate): Record<string, string> {
  const shared = {
    'README.md': readme(projectName, template),
    '.gitignore': gitignore(),
    'index.html': indexHtml(template),
    'tsconfig.json': tsconfig(),
    'src/App.loom': appLoom(template),
  }

  if (template === 'react' || template === 'loomkit') {
    return {
      ...shared,
      'package.json': packageJson(projectName, template),
      'vite.config.ts': reactViteConfig(),
      'src/main.tsx': reactMain(template),
      ...(template === 'loomkit'
        ? {
            'src/routes.ts': loomkitRoutes(),
            'src/routes/home/page.loom': loomkitRoutePage(),
          }
        : {}),
    }
  }

  if (template === 'vue') {
    return {
      ...shared,
      'package.json': packageJson(projectName, template),
      'vite.config.ts': vueViteConfig(),
      'src/main.ts': vueMain(),
    }
  }

  return {
    ...shared,
    'package.json': packageJson(projectName, template),
    'vite.config.ts': svelteViteConfig(),
    'src/main.ts': svelteMain(),
  }
}

function packageJson(projectName: string, template: StarterTemplate): string {
  const dependencies: Record<string, string> = {}
  const devDependencies: Record<string, string> = {
    typescript: '^5.4.0',
    vite: '^5.0.0',
    'vite-plugin-loom': '^0.1.0',
  }

  if (template === 'react' || template === 'loomkit') {
    dependencies.react = '^18.3.0'
    dependencies['react-dom'] = '^18.3.0'
    devDependencies['@types/react'] = '^18.3.0'
    devDependencies['@types/react-dom'] = '^18.3.0'
    devDependencies['@vitejs/plugin-react'] = '^4.3.0'
  }
  if (template === 'loomkit') {
    dependencies['@loom-ui/kit'] = '^0.1.0'
  }
  if (template === 'vue') {
    dependencies.vue = '^3.4.0'
    devDependencies['@vitejs/plugin-vue'] = '^5.0.0'
  }
  if (template === 'svelte') {
    dependencies.svelte = '^4.0.0'
    devDependencies['@sveltejs/vite-plugin-svelte'] = '^3.0.0'
  }

  return `${JSON.stringify({
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies,
    devDependencies,
  }, null, 2)}\n`
}

function readme(projectName: string, template: StarterTemplate): string {
  return `# ${projectName}

Generated with create-loom-app using the ${template} starter.

## Development

\`\`\`bash
bun install
bun run dev
\`\`\`
`
}

function gitignore(): string {
  return `node_modules
dist
.env
.env.local
`
}

function tsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      useDefineForClassFields: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      jsx: 'react-jsx',
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src'],
  }, null, 2)}\n`
}

function indexHtml(template: StarterTemplate): string {
  const script = template === 'react' || template === 'loomkit' ? '/src/main.tsx' : '/src/main.ts'
  return `<div id="app"></div>
<script type="module" src="${script}"></script>
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
    ? `import { matchRoute } from '@loom-ui/kit'\nimport { routes } from './routes'\n\nconsole.log(matchRoute(window.location.pathname, routes) ?? routes[0])\n`
    : ''

  return `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.loom'
${routeImports}
createRoot(document.getElementById('app')!).render(<App />)
`
}

function vueMain(): string {
  return `import { createApp } from 'vue'
import App from './App.loom'

createApp(App).mount('#app')
`
}

function svelteMain(): string {
  return `import App from './App.loom'

new App({ target: document.getElementById('app')! })
`
}

function loomkitRoutes(): string {
  return `import { createRouteEntry } from '@loom-ui/kit'

export const routes = [
  createRouteEntry('src/routes/home/page.loom', { routesRoot: 'src/routes' }),
]
`
}

function appLoom(template: StarterTemplate): string {
  const title = template === 'loomkit' ? 'LoomKit Starter' : 'Loom Starter'
  return `- ts
  const features = ['Zones', 'Dimensions', 'Target switching']

- pug
  main.app
    ::
      font-family system-ui, sans-serif
      max-width 760px
      margin 0 auto
      padding 48px 24px
      color #17202a

    h1 ${title}
    p Edit src/App.loom and save to reload.

    ul
      each feature in features
        li {feature}
`
}

function loomkitRoutePage(): string {
  return `- pug
  section
    h1 Home
    p This route is ready for LoomKit experiments.
`
}
