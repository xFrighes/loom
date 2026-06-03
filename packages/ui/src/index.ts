export type PrimitiveValue = string | number | boolean | undefined

export type PrimitiveAttrs = Record<string, unknown>

export type HeadlessEvent = {
  preventDefault?: () => void
  stopPropagation?: () => void
}

export type HeadlessKeyboardEvent = HeadlessEvent & {
  key: string
  shiftKey?: boolean
  target?: unknown
}

export type DisclosureChangeListener = (open: boolean) => void

export type DisclosureOptions = {
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: DisclosureChangeListener
}

export type DisclosureController = {
  readonly open: boolean
  readonly disabled: boolean
  setOpen(open: boolean): void
  show(): void
  hide(): void
  toggle(): void
  subscribe(listener: DisclosureChangeListener): () => void
  getTriggerProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    'aria-expanded': boolean
    'data-state': 'open' | 'closed'
    disabled?: true
    onClick: () => void
  }
}

export type DialogOptions = DisclosureOptions & {
  id?: string
  modal?: boolean
}

export type DialogController = {
  readonly id: string
  readonly titleId: string
  readonly bodyId: string
  readonly open: boolean
  readonly disclosure: DisclosureController
  show(): void
  hide(): void
  toggle(): void
  getBackdropProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    hidden: boolean
    'data-state': 'open' | 'closed'
    onClick: () => void
  }
  getPanelProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    id: string
    role: 'dialog'
    'aria-modal': boolean
    'aria-labelledby': string
    'aria-describedby': string
    tabindex: -1
    hidden: boolean
    'data-state': 'open' | 'closed'
    onClick: (event: HeadlessEvent) => void
    onKeyDown: (event: HeadlessKeyboardEvent) => void
    ref: (element: unknown) => void
  }
  getTitleProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    id: string
  }
  getBodyProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    id: string
  }
  getCloseProps(attrs?: PrimitiveAttrs): PrimitiveAttrs & {
    type: 'button'
    onClick: () => void
  }
}

let nextId = 0

export function createDisclosure(options: DisclosureOptions = {}): DisclosureController {
  let open = options.defaultOpen ?? false
  const listeners = new Set<DisclosureChangeListener>()

  const notify = () => {
    options.onOpenChange?.(open)
    for (const listener of listeners) listener(open)
  }

  const controller: DisclosureController = {
    get open() {
      return open
    },
    get disabled() {
      return options.disabled ?? false
    },
    setOpen(nextOpen) {
      if (controller.disabled || nextOpen === open) return
      open = nextOpen
      notify()
    },
    show() {
      controller.setOpen(true)
    },
    hide() {
      controller.setOpen(false)
    },
    toggle() {
      controller.setOpen(!open)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getTriggerProps(attrs = {}) {
      return {
        ...attrs,
        'aria-expanded': open,
        'data-state': open ? 'open' : 'closed',
        disabled: controller.disabled ? true : undefined,
        onClick: controller.toggle,
      }
    },
  }

  return controller
}

export function createDialog(options: DialogOptions = {}): DialogController {
  const id = options.id ?? createPrimitiveId('dialog')
  const disclosure = createDisclosure(options)
  let panelElement: FocusableElement | undefined
  let openerElement: FocusableElement | undefined

  disclosure.subscribe((open) => {
    if (open) {
      openerElement = getActiveElement()
      scheduleDialogFocus()
      return
    }
    restoreDialogFocus()
  })

  const scheduleDialogFocus = () => {
    if (!disclosure.open || !panelElement || !getDocument()) return
    queueMicrotask(() => {
      if (!disclosure.open || !panelElement) return
      const target = getFocusableElements(panelElement)[0] ?? panelElement
      target.focus?.()
    })
  }

  const restoreDialogFocus = () => {
    if (!getDocument()) return
    const target = openerElement
    openerElement = undefined
    target?.focus?.()
  }

  const controller: DialogController = {
    id,
    titleId: `${id}-title`,
    bodyId: `${id}-body`,
    get open() {
      return disclosure.open
    },
    disclosure,
    show: disclosure.show,
    hide: disclosure.hide,
    toggle: disclosure.toggle,
    getBackdropProps(attrs = {}) {
      return {
        ...attrs,
        hidden: !disclosure.open,
        'data-state': disclosure.open ? 'open' : 'closed',
        onClick: disclosure.hide,
      }
    },
    getPanelProps(attrs = {}) {
      return {
        ...attrs,
        id,
        role: 'dialog',
        'aria-modal': options.modal ?? true,
        'aria-labelledby': controller.titleId,
        'aria-describedby': controller.bodyId,
        tabindex: -1,
        hidden: !disclosure.open,
        'data-state': disclosure.open ? 'open' : 'closed',
        ref(element) {
          panelElement = isFocusableElement(element) ? element : undefined
          const ref = attrs.ref
          if (typeof ref === 'function') ref(element)
          else if (ref && typeof ref === 'object' && 'current' in ref) {
            ;(ref as { current: unknown }).current = element
          }
          scheduleDialogFocus()
        },
        onClick(event) {
          event.stopPropagation?.()
        },
        onKeyDown(event) {
          if (event.key === 'Escape') {
            event.preventDefault?.()
            disclosure.hide()
            return
          }
          if (event.key === 'Tab') {
            trapDialogTab(event, panelElement)
          }
        },
      }
    },
    getTitleProps(attrs = {}) {
      return {
        ...attrs,
        id: controller.titleId,
      }
    },
    getBodyProps(attrs = {}) {
      return {
        ...attrs,
        id: controller.bodyId,
      }
    },
    getCloseProps(attrs = {}) {
      return {
        ...attrs,
        type: 'button',
        onClick: disclosure.hide,
      }
    },
  }

  return controller
}

export const createModal = createDialog

function createPrimitiveId(prefix: string): string {
  nextId += 1
  return `loom-${prefix}-${nextId}`
}

type FocusableElement = {
  focus?: () => void
  contains?: (node: unknown) => boolean
  querySelectorAll?: (selector: string) => ArrayLike<unknown>
}

function getDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function getActiveElement(): FocusableElement | undefined {
  const activeElement = getDocument()?.activeElement
  return isFocusableElement(activeElement) ? activeElement : undefined
}

function isFocusableElement(value: unknown): value is FocusableElement {
  return typeof value === 'object' && value !== null && 'focus' in value
}

function getFocusableElements(panel: FocusableElement): FocusableElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  return Array.from(panel.querySelectorAll?.(selector) ?? []).filter(isFocusableElement)
}

function trapDialogTab(event: HeadlessKeyboardEvent, panel: FocusableElement | undefined): void {
  if (!panel) return
  const focusable = getFocusableElements(panel)
  if (focusable.length === 0) {
    event.preventDefault?.()
    panel.focus?.()
    return
  }

  const active = isFocusableElement(event.target) ? event.target : getActiveElement()
  const currentIndex = focusable.findIndex((element) => element === active)
  const movingBackward = event.shiftKey === true
  const nextIndex = movingBackward
    ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
    : currentIndex === focusable.length - 1 ? 0 : currentIndex + 1

  if (currentIndex === -1 || (movingBackward && currentIndex === 0) || (!movingBackward && currentIndex === focusable.length - 1)) {
    event.preventDefault?.()
    focusable[nextIndex].focus?.()
  }
}
