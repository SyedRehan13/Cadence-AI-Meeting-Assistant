import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { FollowupAlert, FollowupEmpty, FollowupIcon, FollowupLoading, formatFollowupDate } from '../components/FollowupUI.jsx'
import './Followups.css'

export default function EmployeeFollowups() {
  const { token } = useAuth()
  const [followups, setFollowups] = useState([])
  const [responses, setResponses] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [filter, setFilter] = useState('all')

  async function load() {
    try {
      setFollowups(await api.myFollowups(token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  async function sendResponse(id) {
    const response = (responses[id] || '').trim()
    if (!response || saving) return
    setSaving(id)
    setError(null)
    try {
      await api.respondToFollowup(token, id, response)
      setResponses((current) => ({ ...current, [id]: '' }))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const counts = useMemo(() => followups.reduce((summary, followup) => {
    if (followup.employee_response) summary.responded += 1
    else summary.open += 1
    return summary
  }, { open: 0, responded: 0 }), [followups])

  const visibleFollowups = filter === 'all'
    ? followups
    : followups.filter((followup) => filter === 'responded' ? Boolean(followup.employee_response) : !followup.employee_response)

  const filters = [
    { value: 'all', label: 'All', count: followups.length },
    { value: 'open', label: 'Needs update', count: counts.open },
    { value: 'responded', label: 'Responded', count: counts.responded },
  ]

  return (
    <div className="followups-page">
      <header className="followups-hero">
        <div>
          <p className="followups-eyebrow"><span />YOUR UPDATES</p>
          <h1>My Follow-Ups</h1>
          <p className="followups-intro">Share progress, surface blockers, and keep your project manager in step with the work.</p>
        </div>
        <div className="followups-hero-art" aria-hidden="true"><span><FollowupIcon name="reply" /></span></div>
      </header>

      <section className="followups-metrics" aria-label="My follow-up overview">
        <div className="followup-metric"><span className="followup-metric-icon"><FollowupIcon name="inbox" /></span><strong>{followups.length}</strong><small>Total follow-ups</small></div>
        <div className="followup-metric is-waiting"><span className="followup-metric-icon"><FollowupIcon name="clock" /></span><strong>{counts.open}</strong><small>Need your update</small></div>
        <div className="followup-metric is-complete"><span className="followup-metric-icon"><FollowupIcon name="check" /></span><strong>{counts.responded}</strong><small>Updates shared</small></div>
      </section>

      <FollowupAlert>{error}</FollowupAlert>

      <section className="followups-content" aria-labelledby="my-followup-list-title">
        <div className="followups-toolbar">
          <div className="followups-toolbar-copy"><p>YOUR INBOX</p><h2 id="my-followup-list-title">Updates and requests</h2></div>
          {!loading && followups.length > 0 && (
            <div className="followups-filters" role="group" aria-label="Filter my follow-ups">
              {filters.map((item) => (
                <button key={item.value} type="button" className={`followups-filter${filter === item.value ? ' is-active' : ''}`} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}>
                  {item.label} · {item.count}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? <FollowupLoading /> : followups.length === 0 ? <FollowupEmpty employee /> : visibleFollowups.length === 0 ? (
          <div className="followups-empty"><span><FollowupIcon name="check" /></span><p>Nothing in this view</p><small>Choose another filter to see the rest of your follow-ups.</small></div>
        ) : (
          <div className="followups-list">
            {visibleFollowups.map((followup) => {
              const response = responses[followup.id] || ''
              const responded = Boolean(followup.employee_response)
              return (
                <article className="followup-card employee-followup-card" key={followup.id}>
                  <div className="followup-card-top">
                    <span className="followup-card-icon"><FollowupIcon name="message" /></span>
                    <div className="followup-card-heading"><p>Action item</p><h3>{followup.task}</h3></div>
                    <span className={`followup-status${responded ? ' is-responded' : ''}`}><i />{responded ? 'Update shared' : 'Needs update'}</span>
                  </div>

                  <div className="followup-meta">
                    <span><FollowupIcon name="meeting" />Meeting <strong>{followup.meeting_title || 'Unknown'}</strong></span>
                    <span><FollowupIcon name="person" />From <strong>{followup.project_manager_name || 'Project manager'}</strong></span>
                    <span><FollowupIcon name="calendar" />Due <strong>{formatFollowupDate(followup.deadline)}</strong></span>
                  </div>

                  <div className="followup-message">
                    <span><FollowupIcon name="message" />Message from {followup.project_manager_name || 'your project manager'}</span>
                    <p>{followup.message}</p>
                  </div>

                  {responded ? (
                    <div className="followup-response">
                      <span className="followup-response-label"><FollowupIcon name="check" />Your response</span>
                      <p>{followup.employee_response}</p>
                    </div>
                  ) : (
                    <div className="followup-response-composer">
                      <label htmlFor={`response-${followup.id}`}>Share your update</label>
                      <textarea
                        id={`response-${followup.id}`}
                        rows="4"
                        value={response}
                        onChange={(event) => setResponses((current) => ({ ...current, [followup.id]: event.target.value }))}
                        placeholder="What’s moving forward? Mention progress, next steps, or any blockers…"
                      />
                      <div className="followup-composer-footer">
                        <small>{response.trim().length ? `${response.trim().length} characters` : 'A clear, brief update works best.'}</small>
                        <button type="button" className="followup-send-button" onClick={() => sendResponse(followup.id)} disabled={saving === followup.id || !response.trim()}>
                          <FollowupIcon name="send" />{saving === followup.id ? 'Sending…' : 'Send update'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
