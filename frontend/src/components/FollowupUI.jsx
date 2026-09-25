import React from 'react'

export function FollowupIcon({ name, className = '' }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    inbox: <><path d="M4 5h16l2 10v4H2v-4L4 5Z" /><path d="M2 15h5l2 2h6l2-2h5" /></>,
    meeting: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 8h10M7 12h7M7 16h4" /></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    reply: <><path d="m9 17-5-5 5-5" /><path d="M4 12h10a6 6 0 0 1 6 6v1" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    sparkle: <><path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" /><path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75.75-2.25Z" /></>,
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function formatFollowupDate(value) {
  if (!value) return 'Not specified'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function FollowupAlert({ children }) {
  if (!children) return null
  return (
    <div className="followups-alert" role="alert">
      <span>!</span>
      <div><strong>Something needs attention</strong><p>{children}</p></div>
    </div>
  )
}

export function FollowupLoading() {
  return (
    <div className="followups-loading" role="status" aria-label="Loading follow-ups">
      {[0, 1].map((item) => (
        <div className="followups-skeleton" key={item}>
          <span className="skeleton-icon" />
          <div><span /><span /><span /></div>
        </div>
      ))}
    </div>
  )
}

export function FollowupEmpty({ employee = false }) {
  return (
    <div className="followups-empty">
      <span><FollowupIcon name="inbox" /></span>
      <p>{employee ? 'You’re all caught up' : 'No follow-ups yet'}</p>
      <small>{employee ? 'New follow-ups from your project manager will appear here.' : 'Follow-ups you create for action items will appear here.'}</small>
    </div>
  )
}
