import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import MeetingMinutes, { MeetingMinutesEditor } from '../components/MeetingMinutes.jsx'
import './PastMeetings.css'

function MeetingIcon({ name }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 18h6" /></>,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    audio: <><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2" /></>,
    download: <><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function dateLabel(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function fileSize(value) {
  if (!value) return ''
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function PastMeetings() {
  const { token, user } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api.listMeetings(token)
      .then(rows => { if (active) setMeetings(rows) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  async function openMeeting(meeting) {
    if (openingId || saving) return
    if (draft && !window.confirm('Discard your unsaved meeting edits?')) return
    setDraft(null)
    setConfirmDelete(false)
    setNotice('')
    setOpeningId(meeting.id)
    setError('')
    try {
      const detail = await api.meetingDetail(token, meeting.id)
      setSelected({ ...detail.meeting, decisions: detail.decisions.map(row => row.decision), questions: detail.questions.map(row => row.question) })
    } catch (err) {
      setError(err.message)
    } finally {
      setOpeningId(null)
    }
  }

  async function saveMeeting(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    const data = { ...draft, title: draft.title.trim(), summary: draft.meeting_minutes?.meeting_summary ?? draft.summary, decisions: draft.decisions.split('\n').filter(line => line.trim()), questions: draft.questions.split('\n').filter(line => line.trim()) }
    try {
      await api.editMeeting(token, selected.id, data)
      const detail = await api.meetingDetail(token, selected.id)
      setSelected({ ...detail.meeting, decisions: detail.decisions.map(row => row.decision), questions: detail.questions.map(row => row.question) })
      setMeetings(current => current.map(row => row.id === selected.id ? { ...row, ...data } : row))
      setDraft(null)
      setNotice('Meeting changes saved.')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function deleteMeeting() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await api.deleteMeeting(token, selected.id)
      setMeetings(current => current.filter(row => row.id !== selected.id))
      setSelected(null)
      setDraft(null)
      setConfirmDelete(false)
      setNotice('Meeting and its related data deleted.')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function downloadRecording(meeting) {
    setError('')
    try {
      const blob = await api.downloadMeetingRecording(token, meeting.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = meeting.recording_filename || 'meeting-recording'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="past-meetings-page">
      <header className="past-meetings-header">
        <div>
          <p className="past-meetings-eyebrow"><span />YOUR CONVERSATIONS</p>
          <h1>Past meetings</h1>
          <p>Return to the conversations that keep your team moving.</p>
        </div>
        <span className="past-meetings-header-icon"><MeetingIcon name="calendar" /></span>
      </header>

      {error && <div className="past-meetings-alert" role="alert">{error}</div>}
      {notice && <p className="past-meeting-notice" role="status">{notice}</p>}
      {loading ? <div className="past-meetings-state">Loading your meetings...</div> : meetings.length === 0 ? (
        <div className="past-meetings-empty"><span><MeetingIcon name="calendar" /></span><h2>No past meetings yet</h2><p>Your analyzed recordings will appear here.</p></div>
      ) : (
        <div className="past-meetings-layout">
          <section className="past-meetings-list" aria-label="Past meetings">
            {meetings.map(meeting => {
              const hasRecording = Boolean(meeting.recording_storage_path)
              return <button type="button" className={`past-meeting-row${selected?.id === meeting.id ? ' is-selected' : ''}`} key={meeting.id} onClick={() => openMeeting(meeting)} aria-disabled={Boolean(openingId || saving)} disabled={openingId === meeting.id}>
                <span className="past-meeting-row-icon"><MeetingIcon name={hasRecording && meeting.recording_mime_type?.startsWith('video/') ? 'video' : 'audio'} /></span>
                <span className="past-meeting-row-copy"><strong>{meeting.title}</strong><small>{dateLabel(meeting.created_at)}</small></span>
                <span className="past-meeting-row-meta" role="status">{openingId === meeting.id ? 'Opening…' : hasRecording ? fileSize(meeting.recording_file_size) : 'Transcript'}</span>
                <MeetingIcon name="play" />
              </button>
            })}
          </section>

          <section className="past-meeting-detail" aria-live="polite">
            {selected ? <>
              <div className="past-meeting-detail-heading"><div><p className="past-meetings-eyebrow">MEETING RECORDING</p><h2>{selected.title}</h2><small>{dateLabel(selected.created_at)}{selected.recording_filename ? ` · ${selected.recording_filename}` : ''}</small></div><button type="button" className="past-meeting-close" disabled={saving || Boolean(openingId)} onClick={() => { if (draft && !window.confirm('Discard your unsaved meeting edits?')) return; setSelected(null); setDraft(null); setConfirmDelete(false) }} aria-label="Close meeting details"><MeetingIcon name="close" /></button></div>
              {user?.role === 'pm' && <div className="past-meeting-management">
                {!draft && !confirmDelete && <div className="past-meeting-edit-actions">
                  <button type="button" onClick={() => { setNotice(''); setDraft({ title: selected.title, summary: selected.summary || '', transcript: selected.transcript || '', decisions: (selected.decisions || []).join('\n'), questions: (selected.questions || []).join('\n'), meeting_minutes: selected.meeting_minutes ? structuredClone(selected.meeting_minutes) : null }) }}>Edit meeting</button>
                  <button type="button" className="is-danger" onClick={() => setConfirmDelete(true)}>Delete meeting</button>
                </div>}
                {draft && <form className="past-meeting-editor" onSubmit={saveMeeting}>
                  <fieldset disabled={saving}>
                    <legend>Edit meeting</legend>
                    <p>{selected.meeting_minutes ? 'Edit all meeting minutes below. The original transcript and separate action approval records are unchanged.' : 'Update the written record. These edits do not re-analyze the recording or change assigned action items.'}</p>
                    {(selected.meeting_minutes ? ['title'] : ['title', 'summary', 'transcript', 'decisions', 'questions']).map(field => <label key={field}>
                      {({ title: 'Title', summary: 'Summary', transcript: 'Transcript', decisions: 'Decisions (one per line)', questions: 'Open questions (one per line)' })[field]}
                      {field === 'title' ? <input autoFocus required maxLength={300} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /> : <textarea rows={field === 'transcript' ? 8 : 4} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />}
                    </label>)}
                    {draft.meeting_minutes && <MeetingMinutesEditor minutes={draft.meeting_minutes} onChange={(meeting_minutes) => setDraft(current => ({ ...current, meeting_minutes }))} />}
                    <div className="past-meeting-edit-actions"><button type="submit" disabled={!draft.title.trim()}>{saving ? 'Saving...' : 'Save changes'}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
                  </fieldset>
                </form>}
                {confirmDelete && <div className="past-meeting-delete-confirm" role="region" aria-label="Confirm meeting deletion">
                  <h3>Delete {selected.title}?</h3>
                  <p>This permanently deletes the recording, summary, transcript, decisions, questions, action items, and their follow-ups. This cannot be undone.</p>
                  <div className="past-meeting-edit-actions"><button autoFocus type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Keep meeting</button><button type="button" className="is-danger" disabled={saving} onClick={deleteMeeting}>{saving ? 'Deleting...' : 'Delete permanently'}</button></div>
                </div>}
              </div>}
              {selected.recording_url ? <>
                <div className="past-meeting-recording-card"><div className="past-meeting-recording-label"><span><MeetingIcon name={selected.recording_mime_type?.startsWith('video/') ? 'video' : 'audio'} /></span><div><p>Meeting recording</p><small>{selected.recording_filename || 'Original upload'}</small></div></div>{selected.recording_mime_type?.startsWith('video/') ? (
                  <video key={selected.recording_url} className="past-meeting-player" controls preload="metadata">
                    <source src={selected.recording_url} type={selected.recording_mime_type} />
                    Your browser cannot play this recording.
                  </video>
                ) : (
                  <audio key={selected.recording_url} className="past-meeting-player" controls preload="metadata">
                    <source src={selected.recording_url} type={selected.recording_mime_type} />
                    Your browser cannot play this recording.
                  </audio>
                )}<div className="past-meeting-recording-actions"><span>Listen now or keep a local copy.</span><button type="button" className="past-meeting-download" onClick={() => downloadRecording(selected)}><MeetingIcon name="download" />Download file</button></div></div>
              </> : <div className="past-meeting-no-recording"><span><MeetingIcon name="audio" /></span><div><strong>Transcript-only meeting</strong><p>No audio recording was attached to this meeting.</p></div></div>}
              {!selected.meeting_minutes && selected.summary && <p className="past-meeting-summary">{selected.summary}</p>}
              {!draft && <MeetingMinutes minutes={selected.meeting_minutes} />}
              {selected.transcript && <details className="past-meeting-text"><summary>Transcript</summary><p>{selected.transcript}</p></details>}
              {!selected.meeting_minutes && ['decisions', 'questions'].map(field => selected[field]?.length > 0 && <details key={field} className="past-meeting-text"><summary>{field === 'decisions' ? 'Decisions' : 'Open questions'}</summary><ul>{selected[field].map((value, index) => <li key={index}>{value}</li>)}</ul></details>)}
            </> : <div className="past-meeting-detail-placeholder"><span><MeetingIcon name="play" /></span><h2>Select a meeting</h2><p>Choose a meeting to generate a secure playback link.</p></div>}
          </section>
        </div>
      )}
    </div>
  )
}
