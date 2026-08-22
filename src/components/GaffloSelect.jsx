import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The one Gafflo select/listbox system. Every native-select-shaped choice in the app should
// render through this component (see SelectInput.jsx and App.jsx's FilterSelect, which are
// thin wrappers around it) so a "select" always looks and behaves the same way, instead of
// falling back to the browser/OS-native <select> popup. Positioned via a body portal + fixed
// coordinates so it can never be clipped by a scrollable/overflow-hidden ancestor (bottom
// sheets, the filter drawer, modals) and always paints above cards, modals and the bottom nav.
//
// onChange is called with a native-event-shaped object ({ target: { value } }) purely so this
// is a drop-in replacement for every existing `onChange={(event) => set(field, event.target.value)}`
// call site that previously targeted a real <select> — no call site had to change.

let closeActiveSelect = null

export default function GaffloSelect({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  placeholder = 'Choose an option',
  error,
  hint,
  required = false,
  disabled = false,
  className = '',
  id,
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const generatedId = useId()
  const baseId = id || generatedId
  const labelId = `${baseId}-label`
  const listboxId = `${baseId}-listbox`
  const errorId = error ? `${baseId}-error` : undefined

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null

  const close = useCallback(() => {
    setOpen(false)
    setPosition(null)
  }, [])

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const margin = 8
    const maxPanelHeight = 280
    const spaceBelow = viewportHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow
    const availableHeight = Math.max(140, Math.min(maxPanelHeight, placeAbove ? spaceAbove : spaceBelow))
    setPosition({
      left: rect.left,
      width: rect.width,
      top: placeAbove ? undefined : rect.bottom + 6,
      bottom: placeAbove ? viewportHeight - rect.top + 6 : undefined,
      maxHeight: availableHeight,
    })
  }, [])

  const openList = () => {
    if (disabled) return
    if (closeActiveSelect && closeActiveSelect !== close) closeActiveSelect()
    closeActiveSelect = close
    computePosition()
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const commit = (option) => {
    onChange?.({ target: { value: option.value } })
    close()
    triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return
      if (listRef.current?.contains(event.target)) return
      close()
    }
    const handleScroll = (event) => {
      if (listRef.current?.contains(event.target)) return
      close()
    }
    const handleResize = () => close()
    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('resize', handleResize)
    // Opening (click + focus-without-scroll) can itself leave a native 'scroll' event queued
    // for dispatch on the next frame — attaching this listener a frame late means it only ever
    // reacts to scrolling that happens after the popover is actually open, not stale scroll
    // events left over from the interaction that opened it.
    const scrollFrame = window.requestAnimationFrame(() => {
      window.addEventListener('scroll', handleScroll, true)
    })
    return () => {
      window.cancelAnimationFrame(scrollFrame)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, close])

  useEffect(() => {
    if (open && closeActiveSelect === close) return undefined
    return () => {
      if (closeActiveSelect === close) closeActiveSelect = null
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    listRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector(`[data-index="${highlightedIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightedIndex])

  const handleTriggerKeyDown = (event) => {
    if (disabled) return
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      if (!open) openList()
    }
  }

  const handleListKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((current) => Math.min(options.length - 1, current + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => Math.max(0, current - 1))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setHighlightedIndex(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setHighlightedIndex(options.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[highlightedIndex]
      if (option) commit(option)
      return
    }
    if (event.key === 'Tab') {
      close()
    }
  }

  return (
    <div className={`block ${className}`}>
      {label ? (
        <span id={labelId} className="mb-2 block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span> : null}
        </span>
      ) : null}
      {hint ? <span className="mb-2 block text-xs leading-5 text-slate-500">{hint}</span> : null}
      <button
        type="button"
        ref={triggerRef}
        id={baseId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label && ariaLabel ? ariaLabel : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
        aria-required={required || undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleTriggerKeyDown}
        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-[18px] border px-4 py-3 text-left text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100 md:text-sm ${
          error ? 'border-rose-300 bg-rose-50/40 focus:border-rose-300 focus:ring-rose-100' : 'border-indigo-100 bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-slate-300'}`}
      >
        <span className={`truncate ${selectedOption ? 'text-slate-950' : 'text-slate-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">
          <span
            className={`block h-2 w-2 border-b-2 border-r-2 border-current transition-transform duration-200 ${open ? '-translate-y-0.5 -rotate-135' : 'rotate-45'}`}
          />
        </span>
      </button>
      {error ? (
        <span id={errorId} className="mt-2 block text-xs font-medium text-rose-500">
          {error}
        </span>
      ) : null}

      {open && position
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
              onKeyDown={handleListKeyDown}
              style={{
                position: 'fixed',
                left: position.left,
                width: position.width,
                top: position.top,
                bottom: position.bottom,
                maxHeight: position.maxHeight,
                zIndex: 70,
              }}
              className="card-shadow surface-line m-0 overflow-y-auto rounded-[18px] bg-white p-1.5 outline-none"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isHighlighted = index === highlightedIndex
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => commit(option)}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-[13px] px-3 py-2 text-sm transition ${
                      isHighlighted ? 'bg-emerald-50 text-slate-950' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <span aria-hidden="true" className="shrink-0 text-emerald-600">
                        ✓
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
