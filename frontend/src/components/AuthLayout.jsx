import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './AuthLayout.css'

export function AuthIcon({ name, ...props }) {
  const paths = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.3 4.1M6.1 6.1A21 21 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5-1.2M10 10a3 3 0 0 0 4 4" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v.1" /></>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

export function AuthField({ id, label, icon, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        <AuthIcon name={icon} />
        <input id={id} name={id} type={isPassword && visible ? 'text' : type} {...props} />
        {isPassword && <button className="auth-password-toggle" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls={id}><AuthIcon name={visible ? 'hidden' : 'eye'} /></button>}
      </div>
    </div>
  )
}

export function AuthError({ children }) {
  return children ? <div className="auth-error" role="alert"><AuthIcon name="alert" /><span>{children}</span></div> : null
}

export function AuthSubmit({ loading, children, loadingText }) {
  return <button className="auth-submit" type="submit" disabled={loading} aria-busy={loading}>{loading ? <><span className="auth-spinner" />{loadingText}</> : <>{children}<AuthIcon name="arrow" /></>}</button>
}

function WorkspacePreview() {
  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview-orbit" />
      <div className="auth-preview-note"><span><AuthIcon name="spark" /></span><div>Less busywork.<strong>More forward motion.</strong></div></div>
      <div className="auth-meeting-card">
        <div className="auth-preview-top"><span className="auth-preview-label"><i />MEETING</span><span className="auth-preview-dots">•••</span></div>
        <h3>A great conversation.</h3>
        <p>Weekly team sync <span>·</span> 24 min</p>
        <div className="auth-waveform">{[12, 22, 16, 34, 26, 45, 31, 20, 39, 52, 34, 22, 42, 30, 56, 43, 27, 38, 21, 46, 33, 50, 28, 18, 34, 23, 40, 26, 15, 22, 12, 18].map((height, index) => <i key={index} style={{ height, '--bar-index': index }} />)}</div>
        <div className="auth-preview-bottom"><div className="auth-preview-avatars"><span>AK</span><span>SR</span><span>JM</span></div><span>Everyone on the same page.</span></div>
      </div>
      <div className="auth-preview-connector"><span /><AuthIcon name="spark" /><span /></div>
      <div className="auth-action-card">
        <div className="auth-preview-top"><span className="auth-preview-label">MOMENTUM</span><span className="auth-preview-badge">Clear next steps</span></div>
        <h3>An even better follow-through.</h3>
        <div className="auth-preview-task"><span className="auth-task-check"><AuthIcon name="check" /></span><div><strong>Share the project brief</strong><small>Alex · Design team</small></div><span className="auth-task-status">Done</span></div>
        <div className="auth-preview-task"><span className="auth-task-pending" /><div><strong>Bring the next idea to life</strong><small>You · Product team</small></div><span className="auth-task-avatar">YO</span></div>
        <div className="auth-preview-progress"><span /><span /><span /><span /><span /></div>
        <div className="auth-progress-caption"><span>A little progress, every day.</span><AuthIcon name="arrow" /></div>
      </div>
    </div>
  )
}

export default function AuthLayout({ mode, children }) {
  const signup = mode === 'signup'
  useEffect(() => {
    const previous = document.title
    document.title = `${signup ? 'Create your account' : 'Welcome back'} · Cadence`
    return () => { document.title = previous }
  }, [signup])

  return (
    <main className={`auth-page ${signup ? 'auth-page-signup' : ''}`}>
      <section className="auth-story" aria-label="Meet Cadence">
        <Link to="/login" className="auth-brand" aria-label="Cadence home"><span className="auth-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>cadence<span>.</span></span></Link>
        <div className="auth-story-content">
          <div className="auth-eyebrow"><span /> A LITTLE MORE MOMENTUM</div>
          <h1><span className="auth-headline-shine">Meetings that move work forward.</span><br /><span className="auth-headline-shine auth-headline-accent">Capture. Understand. Act.</span></h1>
          <p>Turn conversations into clear next steps.<br className="auth-desktop-break" /> Keep your team in sync and your work moving.</p>
          <WorkspacePreview />
        </div>
        <div className="auth-story-footer"><span>Made for teams that move together.</span><span className="auth-footer-spark"><AuthIcon name="spark" /></span></div>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-heading">
        <div className="auth-top-link"><span>{signup ? 'Already part of the team?' : 'New to Cadence?'}</span><Link to={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Create an account'}<AuthIcon name="arrow" /></Link></div>
        <div className="auth-form-content" key={mode}>
          <div className="auth-welcome-icon"><AuthIcon name={signup ? 'spark' : 'lock'} /></div>
          <span className="auth-form-eyebrow">{signup ? 'YOUR NEXT CHAPTER' : 'YOUR WORK, IN RHYTHM'}</span>
          <h2 id="auth-heading">{signup ? 'Find your flow.' : 'Welcome back.'}</h2>
          <p className="auth-form-description">{signup ? 'A little less follow-up. A lot more moving forward.' : 'Good to see you. Let’s pick up where you left off.'}</p>
          {children}
          <div className="auth-form-switch">{signup ? 'Already have an account?' : 'Don’t have an account yet?'} <Link to={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Join your team'}<AuthIcon name="arrow" /></Link></div>
        </div>
        <footer className="auth-panel-footer"><span>© {new Date().getFullYear()} Cadence</span><span>Good meetings. Great momentum.</span></footer>
      </section>
    </main>
  )
}
