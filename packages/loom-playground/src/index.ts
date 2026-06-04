import { analyze, compile, formatDiagnostic } from '@loom-ui/compiler'
import type { CompileOptions, CompilerDiagnostic, CompileResult } from '@loom-ui/compiler'

export type PlaygroundTarget = CompileOptions['target']

export type PlaygroundTutorialLesson = {
  id: string
  title: string
  focus: 'zones' | 'dimensions' | 'state' | 'events' | 'targets'
  description: string
  source: string
  target: PlaygroundTarget
  outputs: Record<PlaygroundTarget, string>
}

export type PlaygroundInput = {
  source: string
  target: PlaygroundTarget
  componentName?: string
}

export type PlaygroundResult = {
  ok: true
  output: CompileResult
  diagnostics: CompilerDiagnostic[]
} | {
  ok: false
  diagnostics: CompilerDiagnostic[]
  message: string
}

export function compilePlayground(input: PlaygroundInput): PlaygroundResult {
  const analysis = analyze(input.source)
  if (!analysis.file || analysis.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      ok: false,
      diagnostics: analysis.diagnostics,
      message: analysis.diagnostics.map(formatDiagnostic).join('\n'),
    }
  }

  return {
    ok: true,
    diagnostics: analysis.diagnostics,
    output: compile(input.source, {
      componentName: input.componentName ?? 'PlaygroundComponent',
      target: input.target,
      sourceFile: 'playground.loom',
    }),
  }
}

export const defaultPlaygroundSource = `- props
  title: string = "Loom"

- view
section.card
  h1 {title}
  p Edit this component and switch targets.
`

export const playgroundTutorialLessons: PlaygroundTutorialLesson[] = [
  {
    id: 'zones',
    title: 'Zones',
    focus: 'zones',
    description: 'Separate data and markup so compiler targets can reuse one component shape.',
    target: 'react',
    source: `- props
  title: string = "Loom"

- view
section.card
  h1 {title}
  p One source feeds every target.
`,
    outputs: {
      react: `export function PlaygroundComponent({ title = "Loom" }) {
  return <section className="card"><h1>{title}</h1><p>One source feeds every target.</p></section>
}`,
      vue: `<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="card">
    <h1>{{ title || 'Loom' }}</h1>
    <p>One source feeds every target.</p>
  </section>
</template>`,
      svelte: `<script lang="ts">
  export let title = "Loom"
</script>

<section class="card">
  <h1>{title}</h1>
  <p>One source feeds every target.</p>
</section>`,
    },
  },
  {
    id: 'dimensions',
    title: 'Dimensions',
    focus: 'dimensions',
    description: 'Attach scoped styles next to the element they shape.',
    target: 'vue',
    source: `- props
  tone: string = "calm"

- view
article.panel
  ::
    border 1px solid #d0d7de
    border-radius 8px
    padding 24px
  h2 Design dimension
  p Tone: {tone}
`,
    outputs: {
      react: `import styles from './PlaygroundComponent.module.css'

export function PlaygroundComponent({ tone = "calm" }) {
  return <article className={styles.panel}><h2>Design dimension</h2><p>Tone: {tone}</p></article>
}`,
      vue: `<template>
  <article class="panel">
    <h2>Design dimension</h2>
    <p>Tone: {{ tone || 'calm' }}</p>
  </article>
</template>

<style scoped>
.panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 24px; }
</style>`,
      svelte: `<article class="panel">
  <h2>Design dimension</h2>
  <p>Tone: {tone}</p>
</article>

<style>
  .panel { border: 1px solid #d0d7de; border-radius: 8px; padding: 24px; }
</style>`,
    },
  },
  {
    id: 'state',
    title: 'State',
    focus: 'state',
    description: 'Declare local state once and render it inside markup.',
    target: 'svelte',
    source: `- ts
  let count = 0

- view
div.counter
  span Count: {count}
`,
    outputs: {
      react: `export function PlaygroundComponent() {
  const [count] = useState(0)
  return <div className="counter"><span>Count: {count}</span></div>
}`,
      vue: `<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <div class="counter"><span>Count: {{ count }}</span></div>
</template>`,
      svelte: `<script lang="ts">
  let count = 0
</script>

<div class="counter">
  <span>Count: {count}</span>
</div>`,
    },
  },
  {
    id: 'events',
    title: 'Events',
    focus: 'events',
    description: 'Bind event handlers near the controls that trigger them.',
    target: 'react',
    source: `- ts
  let count = 0

- view
div.counter
  button
    @click
      count = count + 1
    Count: {count}
`,
    outputs: {
      react: `export function PlaygroundComponent() {
  const [count, setCount] = useState(0)
  return <div className="counter"><button onClick={() => setCount(count + 1)}>Count: {count}</button></div>
}`,
      vue: `<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <div class="counter"><button @click="count++">Count: {{ count }}</button></div>
</template>`,
      svelte: `<script lang="ts">
  let count = 0
</script>

<div class="counter">
  <button on:click={() => count = count + 1}>Count: {count}</button>
</div>`,
    },
  },
  {
    id: 'targets',
    title: 'Target Switching',
    focus: 'targets',
    description: 'Switch targets without rewriting the Loom source.',
    target: 'react',
    source: defaultPlaygroundSource,
    outputs: {
      react: `export function PlaygroundComponent({ title = "Loom" }) {
  return <section className="card"><h1>{title}</h1><p>Edit this component and switch targets.</p></section>
}`,
      vue: `<template>
  <section class="card">
    <h1>{{ title || 'Loom' }}</h1>
    <p>Edit this component and switch targets.</p>
  </section>
</template>`,
      svelte: `<section class="card">
  <h1>{title}</h1>
  <p>Edit this component and switch targets.</p>
</section>`,
    },
  },
]

export function getPlaygroundTutorialLesson(id: string): PlaygroundTutorialLesson | undefined {
  return playgroundTutorialLessons.find((lesson) => lesson.id === id)
}

export function applyTutorialLesson(
  lesson: PlaygroundTutorialLesson,
  target: PlaygroundTarget = lesson.target,
): PlaygroundInput {
  return {
    source: lesson.source,
    target,
    componentName: 'PlaygroundComponent',
  }
}
