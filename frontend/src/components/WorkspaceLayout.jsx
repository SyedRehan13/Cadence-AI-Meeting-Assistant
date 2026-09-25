import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './WorkspaceLayout.css'

function Icon({ name, ...props }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    recordings: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Z" /><path d="m10 8 5 4-5 4V8Z" /></>,
    projects: <><path d="M3 8V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><path d="M3 11h18" /></>,
    meeting: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5" /></>,
    followups: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5A8.5 8.5 0 0 1 11.5 3" /><path d="m14 6 3 3 5-6M7 11h5M7 15h9" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m4-11 3 3-3 3" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 6h16M4 12h12M4 18h16" />,
    logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M9 12h12m-4-4 4 4-4 4" /></>,
    arrow: <path d="m9 6 6 6-6 6" />,
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

function BrandMark() {
  return <span className="cadence-mark" aria-hidden="true"><i /><i /><i /><i /></span>
}

export default function WorkspaceLayout({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const sidebarRef = useRef(null)
  const menuRef = useRef(null)
  const toggleRef = useRef(null)
  const expanded = isMobile ? mobileOpen : pinned || hovered || focused

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => {
      setIsMobile(query.matches)
      setMobileOpen(false)
      setHovered(false)
      setFocused(false)
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [pathname, user])

  useEffect(() => {
    if (!isMobile || !mobileOpen || !user) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    toggleRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      menuRef.current?.focus()
    }
  }, [isMobile, mobileOpen, user])

  if (!user) return children

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', detail: 'The big picture' },
    ...(user.role === 'pm' ? [
      { to: '/projects', label: 'Projects', icon: 'projects', detail: 'People & progress' },
      { to: '/new-meeting', label: 'New Meeting', icon: 'meeting', detail: 'Turn talk into action' },
      { to: '/past-meetings', label: 'Past Meetings', icon: 'recordings', detail: 'Listen back' },
      { to: '/follow-ups', label: 'Follow-Ups', icon: 'followups', detail: 'Keep things moving' },
    ] : user.role === 'employee' ? [
      { to: '/past-meetings', label: 'Past Meetings', icon: 'recordings', detail: 'Listen back' },
      { to: '/my-follow-ups', label: 'My Follow-Ups', icon: 'followups', detail: 'Updates & next steps' },
    ] : []),
  ]
  const pageTitle = pathname === '/account' ? 'My account' : links.find((link) => link.to === pathname)?.label || 'Workspace'
  const initials = (user.name || 'User').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setMobileOpen(false)
      setPinned(false)
      setHovered(false)
      setFocused(false)
    }
    if (isMobile && mobileOpen && event.key === 'Tab') {
      const controls = sidebarRef.current.querySelectorAll('a[href], button')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div className={`workspace-shell${expanded && !isMobile ? ' is-sidebar-expanded' : ''}`}>
      <a className="workspace-skip" href="#workspace-main" inert={isMobile && mobileOpen ? '' : undefined}>Skip to content</a>
      <header className="workspace-mobile-bar" inert={isMobile && mobileOpen ? '' : undefined}>
        <div className="mobile-brand"><BrandMark /><strong>cadence<span>.</span></strong></div>
        <button ref={menuRef} className="workspace-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="workspace-sidebar"><Icon name="menu" /></button>
      </header>
      {isMobile && mobileOpen && <div className="workspace-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside
        id="workspace-sidebar"
        ref={sidebarRef}
        className={`workspace-sidebar${expanded ? ' is-expanded' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
        aria-label="Workspace navigation"
        role={isMobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        inert={isMobile && !mobileOpen ? '' : undefined}
        onPointerEnter={(event) => { if (!isMobile && event.pointerType === 'mouse') setHovered(true) }}
        onPointerLeave={() => setHovered(false)}
        onFocus={(event) => { if (!isMobile && event.target.matches(':focus-visible')) setFocused(true) }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
        onKeyDown={handleKeyDown}
      >
        <div className="sidebar-brand"><BrandMark /><div className="sidebar-reveal"><span className="sidebar-wordmark">cadence<span>.</span></span><span className="sidebar-tagline">A little more momentum.</span></div></div>
        <button
          ref={toggleRef}
          type="button"
          className={`sidebar-toggle${pinned ? ' is-pinned' : ''}`}
          onClick={() => isMobile ? setMobileOpen(false) : setPinned((value) => !value)}
          aria-label={isMobile ? 'Close navigation' : pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          aria-expanded={expanded}
          aria-controls="workspace-navigation"
          title={isMobile ? 'Close navigation' : pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
        ><Icon name={isMobile ? 'close' : 'panel'} /><span className="sidebar-reveal">{isMobile ? 'Close menu' : pinned ? 'Unpin sidebar' : 'Pin sidebar open'}</span></button>
        <div className="sidebar-section-label"><span className="sidebar-section-dot" /><span className="sidebar-reveal">YOUR WORKSPACE</span></div>
        <nav id="workspace-navigation" className="sidebar-navigation" aria-label="Main navigation">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end aria-label={link.label} title={!expanded ? link.label : undefined} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`} onClick={() => setMobileOpen(false)}>
              <span className="sidebar-link-icon"><Icon name={link.icon} /></span>
              <span className="sidebar-link-copy sidebar-reveal"><span>{link.label}</span><small>{link.detail}</small></span>
              <Icon name="arrow" className="sidebar-link-arrow sidebar-reveal" />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-momentum sidebar-reveal"><span className="momentum-orbit" aria-hidden="true" /><span>Good meetings.<br /><strong>Great momentum.</strong></span></div>
          <NavLink to="/account" className={({ isActive }) => `sidebar-profile${isActive ? ' is-active' : ''}`} title="View and edit your account" aria-label={`My account: ${user.name}`} onClick={() => setMobileOpen(false)}>
            <span className="sidebar-avatar">{initials}<i /></span>
            <span className="sidebar-profile-copy sidebar-reveal"><strong>{user.name}</strong><small>{user.role === 'pm' ? 'Project Manager' : 'Team Member'}</small></span>
            <Icon name="arrow" className="sidebar-profile-arrow sidebar-reveal" />
          </NavLink>
          <button type="button" className="sidebar-logout" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /><span className="sidebar-reveal">Log out</span></button>
        </div>
      </aside>
      <div className="workspace-content" inert={isMobile && mobileOpen ? '' : undefined}>
        <div className="workspace-breadcrumb"><span>Workspace</span><Icon name="arrow" /><strong>{pageTitle}</strong><span className="workspace-live"><i />Let’s make progress</span></div>
        <main id="workspace-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}
