import Dropdown from './Dropdown.jsx'
import { useEffect, useState } from 'react'

const rooms = ['Meeting Room 1', 'Meeting Room 2', 'Meeting Room 3']
const detailFields = [['purpose', 'Purpose'], ['date', 'Date'], ['team', 'Team'], ['time', 'Time'], ['location', 'Location'], ['attendees', 'Attendees'], ['project_manager', 'Project Manager'], ['agenda', 'Agenda']]
const actionColumns = [['ref_no', 'Ref. No.'], ['action_or_decision', 'Action / Decision'], ['by_who', 'By Who?'], ['by_when', 'By When?'], ['status_comments', 'Status / Comments']]
const issueColumns = [['ref_no', 'Ref. No.'], ['description', 'Description'], ['owner', 'Owner'], ['status', 'Status']]
const milestoneColumns = [['ref_no', 'Ref. No.'], ['milestone', 'Milestone'], ['owner', 'Owner'], ['target_date', 'Target Date'], ['status', 'Status']]
const nextFields = [['date', 'Date'], ['facilitator', 'Facilitator'], ['agenda', 'Agenda'], ['comments', 'Comments']]

function Field({ label, value }) {
  return <div><strong>{label}</strong><span>{Array.isArray(value) ? value.join(', ') : (value || '—')}</span></div>
}

function MinutesTable({ columns, rows }) {
  if (!rows?.length) return <p className="minutes-empty">None recorded.</p>
  return <div className="minutes-table-wrap"><table className="minutes-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.ref_no || index}>{columns.map(([key]) => <td key={key}>{row[key] || '—'}</td>)}</tr>)}</tbody></table></div>
}

export default function MeetingMinutes({ minutes }) {
  if (!minutes) return null
  const details = minutes.meeting_details || {}
  const next = minutes.next_meeting || {}
  return <section className="meeting-minutes" aria-label="Meeting Minutes">
    <h3>Meeting Details</h3>
    <div className="minutes-details">
      <Field label="Purpose" value={details.purpose} /><Field label="Date" value={details.date} />
      <Field label="Team" value={details.team || 'Not specified'} /><Field label="Time" value={details.time} />
      <Field label="Location" value={details.location} /><Field label="Attendees" value={details.attendees} />
      <Field label="Project Manager" value={details.project_manager} /><Field label="Agenda" value={details.agenda} />
    </div>
    <h3>Meeting Summary</h3><p className="minutes-summary">{minutes.meeting_summary || '—'}</p>
    <h3>Action Items</h3><MinutesTable columns={actionColumns} rows={minutes.action_items} />
    <h3>Dependencies / Blockers / Impediments / Issues</h3><MinutesTable columns={issueColumns} rows={minutes.dependencies_blockers_issues} />
    <h3>Milestones</h3><MinutesTable columns={milestoneColumns} rows={minutes.milestones} />
    <h3>Next Meeting</h3><div className="minutes-details"><Field label="Date" value={next.date} /><Field label="Facilitator" value={next.facilitator} /><Field label="Agenda" value={next.agenda} /><Field label="Comments" value={next.comments} /></div>
  </section>
}

function AttendeesField({ label, value, onChange }) {
  const [text, setText] = useState((value || []).join('\n'))
  useEffect(() => setText((value || []).join('\n')), [value])
  return <label className="minutes-edit-field"><span>{label}</span><textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => onChange(text.split('\n').map((name) => name.trim()).filter(Boolean))} placeholder="One attendee per line" /></label>
}

function EditableField({ label, value, onChange, kind }) {
  if (kind === 'attendees') return <AttendeesField label={label} value={value} onChange={onChange} />
  if (kind === 'location') {
    return <div className="minutes-edit-field"><span>{label}</span><Dropdown value={value || ''} onChange={(event) => onChange(event.target.value)} menuLabel="Meeting rooms"><option value="">Not specified</option>{rooms.map((room) => <option key={room}>{room}</option>)}{value && !rooms.includes(value) && <option value={value}>{value}</option>}</Dropdown><input value={value || ''} onChange={(event) => onChange(event.target.value)} aria-label="Custom location" placeholder="Or enter another location" /></div>
  }
  return <label className="minutes-edit-field"><span>{label}</span>{kind === 'long'
    ? <textarea rows={2} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    : <input type="text" value={value || ''} onChange={(event) => onChange(event.target.value)} />}</label>
}

function EditableRows({ title, section, columns, rows, onChange }) {
  const fields = columns.filter(([key]) => key !== 'ref_no')
  const renumber = (items) => items.map((item, index) => ({ ...item, ref_no: index + 1 }))
  const changeRow = (index, key, value) => onChange(renumber(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)))
  return <><h3>{title}</h3><div className="minutes-edit-rows">{rows.map((row, index) => <fieldset key={`${section}-${index}`} className="minutes-edit-row"><legend>Ref. No. {index + 1}</legend><div className="minutes-edit-grid">{fields.map(([key, label]) => <EditableField key={key} label={label} value={row[key]} onChange={(value) => changeRow(index, key, value)} kind={['action_or_decision', 'description', 'milestone', 'status_comments'].includes(key) ? 'long' : undefined} />)}</div><button type="button" onClick={() => onChange(renumber(rows.filter((_, rowIndex) => rowIndex !== index)))}>Remove</button></fieldset>)}<button type="button" onClick={() => onChange([...rows, { ref_no: rows.length + 1, ...Object.fromEntries(fields.map(([key]) => [key, ''])) }])}>Add {title === 'Action Items' ? 'action / decision' : title === 'Milestones' ? 'milestone' : 'issue'}</button></div></>
}

export function MeetingMinutesEditor({ minutes, onChange }) {
  const updateObject = (section, key, value) => onChange({ ...minutes, [section]: { ...minutes[section], [key]: value } })
  const updateRows = (section, rows) => onChange({ ...minutes, [section]: rows })
  return <section className="meeting-minutes minutes-editor" aria-label="Edit meeting minutes">
    <h3>Meeting Details</h3><div className="minutes-edit-grid">{detailFields.map(([key, label]) => <EditableField key={key} label={label} value={minutes.meeting_details[key]} onChange={(value) => updateObject('meeting_details', key, value)} kind={key === 'location' || key === 'attendees' ? key : ['purpose', 'agenda'].includes(key) ? 'long' : undefined} />)}</div>
    <h3>Meeting Summary</h3><EditableField label="Summary" value={minutes.meeting_summary} onChange={(value) => onChange({ ...minutes, meeting_summary: value })} kind="long" />
    <EditableRows title="Action Items" section="action_items" columns={actionColumns} rows={minutes.action_items} onChange={(rows) => updateRows('action_items', rows)} />
    <EditableRows title="Dependencies / Blockers / Impediments / Issues" section="dependencies_blockers_issues" columns={issueColumns} rows={minutes.dependencies_blockers_issues} onChange={(rows) => updateRows('dependencies_blockers_issues', rows)} />
    <EditableRows title="Milestones" section="milestones" columns={milestoneColumns} rows={minutes.milestones} onChange={(rows) => updateRows('milestones', rows)} />
    <h3>Next Meeting</h3><div className="minutes-edit-grid">{nextFields.map(([key, label]) => <EditableField key={key} label={label} value={minutes.next_meeting[key]} onChange={(value) => updateObject('next_meeting', key, value)} kind={['agenda', 'comments'].includes(key) ? 'long' : undefined} />)}</div>
    <p className="minutes-editor-note">Action approval and follow-up records are managed separately below.</p>
  </section>
}
