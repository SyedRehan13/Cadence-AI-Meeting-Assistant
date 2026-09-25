import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import AccountActionDialog from '../components/AccountActionDialog.jsx'
import './Account.css'

function AccountIcon({ name }) {
  const paths = {
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    edit: <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" />,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V4h8v3M3 12h18" /></>,
    devices: <><rect x="2" y="4" width="14" height="11" rx="2" /><path d="M6 20h6M9 15v5" /><rect x="17" y="10" width="5" height="11" rx="1" /></>,
    link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 7l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7M10 11v5M14 11v5" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function fieldsFor(profile) {
  return { name: profile.name, email: profile.email, job_title: profile.job_title || '', department: profile.department || '' }
}

export default function Account() {
  const { token, login, logout } = useAuth()
  const navigate = useNavigate()
  const loadedToken = useRef(null)
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', job_title: '', department: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [action, setAction] = useState(null)

  useEffect(() => {
    if (loadedToken.current === token) return
    let active = true
    api.profile(token).then((data) => {
      if (!active) return
      loadedToken.current = token
      setProfile(data)
      setForm(fieldsFor(data))
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, retry])

  const dirty = profile && Object.entries(form).some(([key, value]) => value.trim() !== (profile[key] || ''))

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setNotice('')
    setError(null)
  }

  function reset() {
    setForm(fieldsFor(profile))
    setError(null)
    setNotice('')
  }

  function applySession(data, resetDraft = false) {
    loadedToken.current = data.access_token
    setProfile(data.user)
    if (resetDraft) setForm(fieldsFor(data.user))
    login(data.access_token, data.user)
  }

  function completeAction(kind, data) {
    setAction(null)
    if (kind === 'delete' || kind === 'signout') {
      logout()
      navigate('/login', { replace: true })
      return
    }
    applySession(data, kind === 'profile')
    setNotice({ profile: 'Your account details have been saved.', password: 'Password saved. Other devices have been signed out.', link: 'Your Google account is connected.', unlink: 'Google has been unlinked. You can sign in with your email and password.' }[kind])
  }

  async function save(event) {
    event.preventDefault()
    if (saving || !dirty) return
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!payload.name) { setError('Please enter your name.'); return }
    setError(null)
    setNotice('')
    if (payload.email !== profile.email) { setAction({ kind: 'profile', payload }); return }
    setSaving(true)
    try {
      const data = await api.updateProfile(token, payload)
      applySession(data, true)
      setNotice('Your account details have been saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const initials = (profile?.name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const joined = profile?.created_at ? new Date(profile.created_at) : null
  const joinedLabel = joined && !Number.isNaN(joined.getTime()) ? joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Not available'

  return (
    <>
      <div className="account-page" inert={action ? '' : undefined}>
        <header className="account-heading"><p className="account-eyebrow"><span />YOUR SPACE</p><h1>My account</h1><p>Your profile, your team, and the ways you sign in.</p></header>
        {error && <div className="account-alert is-error" role="alert">{error}</div>}
        {notice && <div className="account-alert is-success" role="status"><AccountIcon name="check" />{notice}</div>}
        {loading ? <div className="account-loading" role="status">Loading your account...</div> : !profile ? (
          <button type="button" className="account-save" onClick={() => { loadedToken.current = null; setError(null); setLoading(true); setRetry((value) => value + 1) }}>Try again</button>
        ) : (
          <div className="account-grid">
            <aside className="account-summary" aria-label="Your account and team overview">
              <div className="account-summary-banner" aria-hidden="true"><span /><span /></div>
              <div className="account-avatar" aria-hidden="true">{initials}</div>
              <h2>{profile.name}</h2>
              {profile.job_title && <p className="account-designation">{profile.job_title}</p>}
              <p className="account-summary-email">{profile.email}</p>
              <span className="account-role-badge"><AccountIcon name={profile.role === 'pm' ? 'team' : 'person'} />Role: {profile.role === 'pm' ? 'Project Manager' : 'Team Member'}</span>
              <dl className="account-facts">
                <div><dt>Department / team</dt><dd>{profile.department || 'Not set yet'}</dd></div>
                {profile.role === 'pm' ? <div><dt>Number of team members</dt><dd className="account-team-count">{profile.team_member_count ?? 0}<small>Unique people across your projects</small></dd></div> : <div><dt>Reporting PM / Manager</dt><dd>{profile.reporting_managers?.length ? profile.reporting_managers.map((manager) => <span className="account-manager" key={manager.id}>{manager.name}</span>) : 'No PM assigned yet'}<small>Based on your project assignments</small></dd></div>}
                <div><dt>{profile.role === 'pm' ? 'Your project teams' : 'Assigned project teams'}</dt><dd>{profile.project_teams?.length ? <div className="account-team-tags">{profile.project_teams.map((team) => <span key={team.id}>{team.name}</span>)}</div> : 'No projects assigned yet'}</dd></div>
                <div><dt>Member since</dt><dd>{joinedLabel}</dd></div>
              </dl>
            </aside>

            <div className="account-sections">
              <form className="account-form" onSubmit={save} aria-label="Edit account details">
                <div className="account-form-heading"><span><AccountIcon name="edit" /></span><div><h2>Personal details</h2><p>Keep your team up to date.</p></div></div>
                <fieldset className="account-fields" disabled={saving}>
                  <legend className="account-sr-only">Profile information</legend>
                  {[{ key: 'name', label: 'Full name', icon: 'person', autoComplete: 'name', required: true }, { key: 'job_title', label: 'Job title / designation', icon: 'briefcase', autoComplete: 'organization-title', placeholder: 'e.g. Product Designer' }, { key: 'department', label: 'Department or team', icon: 'team', autoComplete: 'organization', placeholder: 'e.g. Design & Product' }, { key: 'email', label: 'Email address', icon: 'mail', autoComplete: 'email', type: 'email', required: true }].map((field) => (
                    <div className="account-field" key={field.key}><label htmlFor={`account-${field.key}`}>{field.label}</label><div className="account-input-wrap"><AccountIcon name={field.icon} /><input id={`account-${field.key}`} type={field.type || 'text'} value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} autoComplete={field.autoComplete} required={field.required} maxLength={field.key === 'email' ? 254 : 100} placeholder={field.placeholder} aria-describedby={field.key === 'email' ? 'account-email-help' : undefined} /></div>{field.key === 'email' && <p id="account-email-help">Changing your sign-in email requires identity confirmation.</p>}</div>
                  ))}
                </fieldset>
                <footer className="account-form-footer"><span>{dirty ? 'You have unsaved changes.' : 'Your details are up to date.'}</span><div><button className="account-reset" type="button" disabled={saving || !dirty} onClick={reset}>Discard changes</button><button className="account-save" type="submit" disabled={saving || !dirty}><AccountIcon name="check" />{saving ? 'Saving...' : 'Save changes'}</button></div></footer>
              </form>

              <section className="account-form" aria-labelledby="account-security-title">
                <div className="account-form-heading"><span><AccountIcon name="lock" /></span><div><h2 id="account-security-title">Sign-in & security</h2><p>Stay in control of your account.</p></div></div>
                <div className="account-security-row"><span className="account-security-icon"><AccountIcon name="lock" /></span><div><h3>Password</h3><p>{profile.has_password ? 'Update the password you use to sign in.' : 'Set a password to also sign in with email.'}</p></div><button type="button" className="account-reset" disabled={saving} onClick={() => setAction({ kind: 'password' })}>{profile.has_password ? 'Change password' : 'Set password'}</button></div>
                <div className="account-security-row"><span className="account-security-icon"><AccountIcon name="link" /></span><div><h3>Google account</h3><span className={`account-connection-status${profile.google_connected ? ' is-connected' : ''}`}>{profile.google_connected ? 'Connected with Google' : 'Not connected'}</span>{profile.google_connected && <p>{profile.google_email || 'Google sign-in is enabled.'}</p>}{profile.google_connected && !profile.has_password && <p>Set a password before unlinking Google.</p>}</div><button type="button" className="account-reset" disabled={saving || (profile.google_connected && !profile.has_password)} onClick={() => setAction({ kind: profile.google_connected ? 'unlink' : 'link' })}>{profile.google_connected ? 'Unlink Google' : 'Link Google'}</button></div>
                <div className="account-security-row"><span className="account-security-icon"><AccountIcon name="devices" /></span><div><h3>Active sessions</h3><p>Sign out on every device, including this one.</p></div><button type="button" className="account-reset" disabled={saving} onClick={() => setAction({ kind: 'signout' })}>Sign out all devices</button></div>
              </section>

              <section className="account-danger-zone" aria-labelledby="account-delete-title"><span className="account-security-icon"><AccountIcon name="trash" /></span><div><h2 id="account-delete-title">Delete account</h2><p>Permanently remove your profile and sign-in access.</p></div><button type="button" className="account-danger-button" disabled={saving} onClick={() => setAction({ kind: 'delete' })}>Delete account</button></section>
            </div>
          </div>
        )}
      </div>
      {action && profile && <AccountActionDialog key={action.kind} action={action} profile={profile} token={token} onClose={() => setAction(null)} onComplete={completeAction} />}
    </>
  )
}
