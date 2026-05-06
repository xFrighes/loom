import { describe, expect, it, vi } from 'vitest'
import { getLoomDevtoolsHook, installLoomDevtoolsHook } from '../src/index.js'

describe('@loom-lang/devtools', () => {
  it('registers and unregisters components', () => {
    const target = { postMessage: vi.fn() } as unknown as Window
    const hook = installLoomDevtoolsHook(target)
    const events: string[] = []
    hook.subscribe((event) => events.push(event.type))

    hook.register({
      id: 'root',
      metadata: { id: 'root', file: 'src/App.loom', name: 'App', target: 'react' },
    })
    hook.unregister('root')

    expect(hook.components.size).toBe(0)
    expect(events).toEqual(['component:mount', 'component:unmount'])
  })

  it('reuses existing hooks and supports non-browser targets', () => {
    const target = { postMessage: vi.fn() }
    const hook = installLoomDevtoolsHook(target)

    expect(installLoomDevtoolsHook(target)).toBe(hook)
    expect(getLoomDevtoolsHook(target)).toBe(hook)
  })
})
