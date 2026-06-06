# Loom Repository Map

Generated: 2026-06-05T18:21:23.224Z

## 📦 @loom-ui/codemod
Path: `packages/codemod`
Purpose: CLI codemod tool to convert React components to Loom

### Key Structures:
```typescript
// src/index.ts
export interface CodemodOptions {
// src/index.ts
export type ConversionSource = 'jsx' | 'html'
// src/index.ts
export interface SourceConversionOptions {
// src/index.ts
export type SourceConversionReport = {
// src/index.ts
export type MigrationFinding = {
// src/index.ts
export type MigrationReport = {
// src/index.ts
`export const Snippet = () => (${options.source})`,
// src/index.ts
export function formatMigrationReport(report: MigrationReport): string {
// 

```

---

## 📦 @loom-ui/compiler
Path: `packages/compiler`
Purpose: Core compiler for the Loom language

### Key Structures:
```typescript
// src/identifiers.ts
export function toComponentIdentifier(name: string): string {
// src/ast.ts
export type SourcePosition = {
// src/ast.ts
export type SourceSpan = {
// src/ast.ts
export type LoomFile = {
// src/ast.ts
export type MetaEntry = {
// src/ast.ts
export type SchemaZone = {
// src/ast.ts
export type SchemaDecl = {
// src/ast.ts
export type ServerZone = {
// src/ast.ts
export type TokenZone = {
// src/ast.ts
export type DesignTokenEntry = {
// src/ast.ts
export type PropDecl = {
// src/ast.ts
export type StateDecl = {
// src/ast.ts
export type ComputedDecl = {
// src/ast.ts
export type LogicZone = {
// src/ast.ts
export type LogicStatement = {
// src/ast.ts
export type MarkupNode =
// src/ast.ts
export type ElementNode = {
// src/ast.ts
export type DataAttr =
// src/ast.ts
export type StyleBlock = StyleRule[]
// src/ast.ts
export type StyleRule =
// 

```

---

## 📦 create-loom-app
Path: `packages/create-loom-app`
Purpose: Scaffold new Loom applications for React, Vue, Svelte, and LoomKit

### Key Structures:
```typescript
// src/index.ts
export type StarterTemplate = 'react' | 'vue' | 'svelte' | 'loomkit'
// src/index.ts
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'
// src/index.ts
export type ScaffoldOptions = {
// src/index.ts
export type ScaffoldResult = {
// src/index.ts
export const starterTemplates: StarterTemplate[] = ['react', 'vue', 'svelte', 'loomkit']
// src/index.ts
export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
// src/index.ts
export function normalizePackageName(value: string): string {
// src/index.ts
export const routes = [
// src/cli.ts
export function runCli(argv = process.argv, io: CliIo = processIo): number {
// 

```

---

## 📦 @loom-ui/esbuild-plugin
Path: `packages/esbuild-plugin-loom`
Purpose: esbuild plugin for compiling .loom components

### Key Structures:
```typescript
// src/index.ts
export type LoomEsbuildTarget = 'react' | 'vue' | 'svelte'
// src/index.ts
export type LoomEsbuildPluginOptions = AdvancedCompileOptions & {
// src/index.ts
export function loom(options: LoomEsbuildPluginOptions = {}): EsbuildPlugin {
// src/index.ts
export function compileForEsbuild(source: string, sourceFile: string, target: LoomEsbuildTarget, options: AdvancedCompileOptions = {}): CompileResult {
// 

```

---

## 📦 eslint-plugin-loom
Path: `packages/eslint-plugin-loom`
Purpose: ESLint processor integration for .loom files

### Key Structures:
```typescript
// src/index.ts
export function toLintMessage(diagnostic: CompilerDiagnostic): LoomLintMessage {
// src/index.ts
export const loomProcessor: LoomProcessor = {
// 

```

---

## 📦 @loom-ui/devtools
Path: `packages/loom-devtools`
Purpose: Development-only Loom DevTools runtime hook

### Key Structures:
```typescript
// src/index.ts
export const LOOM_DEVTOOLS_HOOK = '__LOOM_DEVTOOLS_GLOBAL_HOOK__'
// src/index.ts
export type LoomDevtoolsMetadata = {
// src/index.ts
export type LoomDevtoolsComponent = {
// src/index.ts
export type LoomDevtoolsEvent =
// src/index.ts
export type LoomDevtoolsHook = {
// src/index.ts
export type LoomDevtoolsTarget = {
// src/index.ts
export function installLoomDevtoolsHook(target: LoomDevtoolsTarget = resolveDefaultTarget()): LoomDevtoolsHook {
// src/index.ts
export function getLoomDevtoolsHook(target: LoomDevtoolsTarget = resolveDefaultTarget()): LoomDevtoolsHook | undefined {
// 

```

---

## 📦 @loom-ui/loom-llm
Path: `packages/loom-llm`
Purpose: Projection-and-patch tooling for LLM-safe Loom workflows

### Key Structures:
```typescript
// src/patch/apply.ts
export function previewApplyPatchBundle(
// src/patch/apply.ts
export function applyPatchBundleToFile(
// src/patch/validate.ts
export function validatePatchBundle(bundle: LoomPatchBundle): string[] {
// src/patch/validate.ts
export function assertValidPatchBundle(bundle: LoomPatchBundle): void {
// src/patch/ops.ts
export type ReplaceBlockOp = {
// src/patch/ops.ts
export type InsertBlockAfterOp = {
// src/patch/ops.ts
export type DeleteBlockOp = {
// src/patch/ops.ts
export type ReplaceNodeOp = {
// src/patch/ops.ts
export type DeleteNodeOp = {
// src/patch/ops.ts
export type ReplaceRawRangeOp = {
// src/patch/ops.ts
export type LoomPatchOp =
// src/patch/ops.ts
export type LoomPatchBundle = {
// src/patch/ops.ts
export function readPatchBundleFromFile(filePath: string): LoomPatchBundle | null {
// src/diff.ts
export function createUnifiedDiff(
// src/rust-indexer.ts
export function tryRustIndexWorkspace(options: any): any {
// src/rust-indexer.ts
export function tryRustHashText(text: string): string | null {
// src/indexer.ts
export function indexWorkspace(options: IndexOptions = {}): IndexResult {
// src/indexer.ts
export function ensureProjectionForPath(options: ProjectionLookupOptions): LoomProjection {
// src/indexer.ts
export function verifyWorkspace(options: IndexOptions = {}): VerifyFileResult[] {
// src/indexer.ts
export function verifyLoomSource(source: string, sourcePath: string): VerifyFileResult {
// 

```

---

## 📦 @loom-ui/playground
Path: `packages/loom-playground`
Purpose: Browser-friendly Loom playground compiler API

### Key Structures:
```typescript
// src/index.ts
export type PlaygroundTarget = CompileOptions['target']
// src/index.ts
export type PlaygroundTutorialLesson = {
// src/index.ts
export type PlaygroundInput = {
// src/index.ts
export type PlaygroundResult = {
// src/index.ts
export function compilePlayground(input: PlaygroundInput): PlaygroundResult {
// src/index.ts
export const defaultPlaygroundSource = `- props
// src/index.ts
export const playgroundTutorialLessons: PlaygroundTutorialLesson[] = [
// src/index.ts
react: `export function PlaygroundComponent({ title = "Loom" }) {
// src/index.ts
export function PlaygroundComponent({ tone = "calm" }) {
// src/index.ts
react: `export function PlaygroundComponent() {
// src/index.ts
react: `export function PlaygroundComponent() {
// src/index.ts
react: `export function PlaygroundComponent({ title = "Loom" }) {
// src/index.ts
export function getPlaygroundTutorialLesson(id: string): PlaygroundTutorialLesson | undefined {
// src/index.ts
export function applyTutorialLesson(
// 

```

---

## 📦 @loom-ui/tailwind
Path: `packages/loom-tailwind`
Purpose: Tailwind candidate extraction for .loom files

### Key Structures:
```typescript
// src/index.ts
export type TailwindExtraction = {
// src/index.ts
export function extractTailwindCandidates(source: string): TailwindExtraction {
// src/index.ts
export function extractTailwindClassList(source: string): string[] {
// src/index.ts
export function createLoomTailwindExtractor() {
// 

```

---

## 📦 @loom-ui/testing
Path: `packages/loom-testing`
Purpose: Testing helpers for Loom fixtures and Vitest assertions

### Key Structures:
```typescript
// src/index.ts
export type LoomCompileTarget = 'react' | 'vue' | 'svelte'
// src/index.ts
export type LoomTestCompileOptions = {
// src/index.ts
export type LoomTargetList = readonly LoomCompileTarget[]
// src/index.ts
export type LoomCompiledTargets = Record<LoomCompileTarget, CompileResult>
// src/index.ts
export function compileFixture(
// src/index.ts
export function compileForTargets(
// src/index.ts
export function assertCompiles(
// src/index.ts
export type LoomMatcherOptions = LoomTestCompileOptions & {
// src/index.ts
export const loomMatchers = {
// 

```

---

## 📦 @loom-ui/loom_core
Path: `packages/loom_core`
Purpose: Rust-based core for the Loom language

### Key Structures:
### Rust Core (napi):
```rust
#[napi]
pub fn napi_tokenize(src: String) -> LexerResult {
--
#[napi]
pub fn napi_tokenize_json(src: String) -> String {
--
#[napi]
pub fn napi_tokenize_many_json(inputs: Vec<String>) -> Vec<String> {
--
#[napi]
pub fn napi_parse(src: String) -> serde_json::Value {
--
#[napi]
pub fn napi_parse_json(src: String) -> String {
--
#[napi]
pub fn napi_parse_many_json(inputs: Vec<String>) -> Vec<String> {
--
#[napi]
pub fn napi_bridge_stats(src: String) -> BridgeStats {

```

---

## 📦 @loom-ui/kit
Path: `packages/loomkit`
Purpose: LoomKit routing and SSR primitives

### Key Structures:
```typescript
// src/index.ts
export type RouteSegmentKind = 'static' | 'dynamic' | 'catchall'
// src/index.ts
export type RouteSegment = {
// src/index.ts
export type RouteManifestEntry = {
// src/index.ts
export type PageLoadEvent = {
// src/index.ts
export type PageLoad<TData = unknown> = (event: PageLoadEvent) => TData | Promise<TData>
// src/index.ts
export type MatchedRoute = {
// src/index.ts
export function routePathFromFile(file: string, routesRoot = 'src/routes'): string {
// src/index.ts
export function parseRouteSegments(routePath: string): RouteSegment[] {
// src/index.ts
export function createRouteEntry(file: string, options: {
// src/index.ts
export function matchRoute(pathname: string, manifest: RouteManifestEntry[]): MatchedRoute | null {
// src/index.ts
export function json(data: unknown, init: ResponseInit = {}): Response {
// 

```

---

## 📦 @loom-ui/rollup-plugin
Path: `packages/rollup-plugin-loom`
Purpose: Rollup plugin for compiling .loom components

### Key Structures:
```typescript
// src/index.ts
export type LoomRollupTarget = 'react' | 'vue' | 'svelte'
// src/index.ts
export type LoomRollupPluginOptions = AdvancedCompileOptions & {
// src/index.ts
export function loom(options: LoomRollupPluginOptions = {}): RollupPlugin {
// src/index.ts
export function compileForRollup(source: string, id: string, target: LoomRollupTarget, options: AdvancedCompileOptions = {}): CompileResult {
// 

```

---

## 📦 @loom-ui/rspack-plugin
Path: `packages/rspack-plugin-loom`
Purpose: Rspack plugin and loader helpers for compiling .loom components

### Key Structures:
```typescript
// src/index.ts
export type LoomRspackTarget = 'react' | 'vue' | 'svelte'
// src/index.ts
export type LoomRspackPluginOptions = AdvancedCompileOptions & {
// src/index.ts
export class LoomRspackPlugin {
// src/index.ts
export function createRspackRule(options: LoomRspackPluginOptions = {}) {
// src/index.ts
export function compileForRspack(source: string, sourceFile: string, options: LoomRspackPluginOptions = {}) {
// 

```

---

## 📦 @loom-ui/ui
Path: `packages/ui`
Purpose: Headless UI primitives for Loom

### Key Structures:
```typescript
// src/index.ts
export type PrimitiveValue = string | number | boolean | undefined
// src/index.ts
export type PrimitiveAttrs = Record<string, unknown>
// src/index.ts
export type HeadlessEvent = {
// src/index.ts
export type HeadlessKeyboardEvent = HeadlessEvent & {
// src/index.ts
export type DisclosureChangeListener = (open: boolean) => void
// src/index.ts
export type DisclosureOptions = {
// src/index.ts
export type DisclosureController = {
// src/index.ts
export type DialogOptions = DisclosureOptions & {
// src/index.ts
export type DialogController = {
// src/index.ts
export function createDisclosure(options: DisclosureOptions = {}): DisclosureController {
// src/index.ts
export function createDialog(options: DialogOptions = {}): DialogController {
// src/index.ts
export const createModal = createDialog
// 

```

---

## 📦 vite-plugin-loom
Path: `packages/vite-plugin-loom`
Purpose: Vite plugin for the Loom language

### Key Structures:
```typescript
// src/index.ts
export type LoomPluginOptions = AdvancedCompileOptions & {
// src/index.ts
export function detectTarget(config: ResolvedConfig): 'react' | 'vue' | 'svelte' {
// src/sourcemap.ts
export function normalizeSourceMap(
// src/sourcemap.ts
export function composeSourceMaps(
// 

```

---

## 📦 vscode-loom-ui
Path: `packages/vscode-loom`
Purpose: Syntax highlighting, diagnostics, formatting, hovers, snippets, and preview support for Loom files

### Key Structures:
```typescript
// src/config.ts
export type LoomExtensionSettings = {
// src/config.ts
export type ResolvedLoomTools = {
// src/config.ts
export function resolveLoomTools(settings: LoomExtensionSettings, workspaceRoot?: string): ResolvedLoomTools {
// src/config.ts
export function resolveToolPath(value: string, workspaceRoot?: string): string {
// src/config.ts
export function isSupportedPreviewTarget(value: string): value is ResolvedLoomTools['previewTarget'] {
// src/commands.ts
export type CodemodConversionKind = 'html' | 'jsx'
// src/commands.ts
export type CodemodExecutionResult = {
// src/commands.ts
export type CodemodRunner = (
// src/commands.ts
export type CodemodSnippetOptions = {
// src/commands.ts
export type EditorConversionResult =
// src/commands.ts
export function buildCodemodArgs(sourcePath: string, from: CodemodConversionKind): string[] {
// src/commands.ts
export function summarizeCodemodWarnings(stderr: string): string | undefined {
// src/commands.ts
export function readActionableError(error: unknown): string {
// 

```

---

## 📦 @loom-ui/webpack-loader
Path: `packages/webpack-loader-loom`
Purpose: webpack loader for compiling .loom components

### Key Structures:
```typescript
// src/index.ts
export type LoomWebpackTarget = 'react' | 'vue' | 'svelte'
// src/index.ts
export type LoomWebpackLoaderOptions = AdvancedCompileOptions & {
// src/index.ts
export function compileForWebpack(source: string, sourceFile: string, options: LoomWebpackLoaderOptions = {}) {
// 

```

---

