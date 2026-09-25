import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import Dropdown from '../components/Dropdown.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { FollowupIcon } from '../components/FollowupUI.jsx'
import './Dashboard.css'

function Icon({ name, ...props }) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    folder: <><path d="M3 7V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 11h18" /></>,
    tasks: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 8 1 1 2-2m-3 8 1 1 2-2M14 8h3m-3 7h3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    alert: <><path d="m10.3 4.2-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.8l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    progress: <><path d="M12 3a9 9 0 1 1-9 9M3.5 8l1-2M7 4l2-1M12 7v5l3 2" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  }
  return paths[name]
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
    : <FollowupIcon name={name} {...props} />
}

function dateLabel(value) {
  if (!value) return 'No due date'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function EmptyState({ icon = 'tasks', title, children, action }) {
  return <div className="dashboard-empty"><span><Icon name={icon} /></span><h3>{title}</h3><p>{children}</p>{action}</div>
}

function FollowupModal({ token, item, onClose }) {
  const dialogRef = useRef(null)
  const [type, setType] = useState('Professional Message')
  const [message, setMessage] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const sent = current?.status === 'Sent'

  useEffect(() => {
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    const dialog = dialogRef.current
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    let active = true
    api.listFollowups(token, item.id)
      .then(rows => { if (active) setHistory(rows) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [token, item.id])

  async function run(kind, action) {
    if (busy) return
    setBusy(kind)
    setError('')
    setNotice('')
    try { await action() } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function persistDraft() {
    let saved
    if (current?.id) {
      await api.editFollowup(token, current.id, message.trim())
      saved = { ...current, message: message.trim() }
    } else {
      saved = await api.saveFollowup(token, item.id, type, message.trim())
    }
    setCurrent(saved)
    return saved
  }

  function generate() {
    run('generate', async () => {
      const draft = await api.generateActionFollowup(token, item.id, type)
      setCurrent(draft)
      setMessage(draft.message)
      setNotice('Your draft is ready. Give it a personal touch before sending.')
    })
  }

  function save() {
    run('save', async () => {
      await persistDraft()
      setNotice('Draft saved.')
      setHistory(await api.listFollowups(token, item.id))
    })
  }

  function send(followup) {
    run('send', async () => {
      const saved = !followup || followup.id === current?.id ? await persistDraft() : followup
      await api.markFollowupSent(token, saved.id)
      if (!followup || followup.id === current?.id) setCurrent({ ...saved, status: 'Sent' })
      setNotice('Follow-up sent to the team member’s inbox.')
      setHistory(await api.listFollowups(token, item.id))
    })
  }

  return createPortal(
    <dialog ref={dialogRef} className="dashboard-dialog" aria-labelledby="dashboard-followup-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="dashboard-dialog-inner">
        <header className="dashboard-dialog-heading"><div><p className="dashboard-eyebrow">A LITTLE NUDGE</p><h2 id="dashboard-followup-title">Keep the conversation moving</h2></div><button type="button" className="dashboard-icon-button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close follow-up"><Icon name="close" /></button></header>
        <div className="dashboard-dialog-body">
          <div className="dashboard-followup-context"><h3>{item.task}</h3><div><span><Icon name="person" />{item.owner_name || 'Unassigned'}</span><span><Icon name="calendar" />{dateLabel(item.deadline)}</span></div><p>{item.meeting_title || 'Meeting'} · {item.status} · {item.priority || 'Medium'} priority</p>{item.evidence && <blockquote>{item.evidence}</blockquote>}</div>
          {error && <div className="dashboard-alert" role="alert">{error}</div>}
          {notice && <div className="dashboard-notice" role="status"><Icon name="check" />{notice}</div>}
          {!item.owner_user_id && <p className="dashboard-helper">This task needs an assigned team member before a follow-up can be saved or sent.</p>}
          <div className="dashboard-compose-tools"><div><label htmlFor="dashboard-followup-type">Message style</label><Dropdown menuLabel="Message style" id="dashboard-followup-type" value={type} disabled={Boolean(busy)} onChange={event => { setType(event.target.value); setCurrent(null); setMessage(''); setNotice('') }}><option>Email</option><option>Professional Message</option><option>Short Reminder</option></Dropdown></div><button type="button" className="dashboard-button is-secondary" onClick={generate} disabled={Boolean(busy)}><Icon name="sparkle" />{busy === 'generate' ? 'Drafting…' : message ? 'Generate a new draft' : 'Help me draft'}</button></div>
          <label htmlFor="dashboard-followup-message">{sent ? 'Sent message' : 'Your message'}</label>
          <textarea id="dashboard-followup-message" rows="6" value={message} readOnly={sent} disabled={Boolean(busy)} placeholder="A thoughtful check-in starts here. Write your message or let Cadence help with a first draft." onChange={event => setMessage(event.target.value)} />
          <div className="dashboard-compose-actions"><button type="button" className="dashboard-text-button" disabled={!message || Boolean(busy)} onClick={() => run('copy', async () => { await navigator.clipboard.writeText(message); setNotice('Message copied.') })}><Icon name="copy" />Copy</button><div><button type="button" className="dashboard-button is-secondary" onClick={save} disabled={!message.trim() || !item.owner_user_id || sent || Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button><button type="button" className="dashboard-button" onClick={() => send()} disabled={!message.trim() || !item.owner_user_id || sent || Boolean(busy)}><Icon name={sent ? 'check' : 'send'} />{sent ? 'Sent' : busy === 'send' ? 'Sending…' : 'Send follow-up'}</button></div></div>
          <section className="dashboard-followup-history" aria-labelledby="dashboard-history-title"><h3 id="dashboard-history-title">Previous check-ins <span>{history.length}</span></h3>{historyLoading ? <p role="status">Loading previous check-ins…</p> : !history.length ? <p>No check-ins yet. Start the conversation above.</p> : history.map(followup => <article key={followup.id}><header><strong>{followup.followup_type}</strong><span className={`dashboard-tag ${followup.status === 'Sent' ? 'is-green' : ''}`}>{followup.status}</span></header><p>{followup.message}</p>{followup.employee_response && <div className="dashboard-task-response"><Icon name="reply" /><p>{followup.employee_response}</p></div>}{followup.status !== 'Sent' && <button type="button" className="dashboard-text-button" disabled={Boolean(busy)} onClick={() => send(followup)}>Send this draft<Icon name="arrow" /></button>}</article>)}</section>
        </div>
      </div>
    </dialog>, document.body,
  )
}

const filterLabels = { all: 'All tasks', Pending: 'Pending', 'In Progress': 'In progress', Completed: 'Completed', Overdue: 'Overdue', 'Due Soon': 'Due soon', 'At Risk': 'At risk' }

export default function Dashboard() {
  const { token, user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('all')
  const [sort, setSort] = useState('priority')
  const [savingId, setSavingId] = useState(null)
  const [riskResult, setRiskResult] = useState(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [followupItem, setFollowupItem] = useState(null)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const requestRef = useRef(0)
  const isPM = user?.role === 'pm'

  async function load() {
    const request = ++requestRef.current
    setError('')
    setLoading(true)
    try {
      const result = await api.dashboard(token)
      if (request === requestRef.current) setData(result)
    } catch (err) {
      if (request === requestRef.current) setError(err.message)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    setData(null)
    load()
    return () => { requestRef.current += 1 }
  }, [token])

  async function handleStatusChange(item, status) {
    if (savingId !== null) return
    setSavingId(item.id)
    setError('')
    setNotice('')
    try {
      await api.setStatus(token, item.id, status)
      setRiskResult(null)
      setNotice(`“${item.task}” marked ${status.toLowerCase()}.`)
      await load()
    } catch (err) { setError(err.message) } finally { setSavingId(null) }
  }

  async function handleRiskCheck() {
    setRiskLoading(true)
    setError('')
    try { setRiskResult((await api.riskCheck(token)).at_risk || []) }
    catch (err) { setError(err.message) }
    finally { setRiskLoading(false) }
  }

  const items = data?.items || []
  const projects = data?.projects || []
  const total = data?.total || 0
  const completed = data?.counts?.Completed || 0
  const completion = total ? Math.round(completed / total * 100) : 0
  const overdueIds = new Set((data?.overdue || []).map(item => item.id))
  const attention = [
    { label: 'Overdue', filter: 'Overdue', count: overdueIds.size, icon: 'alert', tone: 'rose', hint: 'A check-in could help' },
    { label: 'Due soon', filter: 'Due Soon', count: data?.follow_ups?.due_soon?.length || 0, icon: 'clock', tone: 'amber', hint: 'Due in the next 3 days' },
    { label: 'At risk', filter: 'At Risk', count: data?.follow_ups?.at_risk?.length || 0, icon: 'progress', tone: 'purple', hint: 'Make room for support' },
  ]
  const visibleItems = items.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'Overdue' ? overdueIds.has(item.id) : item.status === filter || item.follow_up_status === filter)
    const matchesProject = projectId === 'all' || String(item.project_id) === projectId
    const haystack = [item.task, item.owner_name, item.project_name, item.meeting_title].filter(Boolean).join(' ').toLowerCase()
    return matchesFilter && matchesProject && haystack.includes(search.trim().toLowerCase())
  }).sort((a, b) => {
    if (sort === 'newest') return b.id - a.id
    const dueTime = item => { const value = Date.parse(item.deadline); return Number.isNaN(value) ? Infinity : value }
    const byDate = dueTime(a) - dueTime(b)
    if (sort === 'deadline') return byDate || b.id - a.id
    const priorities = { High: 0, Medium: 1, Low: 2 }
    return (priorities[a.priority] ?? 1) - (priorities[b.priority] ?? 1) || byDate || b.id - a.id
  })

  function resetFilters() { setFilter('all'); setSearch(''); setProjectId('all') }
  const rawFirstName = user?.name?.trim().split(/\s+/)[0] || ''
  const firstName = rawFirstName ? rawFirstName.charAt(0).toLocaleUpperCase() + rawFirstName.slice(1) : 'there'
  const hasFilters = filter !== 'all' || projectId !== 'all' || Boolean(search)
  const overviewStats = [
    { label: 'Total tracked', value: total, icon: 'tasks', tone: 'purple', detail: 'Approved action items' },
    { label: 'Pending', value: data?.counts?.Pending || 0, icon: 'clock', tone: 'amber', detail: 'Ready for a first step' },
    { label: 'In progress', value: data?.counts?.['In Progress'] || 0, icon: 'progress', tone: 'blue', detail: 'Moving things forward' },
    { label: 'Overdue', value: overdueIds.size, icon: 'alert', tone: 'rose', detail: 'Past their due date' },
  ]

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow"><span />THE BIG PICTURE</p>
          <h1>Dashboard</h1>
          <p className="dashboard-welcome">Welcome back, {firstName}.</p>
          <p className="dashboard-intro">{isPM ? 'A little clarity for everything moving forward.' : 'Your next steps, all in one place.'}</p>
        </div>
        <Link className="dashboard-button" to={isPM ? '/new-meeting' : '/my-follow-ups'}>
          <Icon name={isPM ? 'plus' : 'message'} />{isPM ? 'New meeting' : 'My follow-ups'}
        </Link>
      </header>
      {error && <div className="dashboard-alert" role="alert"><Icon name="alert" /><div><strong>We couldn’t finish that</strong><p>{error}</p></div><button type="button" className="dashboard-text-button" onClick={load} disabled={loading}>Try again</button></div>}
      {notice && <div className="dashboard-notice" role="status"><Icon name="check" /><span>{notice}</span><button type="button" className="dashboard-icon-button" aria-label="Dismiss update" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
      {loading && !data ? <div className="dashboard-loading" role="status"><span className="dashboard-sr-only">Loading your dashboard</span><div className="dashboard-skeleton-banner" /><div className="dashboard-skeleton-metrics">{[0, 1, 2, 3].map(n => <span key={n} />)}</div><div className="dashboard-skeleton-content" /></div> : !data ? <section className="dashboard-panel"><EmptyState icon="alert" title="Let’s get your overview back">Your dashboard will appear here once the connection is restored.</EmptyState></section> : <>
        <section className="dashboard-momentum" aria-labelledby="dashboard-momentum-title"><div className="dashboard-momentum-copy"><p className="dashboard-eyebrow"><Icon name="sparkle" />SMALL STEPS. STEADY PROGRESS.</p><h2 id="dashboard-momentum-title">{!total ? 'Good meetings. Great beginnings.' : completed === total ? 'Look at that. All wrapped up.' : 'Every next step adds up.'}</h2><p>{!total ? isPM ? 'Turn your next conversation into a clear plan. Your team’s progress will take shape right here.' : 'Once your project manager assigns approved tasks, this is where your progress comes together.' : `${completed} of ${total} ${isPM ? 'team commitments' : 'tasks'} completed. ${completed === total ? 'Take a moment to appreciate the progress.' : 'Keep the important work in focus and the conversation going.'}`}</p><a href="#dashboard-tasks" className="dashboard-text-button">{total ? 'Find your next step' : 'See your action items'}<Icon name="arrow" /></a></div><div className="dashboard-completion"><div className="dashboard-ring" role="img" aria-label={`${completion}% completed, ${completed} of ${total} tasks`}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="dashboard-ring-track" cx="60" cy="60" r="51" /><circle className="dashboard-ring-fill" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${completion} 100`} /></svg><div><strong>{completion}<span>%</span></strong><small>completed</small></div></div><span><i />{completed} {completed === 1 ? 'commitment' : 'commitments'} kept</span></div></section>
        <section className="dashboard-metrics" aria-label="Action item overview">{overviewStats.map(stat => <article className={`dashboard-metric is-${stat.tone}`} key={stat.label}><div><span className="dashboard-metric-icon"><Icon name={stat.icon} /></span><span>{stat.label}</span></div><strong>{stat.value}</strong><p>{stat.detail}</p></article>)}</section>
        <div className="dashboard-grid">
          <section className="dashboard-panel dashboard-tasks" id="dashboard-tasks" aria-labelledby="dashboard-tasks-title" aria-busy={loading || savingId !== null}>
            <header className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">FROM CONVERSATION TO ACTION</p><h2 id="dashboard-tasks-title">{isPM ? 'Action items' : 'My tasks'} <span className="dashboard-count">{items.length}</span></h2></div><label className="dashboard-sort"><span className="dashboard-sr-only">Sort tasks</span><Dropdown menuLabel="Sort tasks" aria-label="Sort tasks" value={sort} onChange={event => setSort(event.target.value)}><option value="priority">Priority first</option><option value="deadline">Due date</option><option value="newest">Newest first</option></Dropdown></label></header>
            <div className="dashboard-task-tools"><div className="dashboard-filters" role="group" aria-label="Filter tasks by status">{['all', 'Pending', 'In Progress', 'Completed'].map(value => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{filterLabels[value]}<span>{value === 'all' ? total : data.counts[value] || 0}</span></button>)}</div><div className="dashboard-search-row"><label className="dashboard-search"><Icon name="search" /><span className="dashboard-sr-only">Search tasks</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a task, person, or meeting…" /></label><label className="dashboard-project-select"><span className="dashboard-sr-only">Filter by project</span><Dropdown searchable menuLabel="Projects" aria-label="Filter by project" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="all">All projects</option>{projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}</Dropdown></label></div>{hasFilters && <div className="dashboard-filter-note"><span>{filterLabels[filter]}{projectId !== 'all' ? ` · ${projects.find(p => String(p.id) === projectId)?.name || 'Selected project'}` : ''}</span><button type="button" className="dashboard-text-button" onClick={resetFilters}>Clear filters<Icon name="close" /></button></div>}</div>
            <div className="dashboard-task-list">{!items.length ? <EmptyState title={isPM ? 'Your next meeting starts the momentum' : 'A little breathing room'} action={isPM && <Link to="/new-meeting" className="dashboard-button"><Icon name="plus" />Add a meeting</Link>}>{isPM ? 'Add a meeting and approve its action items. Clear owners and next steps will appear here.' : 'You have no assigned tasks yet. New action items from your project manager will appear here.'}</EmptyState> : !visibleItems.length ? <EmptyState icon="search" title="No tasks in this view" action={<button type="button" className="dashboard-button is-secondary" onClick={resetFilters}>Clear filters</button>}>Try another status, project, or search to find what you’re looking for.</EmptyState> : visibleItems.map(item => <article className={`dashboard-task${item.status === 'Completed' ? ' is-completed' : ''}`} key={item.id}><div className="dashboard-task-top"><span className={`dashboard-task-marker${item.status === 'Completed' ? ' is-done' : ''}`}><Icon name={item.status === 'Completed' ? 'check' : 'tasks'} /></span><div className="dashboard-task-copy"><div className="dashboard-task-tags"><span className={`dashboard-priority is-${(item.priority || 'Medium').toLowerCase()}`}><i />{item.priority || 'Medium'} priority</span>{item.follow_up_status && item.follow_up_status !== 'Completed' && <span className={`dashboard-tag ${overdueIds.has(item.id) ? 'is-rose' : 'is-amber'}`}>{item.follow_up_status}</span>}</div><h3>{item.task}</h3><p className="dashboard-task-source">{item.project_name && <span><Icon name="folder" />{item.project_name}</span>}{item.meeting_title && <span><Icon name="meeting" />{item.meeting_title}</span>}</p></div></div><div className="dashboard-task-bottom"><div className="dashboard-task-meta"><span className="dashboard-assignee"><span className="dashboard-avatar">{initials(item.owner_name)}</span>{item.owner_name || 'Unassigned'}</span><span className={overdueIds.has(item.id) ? 'is-overdue' : ''}><Icon name="calendar" />{dateLabel(item.deadline)}</span></div><label className={`dashboard-status is-${item.status.toLowerCase().replaceAll(' ', '-')}`}><span className="dashboard-sr-only">Status for {item.task}</span><Dropdown menuLabel="Task status" aria-label={`Status for ${item.task}`} value={item.status} disabled={savingId !== null || loading} onChange={event => handleStatusChange(item, event.target.value)}>{!['Pending', 'In Progress', 'Completed'].includes(item.status) && <option>{item.status}</option>}<option>Pending</option><option>In Progress</option><option>Completed</option></Dropdown></label></div>{isPM && item.employee_response && <div className="dashboard-task-response"><Icon name="reply" /><p><strong>Latest update</strong>{item.employee_response}</p></div>}{isPM && item.status !== 'Completed' && <button type="button" className="dashboard-text-button dashboard-task-followup" onClick={() => setFollowupItem(item)}><Icon name="message" />Follow up<Icon name="arrow" /></button>}</article>)}</div>
            {items.length > 0 && <footer className="dashboard-task-footer" role="status">Showing {visibleItems.length} of {items.length} action items<span>{savingId !== null ? 'Saving your update…' : loading ? 'Refreshing…' : 'One step at a time.'}</span></footer>}
          </section>
          <aside className="dashboard-sidebar" aria-label="Project and commitment overview">
            <section className="dashboard-panel" aria-labelledby="dashboard-attention-title"><header className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">KEEP AN EYE ON</p><h2 id="dashboard-attention-title">What needs a nudge</h2></div><span className="dashboard-heading-icon"><Icon name="message" /></span></header><div className="dashboard-attention-list">{attention.map(group => <button type="button" key={group.filter} className={`dashboard-attention is-${group.tone}${filter === group.filter ? ' is-selected' : ''}`} aria-pressed={filter === group.filter} onClick={() => { setFilter(group.filter); setProjectId('all'); setSearch('') }}><span className="dashboard-metric-icon"><Icon name={group.icon} /></span><span><strong>{group.label}</strong><small>{group.hint}</small></span><b>{group.count}</b><Icon name="arrow" /></button>)}</div><div className="dashboard-sidebar-note"><Icon name="sparkle" /><p>{!total ? 'As work takes shape, we’ll help you spot what needs a little attention.' : attention.every(group => !group.count) ? 'No urgent nudges right now. A good moment to keep moving.' : 'A thoughtful check-in can make the next step a little easier.'}</p></div></section>
            <section className="dashboard-panel" aria-labelledby="dashboard-projects-title"><header className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">SHARED SPACES</p><h2 id="dashboard-projects-title">Your projects <span className="dashboard-count">{projects.length}</span></h2></div>{isPM && <Link to="/projects" className="dashboard-icon-button" aria-label="Manage projects"><Icon name="arrow" /></Link>}</header>{projects.length ? <div className="dashboard-projects">{(showAllProjects ? projects : projects.slice(0, 4)).map(project => { const tasks = items.filter(item => item.project_id === project.id); const done = tasks.filter(item => item.status === 'Completed').length; return <button type="button" key={project.id} className={`dashboard-project${projectId === String(project.id) ? ' is-selected' : ''}`} aria-pressed={projectId === String(project.id)} onClick={() => { setProjectId(projectId === String(project.id) ? 'all' : String(project.id)); setFilter('all'); setSearch('') }}><span className="dashboard-project-title"><Icon name="folder" /><strong>{project.name}</strong><Icon name="arrow" /></span><span className="dashboard-project-progress" aria-hidden="true"><i style={{ width: `${tasks.length ? done / tasks.length * 100 : 0}%` }} /></span><small>{tasks.length ? `${done} of ${tasks.length} ${isPM ? 'actions' : 'your tasks'} complete` : isPM ? 'Ready for its first action item' : 'No tasks assigned to you yet'}</small></button> })}{projects.length > 4 && <button type="button" className="dashboard-text-button dashboard-show-projects" onClick={() => setShowAllProjects(value => !value)}>{showAllProjects ? 'Show fewer projects' : `View all ${projects.length} projects`}</button>}</div> : <EmptyState icon="folder" title={isPM ? 'Make room for your team' : 'Your team space is on its way'} action={isPM && <Link to="/projects" className="dashboard-text-button">Create a project<Icon name="arrow" /></Link>}>{isPM ? 'Bring people and their next steps together in a project.' : 'Your projects will appear here when your manager adds you to a team.'}</EmptyState>}</section>
            <section className="dashboard-insight" aria-labelledby="dashboard-insight-title"><span className="dashboard-insight-icon"><Icon name={isPM ? 'sparkle' : 'message'} /></span><h2 id="dashboard-insight-title">{isPM ? 'A fresh perspective' : 'Keep your team in the loop'}</h2><p>{isPM ? 'Let Cadence take a look at open commitments and flag what might need support.' : 'A quick update keeps everyone on the same page. See your check-ins and share how things are going.'}</p>{isPM ? <><button type="button" className="dashboard-button is-secondary" onClick={handleRiskCheck} disabled={riskLoading || total === completed}><Icon name="sparkle" />{riskLoading ? 'Looking things over…' : 'Run risk assessment'}</button>{total === completed && <small>Add open action items to get started.</small>}{riskResult !== null && <div className="dashboard-risk-result" role="status">{!riskResult.length ? <p><Icon name="check" />No concerns flagged in this assessment.</p> : <><strong>{riskResult.length} {riskResult.length === 1 ? 'commitment could' : 'commitments could'} use a closer look</strong><ul>{riskResult.map((risk, index) => <li key={`${risk.id}-${index}`}><strong>{items.find(item => item.id === Number(risk.id))?.task || `Action item #${risk.id}`}</strong><p>{risk.reason}</p></li>)}</ul></>}<small>AI suggestions · Use your judgment when planning next steps.</small></div>}</> : <Link className="dashboard-text-button" to="/my-follow-ups">View my follow-ups<Icon name="arrow" /></Link>}</section>
          </aside>
        </div>
        <footer className="dashboard-page-footer"><span className="dashboard-footer-mark" aria-hidden="true"><i /><i /><i /><i /></span>A little more clarity. A little more momentum.</footer>
      </>}
      {isPM && followupItem && <FollowupModal token={token} item={followupItem} onClose={() => setFollowupItem(null)} />}
    </div>
  )
}
