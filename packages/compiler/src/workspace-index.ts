import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { extractLoomStructure } from './blocks.js'
import type { CompilerDiagnostic } from './validate.js'
import type { ElementNode, MarkupNode, PropDecl, SourceSpan } from './ast.js'

export type WorkspaceComponentContract = {
  name: string
  file: string
  packageName?: string
  props: PropDecl[]
  imports: string[]
}

export type WorkspacePackage = {
  name: string
  root: string
}

export type WorkspaceIndex = {
  root: string
  packages: WorkspacePackage[]
  components: WorkspaceComponentContract[]
  diagnostics: CompilerDiagnostic[]
}

type WorkspaceFs = {
  exists(path: string): boolean
  readFile(path: string): string
  readDir(path: string): string[]
  stat(path: string): { isDirectory(): boolean }
}

export function indexWorkspace(root: string, fs: WorkspaceFs = nodeFs()): WorkspaceIndex {
  const resolvedRoot = resolve(root)
  const packages = discoverPackages(resolvedRoot, fs)
  const files = discoverLoomFiles(resolvedRoot, fs)
  const components = files.map((file) => indexComponent(file, resolvedRoot, packages, fs))
  const componentNames = new Set(components.map((component) => component.name))
  const diagnostics: CompilerDiagnostic[] = []

  for (const file of files) {
    const structure = extractLoomStructure(fs.readFile(file))
    for (const node of structure.file.markup ?? []) {
      collectComponentDiagnostics(node, componentNames, diagnostics, file)
    }
  }

  return {
    root: resolvedRoot,
    packages,
    components,
    diagnostics,
  }
}

function discoverPackages(root: string, fs: WorkspaceFs): WorkspacePackage[] {
  const packageJsonPath = join(root, 'package.json')
  if (!fs.exists(packageJsonPath)) return []

  const rootPackage = JSON.parse(fs.readFile(packageJsonPath))
  const workspaceGlobs = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : rootPackage.workspaces?.packages ?? []
  const packages: WorkspacePackage[] = []

  for (const glob of workspaceGlobs) {
    const prefix = String(glob).replace(/\/\*$/, '')
    const workspaceRoot = join(root, prefix)
    if (!fs.exists(workspaceRoot)) continue
    for (const entry of fs.readDir(workspaceRoot)) {
      const packageRoot = join(workspaceRoot, entry)
      const childPackageJson = join(packageRoot, 'package.json')
      if (!fs.exists(childPackageJson)) continue
      const pkg = JSON.parse(fs.readFile(childPackageJson))
      packages.push({ name: pkg.name ?? entry, root: packageRoot })
    }
  }

  return packages
}

function discoverLoomFiles(root: string, fs: WorkspaceFs): string[] {
  const files: string[] = []
  walk(root, fs, (file) => {
    if (file.endsWith('.loom')) files.push(file)
  })
  return files.sort()
}

function indexComponent(
  file: string,
  root: string,
  packages: WorkspacePackage[],
  fs: WorkspaceFs,
): WorkspaceComponentContract {
  const source = fs.readFile(file)
  const structure = extractLoomStructure(source)
  const packageName = packages.find((pkg) => file.startsWith(`${pkg.root}/`))?.name
  return {
    name: componentNameFromFile(file),
    file: relative(root, file).split('\\').join('/'),
    packageName,
    props: structure.file.props ?? [],
    imports: collectImports(structure.file.logic?.src ?? ''),
  }
}

function collectComponentDiagnostics(
  node: MarkupNode,
  componentNames: Set<string>,
  diagnostics: CompilerDiagnostic[],
  file: string,
): void {
  if (node.kind === 'element') {
    if (isComponentTag(node) && !componentNames.has(node.tag)) {
      diagnostics.push({
        code: 'loom/workspace-unresolved-component',
        severity: 'error',
        message: `Component "${node.tag}" is not indexed in this workspace.`,
        span: node.span ?? fallbackSpan(),
        source: 'validator',
        suggestion: `Add ${node.tag}.loom to the workspace or import the component explicitly.`,
      })
    }
    for (const child of node.children) collectComponentDiagnostics(child, componentNames, diagnostics, file)
  } else if (node.kind === 'if' || node.kind === 'elseif') {
    for (const child of node.consequent) collectComponentDiagnostics(child, componentNames, diagnostics, file)
    if (node.alternate) collectComponentDiagnostics(node.alternate, componentNames, diagnostics, file)
  } else if (node.kind === 'else' || node.kind === 'each') {
    for (const child of node.children) collectComponentDiagnostics(child, componentNames, diagnostics, file)
  }
}

function isComponentTag(node: ElementNode): boolean {
  return /^[A-Z]/.test(node.tag)
}

function componentNameFromFile(file: string): string {
  const name = basename(file, '.loom').replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[0-9]/.test(name) ? `Component${name}` : name
}

function collectImports(source: string): string[] {
  const imports: string[] = []
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    imports.push(match[1]!)
  }
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
    imports.push(match[1]!)
  }
  return imports
}

function walk(directory: string, fs: WorkspaceFs, visit: (file: string) => void): void {
  if (!fs.exists(directory)) return
  for (const entry of fs.readDir(directory)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.output') continue
    const file = join(directory, entry)
    const meta = fs.stat(file)
    if (meta.isDirectory()) {
      walk(file, fs, visit)
    } else {
      visit(file)
    }
  }
}

function fallbackSpan(): SourceSpan {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
}

function nodeFs(): WorkspaceFs {
  return {
    exists: existsSync,
    readFile(path) {
      return readFileSync(path, 'utf8')
    },
    readDir: readdirSync,
    stat: statSync,
  }
}
