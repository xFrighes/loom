export const LOOM_DEVTOOLS_HOOK = '__LOOM_DEVTOOLS_GLOBAL_HOOK__'

export type LoomDevtoolsMetadata = {
  id: string
  file: string
  name: string
  target: 'react' | 'vue' | 'svelte'
  span?: {
    start: number
    end: number
  }
}

export type LoomDevtoolsComponent = {
  id: string
  parentId?: string
  metadata: LoomDevtoolsMetadata
  props?: Record<string, unknown>
  state?: Record<string, unknown>
}

export type LoomDevtoolsEvent =
  | { type: 'component:mount'; component: LoomDevtoolsComponent }
  | { type: 'component:update'; component: LoomDevtoolsComponent }
  | { type: 'component:unmount'; id: string }

export type LoomDevtoolsHook = {
  version: string
  components: Map<string, LoomDevtoolsComponent>
  emit(event: LoomDevtoolsEvent): void
  subscribe(listener: (event: LoomDevtoolsEvent) => void): () => void
  register(component: LoomDevtoolsComponent): void
  update(component: LoomDevtoolsComponent): void
  unregister(id: string): void
}

export type LoomDevtoolsTarget = {
  postMessage?: (message: unknown, targetOrigin: string) => void
  [LOOM_DEVTOOLS_HOOK]?: LoomDevtoolsHook
}

export function installLoomDevtoolsHook(target: LoomDevtoolsTarget = resolveDefaultTarget()): LoomDevtoolsHook {
  if (target[LOOM_DEVTOOLS_HOOK]) {
    return target[LOOM_DEVTOOLS_HOOK]
  }

  const listeners = new Set<(event: LoomDevtoolsEvent) => void>()
  const hook: LoomDevtoolsHook = {
    version: '0.1.0',
    components: new Map(),
    emit(event) {
      for (const listener of listeners) listener(event)
      target.postMessage?.({ source: 'loom-devtools-hook', event }, '*')
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    register(component) {
      hook.components.set(component.id, component)
      hook.emit({ type: 'component:mount', component })
    },
    update(component) {
      hook.components.set(component.id, component)
      hook.emit({ type: 'component:update', component })
    },
    unregister(id) {
      hook.components.delete(id)
      hook.emit({ type: 'component:unmount', id })
    },
  }

  target[LOOM_DEVTOOLS_HOOK] = hook
  return hook
}

export function getLoomDevtoolsHook(target: LoomDevtoolsTarget = resolveDefaultTarget()): LoomDevtoolsHook | undefined {
  return target[LOOM_DEVTOOLS_HOOK]
}

function resolveDefaultTarget(): LoomDevtoolsTarget {
  if (typeof globalThis.window === 'object' && globalThis.window) {
    return globalThis.window as LoomDevtoolsTarget
  }
  return globalThis as unknown as LoomDevtoolsTarget
}
