import { describe, expect, it } from 'vitest'
import {
  applyTutorialLesson,
  compilePlayground,
  defaultPlaygroundSource,
  getPlaygroundTutorialLesson,
  playgroundTutorialLessons,
} from '../src/index.js'

describe('@loom-ui/playground', () => {
  it('compiles the default source', () => {
    const result = compilePlayground({ source: defaultPlaygroundSource, target: 'react' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.output.code).toContain('PlaygroundComponent')
    }
  })

  it('returns diagnostics for invalid source', () => {
    const result = compilePlayground({ source: '- view\ndiv\n  :\n    id first\n    id second', target: 'react' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('loom/')
    }
  })

  it('ships guided tutorial lessons for core playground concepts', () => {
    expect(playgroundTutorialLessons.map((lesson) => lesson.focus)).toEqual([
      'zones',
      'dimensions',
      'state',
      'events',
      'targets',
    ])

    for (const lesson of playgroundTutorialLessons) {
      expect(lesson.source).toContain('- view')
      expect(lesson.outputs.react).toBeTruthy()
      expect(lesson.outputs.vue).toBeTruthy()
      expect(lesson.outputs.svelte).toBeTruthy()
    }
  })

  it('creates compile input from a tutorial lesson', () => {
    const lesson = getPlaygroundTutorialLesson('targets')
    expect(lesson).toBeDefined()

    const input = applyTutorialLesson(lesson!, 'vue')
    expect(input.target).toBe('vue')
    expect(input.source).toBe(defaultPlaygroundSource)
    expect(input.componentName).toBe('PlaygroundComponent')
  })
})
