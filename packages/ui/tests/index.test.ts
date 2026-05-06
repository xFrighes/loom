import { describe, expect, it, vi } from 'vitest'
import { createDialog, createDisclosure, createModal } from '../src/index.js'

describe('@loom-lang/ui', () => {
  it('creates stable disclosure trigger props and notifies subscribers', () => {
    const onOpenChange = vi.fn()
    const disclosure = createDisclosure({ onOpenChange })
    const listener = vi.fn()
    const unsubscribe = disclosure.subscribe(listener)

    disclosure.getTriggerProps().onClick()

    expect(disclosure.open).toBe(true)
    expect(disclosure.getTriggerProps({ id: 'menu-button' })).toMatchObject({
      id: 'menu-button',
      'aria-expanded': true,
      'data-state': 'open',
    })
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(listener).toHaveBeenCalledWith(true)

    unsubscribe()
    disclosure.hide()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not toggle disabled disclosures', () => {
    const disclosure = createDisclosure({ disabled: true })

    disclosure.toggle()

    expect(disclosure.open).toBe(false)
    expect(disclosure.getTriggerProps()).toMatchObject({
      disabled: true,
      'aria-expanded': false,
    })
  })

  it('creates headless dialog props for modal wiring', () => {
    const dialog = createDialog({ id: 'settings', defaultOpen: true })
    const stopPropagation = vi.fn()

    dialog.getPanelProps().onClick({ stopPropagation })

    expect(dialog.open).toBe(true)
    expect(stopPropagation).toHaveBeenCalled()
    expect(dialog.getTitleProps()).toEqual({ id: 'settings-title' })
    expect(dialog.getBodyProps()).toEqual({ id: 'settings-body' })
    expect(dialog.getPanelProps()).toMatchObject({
      id: 'settings',
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': 'settings-title',
      'aria-describedby': 'settings-body',
      hidden: false,
      'data-state': 'open',
    })
  })

  it('closes dialogs from escape, backdrop, and close controls', () => {
    const dialog = createModal({ defaultOpen: true })
    const preventDefault = vi.fn()

    dialog.getPanelProps().onKeyDown({ key: 'Enter' })
    expect(dialog.open).toBe(true)

    dialog.getPanelProps().onKeyDown({ key: 'Escape', preventDefault })
    expect(dialog.open).toBe(false)
    expect(preventDefault).toHaveBeenCalled()

    dialog.show()
    dialog.getBackdropProps().onClick()
    expect(dialog.open).toBe(false)

    dialog.show()
    dialog.getCloseProps().onClick()
    expect(dialog.open).toBe(false)
  })
})
