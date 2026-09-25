import React, { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Dropdown.css'

function Chevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
}

function optionTone(label) {
  return ({ High: 'rose', Medium: 'amber', Low: 'green', Pending: 'amber', 'In Progress': 'blue', Completed: 'green', 'At Risk': 'rose' })[label] || ''
}

// Keep the native select for form validation and change events; the visible
// combobox and portaled list provide the same interaction across pages.
export default function Dropdown({
  children, id, value, onChange, disabled = false, required = false, name,
  searchable = false, placeholder = 'Choose an option', menuLabel = 'Options',
  emptyMessage = 'No matching options', className = '', ...ariaProps
}) {
  const generatedId = useId()
  const controlId = id || `dropdown-${generatedId}`
  const listId = `${controlId}-options`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const nativeRef = useRef(null)
  const menuRef = useRef(null)
  const typeaheadRef = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [invalid, setInvalid] = useState(false)
  const [position, setPosition] = useState(null)
  const options = Children.toArray(children).filter(isValidElement).map((child) => ({
    value: String(child.props.value ?? child.props.children),
    label: String(child.props.children ?? ''),
    disabled: Boolean(child.props.disabled),
    hidden: Boolean(child.props.hidden),
    description: child.props['data-description'],
    avatar: child.props['data-avatar'],
  }))
  const selected = options.find(option => option.value === String(value ?? ''))
  const filtered = options.filter(option => !option.hidden && `${option.label} ${option.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const activeOption = filtered[activeIndex]
  const expanded = open && !disabled
  const tone = optionTone(selected?.label)

  function close() {
    setOpen(false)
    setQuery('')
    setPosition(null)
  }

  function show() {
    if (nativeRef.current?.matches(':disabled')) return
    setQuery('')
    const visibleOptions = options.filter(option => !option.hidden)
    const selectedIndex = visibleOptions.findIndex(option => option.value === String(value) && !option.disabled)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, visibleOptions.findIndex(option => !option.disabled)))
    setOpen(true)
  }

  function choose(option) {
    if (!option || option.disabled || nativeRef.current?.matches(':disabled')) return
    nativeRef.current.value = option.value
    nativeRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    setInvalid(required && !option.value)
    close()
    triggerRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (disabled) close()
  }, [disabled])

  useLayoutEffect(() => {
    if (!expanded) return
    function place() {
      const rect = rootRef.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft || 0
      const viewportTop = viewport?.offsetTop || 0
      const viewportWidth = viewport?.width || window.innerWidth
      const viewportHeight = viewport?.height || window.innerHeight
      const width = Math.min(Math.max(rect.width, 240), viewportWidth - 24)
      const below = viewportTop + viewportHeight - rect.bottom - 20
      const above = rect.top - viewportTop - 20
      const upwards = below < 260 && above > below
      const maxHeight = Math.max(80, Math.min(350, upwards ? above : below))
      setPosition({
        left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)),
        top: upwards ? undefined : rect.bottom + 7,
        bottom: upwards ? window.innerHeight - rect.top + 7 : undefined,
        width, maxHeight,
      })
    }
    function outside(event) {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close()
    }
    function scroll(event) {
      if (!menuRef.current?.contains(event.target)) place()
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(rootRef.current)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scroll, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', scroll, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded) menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [expanded, activeIndex, query, position?.maxHeight])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) { show(); return }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      for (let step = 1; step <= filtered.length; step++) {
        const next = (activeIndex + direction * step + filtered.length) % filtered.length
        if (!filtered[next].disabled) { setActiveIndex(next); break }
      }
    } else if ((event.key === 'Home' || event.key === 'End') && expanded && !searchable) {
      event.preventDefault()
      const indexes = filtered.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0)
      setActiveIndex((event.key === 'Home' ? indexes[0] : indexes.at(-1)) ?? 0)
    } else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault()
      if (expanded) choose(activeOption)
      else show()
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      if (!expanded) show()
      const now = Date.now()
      const previous = typeaheadRef.current
      const text = (now - previous.time < 600 ? previous.text : '') + event.key.toLocaleLowerCase()
      typeaheadRef.current = { text, time: now }
      const match = filtered.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(text))
      if (match >= 0) setActiveIndex(match)
    }
  }

  const controlProps = {
    ...ariaProps, id: controlId, ref: triggerRef, role: 'combobox',
    'aria-expanded': expanded, 'aria-haspopup': 'listbox', 'aria-controls': expanded ? listId : undefined,
    'aria-activedescendant': expanded && activeOption ? `${listId}-${activeIndex}` : undefined,
    'aria-required': required || undefined, 'aria-invalid': invalid || undefined,
    disabled, onKeyDown: handleKeyDown,
  }

  return (
    <span ref={rootRef} className={`cadence-dropdown${expanded ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}${tone ? ` tone-${tone}` : ''} ${className}`}>
      {searchable ? (
        <span className="cadence-dropdown-search-field">
          <input
            {...controlProps}
            className="cadence-dropdown-search"
            autoComplete="off"
            aria-autocomplete="list"
            value={expanded ? query : selected?.value ? selected.label : ''}
            placeholder={expanded ? 'Type to search...' : selected?.label || placeholder}
            onFocus={event => event.currentTarget.select()}
            onClick={() => { if (!expanded) show() }}
            onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true) }}
          />
          <button type="button" className="cadence-dropdown-toggle" tabIndex={-1} disabled={disabled} aria-label={expanded ? 'Close options' : 'Show options'} onMouseDown={event => event.preventDefault()} onClick={() => { triggerRef.current?.focus(); if (expanded) close(); else show() }}><Chevron /></button>
        </span>
      ) : (
        <button {...controlProps} type="button" className="cadence-dropdown-trigger" onClick={() => expanded ? close() : show()}>
          {tone && <span className="cadence-dropdown-dot" aria-hidden="true" />}
          <span className={`cadence-dropdown-value${!selected?.value ? ' is-placeholder' : ''}`}>{selected?.label || placeholder}</span><Chevron />
        </button>
      )}
      <select ref={nativeRef} className="cadence-dropdown-native" tabIndex={-1} aria-hidden="true" name={name} value={value} disabled={disabled} required={required} onChange={onChange} onInvalid={event => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus(); show() }}>{children}</select>
      {expanded && position && createPortal(
        <div ref={menuRef} className="cadence-dropdown-menu" style={position} onClick={event => event.stopPropagation()}>
          <div className="cadence-dropdown-menu-heading"><span>{menuLabel}</span><span>{filtered.length}</span></div>
          <ul id={listId} role="listbox" aria-label={menuLabel} className="cadence-dropdown-options">
            {filtered.map((option, index) => {
              const isSelected = option.value === String(value)
              const optionColor = optionTone(option.label)
              return <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={isSelected} aria-disabled={option.disabled || undefined} data-active={index === activeIndex} className={`cadence-dropdown-option${isSelected ? ' is-selected' : ''}${optionColor ? ` tone-${optionColor}` : ''}`} onMouseDown={event => event.preventDefault()} onPointerMove={event => { if (event.pointerType === 'mouse' && !option.disabled) setActiveIndex(index) }} onClick={() => choose(option)}>
                {option.avatar ? <span className="cadence-dropdown-avatar" aria-hidden="true">{option.avatar}</span> : optionColor ? <span className="cadence-dropdown-dot" aria-hidden="true" /> : null}
                <span className="cadence-dropdown-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
                {isSelected && <svg className="cadence-dropdown-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
              </li>
            })}
          </ul>
          {!filtered.length && <div className="cadence-dropdown-empty" role="status"><strong>{emptyMessage}</strong><span>{query ? 'Try a different search.' : 'Choices will appear here when available.'}</span></div>}
        </div>, rootRef.current?.closest('dialog') || document.body,
      )}
    </span>
  )
}
