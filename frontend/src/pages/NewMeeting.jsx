import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import Dropdown from '../components/Dropdown.jsx'
import MeetingMinutes, { MeetingMinutesEditor } from '../components/MeetingMinutes.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { Link } from 'react-router-dom'
import './NewMeeting.css'

function MeetingIcon({ name }) {
  const paths = {
    text: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    sparkle: <><path d="m12 3 2.25 6.75L21 12l-6.75 2.25L12 21l-2.25-6.75L3 12l6.75-2.25L12 3Z" /><path d="M20 2v4M18 4h4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    download: <><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

// Pick the best mimeType this browser's MediaRecorder actually supports.
function pickRecordingMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || ''
}

function isPreviewableMedia(file) {
  return Boolean(file && (file.type.startsWith('audio/') || file.type.startsWith('video/') || /\.(mp3|wav|m4a|ogg|aac|aiff|flac|mp4|mov|avi|mkv)$/i.test(file.name)))
}

function isVideoFile(file) {
  return Boolean(file && (file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(file.name)))
}

function currentLocalDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function NewMeeting() {
  const { token } = useAuth()
  const [projects, setProjects] = useState([])
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [meetingDate, setMeetingDate] = useState(currentLocalDate)
  const [location, setLocation] = useState('')
  const [transcript, setTranscript] = useState('')
  const [file, setFile] = useState(null)
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState(null)
  const [sourceMode, setSourceMode] = useState('text')
  const [recordedFile, setRecordedFile] = useState(null)
  const [startingRecording, setStartingRecording] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [meetingResult, setMeetingResult] = useState(null)
  const [minutesDraft, setMinutesDraft] = useState(null)
  const [minutesSaving, setMinutesSaving] = useState(false)
  const [projectMembers, setProjectMembers] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const activeFile = sourceMode === 'record' ? recordedFile : sourceMode === 'upload' ? file : null

  useEffect(() => {
    api.listProjects(token).then(setProjects).catch((err) => setError(err.message))
  }, [token])

  useEffect(() => {
    if (!projectId) {
      setProjectMembers([])
      return
    }
    api.projectDetail(token, projectId)
      .then((detail) => setProjectMembers(detail.members))
      .catch((err) => setError(err.message))
  }, [token, projectId])

  useEffect(() => {
    // Stop the mic and release the preview URL if the component unmounts mid-recording.
    return () => {
      clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [recordedUrl])

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl)
    }
  }, [uploadedPreviewUrl])

  async function startRecording() {
    if (startingRecording || isRecording) return
    setError(null)
    setStartingRecording(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickRecordingMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recordedChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'audio/webm' })
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
        const recordedFile = new File([blob], `recording.${extension}`, { type: blob.type })
        setRecordedFile(recordedFile)
        setRecordedUrl(URL.createObjectURL(blob))
        setIsRecording(false)
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setError('Could not access the microphone: ' + err.message)
    } finally {
      setStartingRecording(false)
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    clearInterval(timerRef.current)
  }

  function discardRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedUrl(null)
    setRecordedFile(null)
    setRecordingSeconds(0)
  }

  function selectUploadFile(nextFile) {
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl)
    setFile(nextFile)
    setUploadedPreviewUrl(isPreviewableMedia(nextFile) ? URL.createObjectURL(nextFile) : null)
  }

  function removeUploadFile() {
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl)
    setUploadedPreviewUrl(null)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function formatSeconds(total) {
    const minutes = String(Math.floor(total / 60)).padStart(2, '0')
    const seconds = String(total % 60).padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  function updateActionItem(itemId, field, value) {
    setMeetingResult((current) => ({
      ...current,
      action_items: current.action_items.map((item) => (
        item.id === itemId ? { ...item, [field]: value } : item
      )),
    }))
  }

  async function saveActionItem(item) {
    setError(null)
    try {
      await api.editActionItem(token, item.id, {
        task: item.task,
        owner_user_id: item.owner_user_id ? Number(item.owner_user_id) : null,
        owner_name: item.owner_name || 'Unassigned',
        deadline: item.deadline || 'Not specified',
        priority: item.priority || 'Medium',
      })
      setMessage('Action item updated.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function approveActionItem(item) {
    setError(null)
    try {
      await saveActionItem(item)
      await api.approveActionItem(token, item.id)
      setMeetingResult((current) => ({
        ...current,
        action_items: current.action_items.map((entry) => (
          entry.id === item.id ? { ...entry, approved: 1 } : entry
        )),
      }))
      setMessage('Action item saved and approved.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function downloadRecording(meeting) {
    setError(null)
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

  async function saveMinutes() {
    if (!minutesDraft || minutesSaving || !meetingResult) return
    setError(null)
    setMinutesSaving(true)
    try {
      const meeting = meetingResult.meeting
      await api.editMeeting(token, meeting.id, {
        title: meeting.title,
        summary: minutesDraft.meeting_summary,
        transcript: meeting.transcript || '',
        decisions: meetingResult.decisions.map((row) => row.decision),
        questions: meetingResult.questions.map((row) => row.question),
        meeting_minutes: minutesDraft,
      })
      const updated = await api.meetingDetail(token, meeting.id)
      setMeetingResult(updated)
      setMinutesDraft(null)
      setMessage('Meeting minutes saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setMinutesSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting || isRecording || startingRecording) return
    if (sourceMode !== 'text' && !activeFile) {
      setError(sourceMode === 'upload' ? 'Choose a file to analyze.' : 'Record your meeting before analyzing it.')
      return
    }
    setError(null)
    setMessage(null)
    setMinutesDraft(null)
    setSubmitting(true)
    try {
      const result = activeFile
        ? await api.analyzeMeetingFile(token, { title, project_id: projectId, file: activeFile, duration: sourceMode === 'record' ? recordingSeconds : null, meeting_date: meetingDate, location })
        : await api.analyzeMeeting(token, { title, project_id: Number(projectId), transcript, meeting_date: meetingDate, location: location || null })
      const detail = await api.meetingDetail(token, result.meeting_id)
      const projectDetail = await api.projectDetail(token, projectId)
      setProjectMembers(projectDetail.members)
      setMeetingResult(detail)
      setMessage('Meeting analyzed. Your summary and next steps are ready to review below.')
      setTitle('')
      setMeetingDate(currentLocalDate())
      setLocation('')
      setTranscript('')
      removeUploadFile()
      setRecordedFile(null)
      setRecordingSeconds(0)
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      setRecordedUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="new-meeting-page">
      <header className="meeting-hero">
        <div>
          <p className="meeting-eyebrow"><span />TURN TALK INTO ACTION</p>
          <h1>New Meeting</h1>
          <p className="meeting-intro">Capture the conversation. Make room for what comes next.</p>
        </div>
        <span className="meeting-hero-icon" aria-hidden="true"><MeetingIcon name="mic" /></span>
      </header>
      {error && <div className="meeting-alert" role="alert"><MeetingIcon name="close" /><span>{error}</span></div>}
      {message && <div className="meeting-alert is-success" role="status"><MeetingIcon name="check" /><span>{message}</span></div>}
      <div className="meeting-layout">
        <form className="meeting-form" onSubmit={handleSubmit} aria-busy={submitting}>
          <fieldset disabled={submitting}>
            <section className="meeting-details" aria-labelledby="meeting-details-heading">
              <div className="meeting-section-heading"><span className="meeting-step">01</span><div><p>SET THE SCENE</p><h2 id="meeting-details-heading">Meeting details</h2></div></div>
              <div className="meeting-details-fields">
                <div><label htmlFor="meeting-title">Meeting title</label><input id="meeting-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Weekly product sync" required /></div>
                <div><label htmlFor="meeting-project">Project</label><Dropdown searchable menuLabel="Projects" id="meeting-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Dropdown></div>
                <div><label htmlFor="meeting-date">Meeting date</label><input id="meeting-date" type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} required /></div>
                <div><label htmlFor="meeting-location">Location</label><Dropdown menuLabel="Meeting rooms" id="meeting-location" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Not specified</option><option>Meeting Room 1</option><option>Meeting Room 2</option><option>Meeting Room 3</option></Dropdown></div>
              </div>
            </section>
            <section className="meeting-content" aria-labelledby="meeting-content-heading">
              <div className="meeting-section-heading"><span className="meeting-step">02</span><div><p>BRING THE CONVERSATION</p><h2 id="meeting-content-heading">Add your meeting</h2></div></div>
              <div className="meeting-sources" role="group" aria-label="Meeting input method">
                {[
                  { id: 'text', icon: 'text', label: 'Paste transcript', detail: 'Start with your notes' },
                  { id: 'upload', icon: 'upload', label: 'Upload a file', detail: 'Audio or document' },
                  { id: 'record', icon: 'mic', label: 'Record live', detail: 'Capture as you go' },
                ].map((source) => <button key={source.id} type="button" className={`meeting-source${sourceMode === source.id ? ' is-active' : ''}`} aria-pressed={sourceMode === source.id} disabled={isRecording || startingRecording} onClick={() => setSourceMode(source.id)}><MeetingIcon name={source.icon} /><strong>{source.label}</strong><small>{source.detail}</small></button>)}
              </div>
              {sourceMode === 'text' && <div className="meeting-transcript-panel"><label htmlFor="meeting-transcript">Meeting transcript</label><textarea id="meeting-transcript" rows="9" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste your meeting transcript here. Include speaker names, decisions, and next steps for a clearer picture." required /><p className="meeting-field-note">A little context goes a long way. Include who said what when you can.</p></div>}
              {sourceMode === 'upload' && <div className="meeting-upload-panel"><span className="meeting-input-icon"><MeetingIcon name="upload" /></span><h3>{file ? 'Your file is ready' : 'Bring your conversation along'}</h3><p>Choose a transcript, PDF, or audio/video recording.</p><label className="meeting-button is-secondary meeting-file-label" htmlFor="meeting-file"><MeetingIcon name="upload" />{file ? 'Choose another file' : 'Choose a file'}<input ref={fileInputRef} id="meeting-file" type="file" accept=".txt,.pdf,.mp3,.wav,.m4a,.ogg,.aac,.aiff,.flac,.mp4,.mov,.avi,.mkv" onChange={(event) => { if (event.target.files[0]) selectUploadFile(event.target.files[0]) }} /></label>{file && <div className="meeting-file-selected"><MeetingIcon name="text" /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" className="meeting-remove-file" aria-label="Remove selected file" onClick={removeUploadFile}><MeetingIcon name="close" /></button></div>}{uploadedPreviewUrl && <div className="meeting-upload-preview"><p className="meeting-field-note">Preview before analyzing</p>{isVideoFile(file) ? <video controls src={uploadedPreviewUrl} aria-label="Uploaded meeting recording preview" /> : <audio controls src={uploadedPreviewUrl} aria-label="Uploaded meeting audio preview" />}</div>}<p className="meeting-file-types">TXT, PDF, MP3, WAV, M4A, OGG, AAC, AIFF, FLAC, MP4, MOV, AVI, MKV</p></div>}
              {sourceMode === 'record' && <div className={`meeting-record-panel${isRecording ? ' is-recording' : ''}`}><span className="meeting-input-icon"><MeetingIcon name="mic" /></span><h3>{isRecording ? 'Listening to your meeting' : recordedUrl ? 'Ready when you are' : 'Stay in the conversation'}</h3><p>{recordedUrl && !isRecording ? 'Listen back, then analyze your recording.' : 'Record your meeting using your microphone.'}</p><div className="meeting-record-time">{formatSeconds(recordingSeconds)}</div>{!isRecording && !recordedUrl && <button type="button" className="meeting-button" disabled={startingRecording} onClick={startRecording}><MeetingIcon name="mic" />{startingRecording ? 'Connecting microphone...' : 'Start recording'}</button>}{isRecording && <><p className="meeting-recording-status" role="status"><span />Recording in progress</p><button type="button" className="meeting-button is-secondary" onClick={stopRecording}><MeetingIcon name="stop" />Stop recording</button></>}{!isRecording && recordedUrl && <div className="meeting-record-preview"><audio controls src={recordedUrl} aria-label="Meeting recording preview" /><button type="button" className="meeting-button is-secondary" onClick={discardRecording}><MeetingIcon name="close" />Discard recording</button></div>}</div>}
            </section>
            <footer className="meeting-form-footer"><p>{submitting ? 'Finding the key moments and next steps...' : 'Ready to turn this meeting into momentum?'}</p><button type="submit" className="meeting-button" disabled={submitting || isRecording || startingRecording || (sourceMode !== 'text' && !activeFile)}><MeetingIcon name="sparkle" />{submitting ? 'Analyzing...' : 'Analyze meeting'}{!submitting && <MeetingIcon name="arrow" />}</button></footer>
          </fieldset>
        </form>
        <aside className="meeting-guide" aria-labelledby="meeting-guide-heading">
          <span className="meeting-guide-icon"><MeetingIcon name="sparkle" /></span>
          <p className="meeting-eyebrow">A LITTLE MORE CLARITY</p><h2 id="meeting-guide-heading">Good conversations.<br />Clear next steps.</h2><p>Cadence brings the important parts together, so your team can keep moving.</p>
          <ul className="meeting-outcomes">{[{ icon: 'text', title: 'The big picture', text: 'A concise summary of the conversation.' }, { icon: 'check', title: 'Decisions that stick', text: 'What was agreed on, in one place.' }, { icon: 'question', title: 'Open questions', text: 'The things that still need an answer.' }, { icon: 'arrow', title: 'Actionable next steps', text: 'Tasks to review, assign, and approve.' }].map((outcome) => <li key={outcome.title}><span><MeetingIcon name={outcome.icon} /></span><div><h3>{outcome.title}</h3><p>{outcome.text}</p></div></li>)}</ul>
          <div className="meeting-guide-note"><strong>You have the final say.</strong><p>Review the results and confirm owners, due dates, and priorities before approving action items.</p></div>
          <Link to="/projects" className="meeting-project-link">Need a project first? <MeetingIcon name="arrow" /></Link>
        </aside>
      </div>
      {meetingResult && (
        <section className="meeting-results" aria-labelledby="meeting-results-heading">
          <div className="meeting-section-heading"><span className="meeting-step"><MeetingIcon name="check" /></span><div><p>THE CONVERSATION, CONNECTED</p><h2 id="meeting-results-heading">{meetingResult.meeting.title}</h2></div></div>
          {!meetingResult.meeting.meeting_minutes && <p className="meeting-summary">{meetingResult.meeting.summary}</p>}
          {meetingResult.meeting.meeting_minutes && <div className="minutes-edit-toolbar">
            {minutesDraft ? <><button type="button" onClick={saveMinutes} disabled={minutesSaving}>{minutesSaving ? 'Saving...' : 'Save minutes'}</button><button type="button" onClick={() => setMinutesDraft(null)} disabled={minutesSaving}>Cancel</button></> : <button type="button" onClick={() => setMinutesDraft(structuredClone(meetingResult.meeting.meeting_minutes))}>Edit meeting minutes</button>}
          </div>}
          {minutesDraft ? <MeetingMinutesEditor minutes={minutesDraft} onChange={setMinutesDraft} /> : <MeetingMinutes minutes={meetingResult.meeting.meeting_minutes} />}
          {meetingResult.meeting.transcript && <details className="past-meeting-text"><summary>Transcript</summary><p>{meetingResult.meeting.transcript}</p></details>}
          {meetingResult.meeting.recording_url && (
            <div className="meeting-recording-player">
              <div className="meeting-recording-heading"><span><MeetingIcon name={meetingResult.meeting.recording_mime_type?.startsWith('video/') ? 'upload' : 'mic'} /></span><div><p>Meeting recording</p><small>{meetingResult.meeting.recording_filename || 'Original upload'}</small></div></div>
              {meetingResult.meeting.recording_mime_type?.startsWith('video/') ? (
                <video controls preload="metadata">
                  <source src={meetingResult.meeting.recording_url} type={meetingResult.meeting.recording_mime_type} />
                  Your browser cannot play this recording.
                </video>
              ) : (
                <audio controls preload="metadata">
                  <source src={meetingResult.meeting.recording_url} type={meetingResult.meeting.recording_mime_type} />
                  Your browser cannot play this recording.
                </audio>
              )}
              <div className="meeting-recording-actions"><span>Listen here or save a copy for later.</span><button type="button" className="meeting-recording-download" onClick={() => downloadRecording(meetingResult.meeting)}><MeetingIcon name="download" />Download file</button></div>
            </div>
          )}

          {!meetingResult.meeting.meeting_minutes && <div className="meeting-insights"><div>
          <h4>Decisions</h4>
          {meetingResult.decisions.length > 0 ? (
            <ul>{meetingResult.decisions.map((decision) => <li key={decision.id}>{decision.decision}</li>)}</ul>
          ) : <p>No decisions extracted.</p>}

          </div><div><h4>Unresolved questions</h4>
          {meetingResult.questions.length > 0 ? (
            <ul>{meetingResult.questions.map((question) => <li key={question.id}>{question.question}</li>)}</ul>
          ) : <p>No unresolved questions extracted.</p>}

          </div></div>}
          <div className="meeting-actions-heading"><h3>{meetingResult.meeting.meeting_minutes ? 'Review follow-up records' : 'Action items'} <span>{meetingResult.action_items.length}</span></h3><p>Review the details, then save or approve each next step.</p></div>
          {meetingResult.action_items.length > 0 ? (
            <div className="action-item-list">
              {meetingResult.action_items.map((item) => (
                <div className="action-item-card" key={item.id}>
                  <div className="action-item-header">
                    <input
                      className="task-input"
                      aria-label="Action item task"
                      value={item.task}
                      onChange={(event) => updateActionItem(item.id, 'task', event.target.value)}
                    />
                    <span className={`badge ${(item.priority || 'Medium').toLowerCase()}`}>{item.priority || 'Medium'}</span>
                  </div>

                  <div className="action-item-fields">
                    <div>
                      <label htmlFor={`meeting-owner-${item.id}`}>Assigned to</label>
                      <Dropdown
                        searchable menuLabel="Assign to" id={`meeting-owner-${item.id}`}
                        value={item.owner_user_id || ''}
                        onChange={(event) => {
                          const member = projectMembers.find((entry) => String(entry.id) === event.target.value)
                          updateActionItem(item.id, 'owner_user_id', event.target.value)
                          updateActionItem(item.id, 'owner_name', member?.name || 'Unassigned')
                        }}
                      >
                        <option value="">Unassigned</option>
                        {projectMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </Dropdown>
                    </div>
                    <div>
                      <label htmlFor={`meeting-deadline-${item.id}`}>Due date</label>
                      <input
                        id={`meeting-deadline-${item.id}`}
                        type="date"
                        value={/^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '') ? item.deadline : ''}
                        onChange={(event) => updateActionItem(item.id, 'deadline', event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor={`meeting-priority-${item.id}`}>Priority</label>
                      <Dropdown menuLabel="Priority" id={`meeting-priority-${item.id}`} value={item.priority || 'Medium'} onChange={(event) => updateActionItem(item.id, 'priority', event.target.value)}>
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </Dropdown>
                    </div>
                  </div>

                  {item.evidence && <p className="evidence">"{item.evidence}"</p>}

                  <div className="action-item-actions">
                    <button type="button" className="meeting-button is-secondary" onClick={() => saveActionItem(item)}>Save changes</button>
                    <button type="button" className="meeting-button" onClick={() => approveActionItem(item)} disabled={Boolean(item.approved)}>
                      <MeetingIcon name="check" />{item.approved ? 'Approved' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p>No action items extracted.</p>}
        </section>
      )}
    </div>
  )
}
