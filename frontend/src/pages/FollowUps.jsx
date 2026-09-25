import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { FollowupAlert, FollowupEmpty, FollowupIcon, FollowupLoading, formatFollowupDate } from '../components/FollowupUI.jsx'
import './Followups.css'

function followupState(followup) {
  if (followup.employee_response) return 'responded'
  if (followup.status === 'Sent') return 'waiting'
  return 'draft'
}

function FollowupStatus({ followup }) {
  const state = followupState(followup)
  const label = state === 'responded' ? 'Responded' : state === 'waiting' ? 'Awaiting response' : 'Draft'
  return <span className={`followup-status is-${state}`}><i />{label}</span>
}

export default function FollowUps() {
  const { token } = useAuth()
  const [followups, setFollowups] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { items } = await api.dashboard(token)
      const histories = await Promise.all(items.map(async (item) => {
        const history = await api.listFollowups(token, item.id)
        return history.map((followup) => ({
          ...followup,
          task: item.task,
          meeting_title: item.meeting_title,
          employee_name: item.owner_name,
          deadline: item.deadline,
        }))
      }))
      setFollowups(histories.flat().sort((a, b) => b.id - a.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const counts = useMemo(() => followups.reduce((summary, followup) => {
    summary[followupState(followup)] += 1
    return summary
  }, { responded: 0, waiting: 0, draft: 0 }), [followups])

  const visibleFollowups = filter === 'all'
    ? followups
    : followups.filter((followup) => followupState(followup) === filter)

  const filters = [
    { value: 'all', label: 'All', count: followups.length },
    { value: 'waiting', label: 'Waiting', count: counts.waiting },
    { value: 'responded', label: 'Responded', count: counts.responded },
    { value: 'draft', label: 'Drafts', count: counts.draft },
  ]

  return (
    <div className="followups-page">
      <header className="followups-hero">
        <div>
          <p className="followups-eyebrow"><span />MOMENTUM CENTER</p>
          <h1>Follow-Ups</h1>
          <p className="followups-intro">Keep commitments visible, see who has replied, and know where a thoughtful nudge is still needed.</p>
        </div>
        <div className="followups-hero-art" aria-hidden="true"><span><FollowupIcon name="message" /></span></div>
      </header>

      <section className="followups-metrics" aria-label="Follow-up overview">
        <div className="followup-metric"><span className="followup-metric-icon"><FollowupIcon name="message" /></span><strong>{followups.length}</strong><small>Total follow-ups</small></div>
        <div className="followup-metric is-waiting"><span className="followup-metric-icon"><FollowupIcon name="clock" /></span><strong>{counts.waiting}</strong><small>Awaiting response</small></div>
        <div className="followup-metric is-complete"><span className="followup-metric-icon"><FollowupIcon name="check" /></span><strong>{counts.responded}</strong><small>Responses received</small></div>
      </section>

      <FollowupAlert>{error}</FollowupAlert>

      <section className="followups-content" aria-labelledby="followup-activity-title">
        <div className="followups-toolbar">
          <div className="followups-toolbar-copy"><p>TEAM ACTIVITY</p><h2 id="followup-activity-title">Follow-up activity</h2></div>
          {!loading && followups.length > 0 && (
            <div className="followups-filters" role="group" aria-label="Filter follow-ups">
              {filters.map((item) => (
                <button key={item.value} type="button" className={`followups-filter${filter === item.value ? ' is-active' : ''}`} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}>
                  {item.label} · {item.count}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? <FollowupLoading /> : followups.length === 0 ? <FollowupEmpty /> : visibleFollowups.length === 0 ? (
          <div className="followups-empty"><span><FollowupIcon name="check" /></span><p>Nothing in this view</p><small>Choose another filter to see the rest of your follow-ups.</small></div>
        ) : (
          <div className="followups-list">
            {visibleFollowups.map((followup) => {
              const state = followupState(followup)
              return (
                <article className="followup-card" key={followup.id}>
                  <div className="followup-card-top">
                    <span className="followup-card-icon"><FollowupIcon name="reply" /></span>
                    <div className="followup-card-heading"><p>{followup.followup_type || 'Follow-up'}</p><h3>{followup.task}</h3></div>
                    <FollowupStatus followup={followup} />
                  </div>

                  <div className="followup-meta">
                    <span><FollowupIcon name="meeting" />Meeting <strong>{followup.meeting_title || 'Unknown'}</strong></span>
                    <span><FollowupIcon name="person" />Assigned to <strong>{followup.employee_name || followup.employee || 'Unassigned'}</strong></span>
                    <span><FollowupIcon name="calendar" />Due <strong>{formatFollowupDate(followup.deadline)}</strong></span>
                  </div>

                  <div className="followup-message">
                    <span><FollowupIcon name="message" />Message sent</span>
                    <p>{followup.message}</p>
                  </div>

                  {followup.employee_response ? (
                    <div className="followup-response">
                      <span className="followup-response-label"><FollowupIcon name="check" />{followup.employee_name || followup.employee || 'Team member'}’s response</span>
                      <p>{followup.employee_response}</p>
                    </div>
                  ) : (
                    <div className={`followup-waiting${state === 'draft' ? ' is-draft' : ''}`}>
                      <FollowupIcon name={state === 'draft' ? 'sparkle' : 'clock'} />
                      {state === 'draft' ? 'This message is saved as a draft and has not been sent yet.' : 'Waiting for an update from the assignee.'}
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
