const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const sessionUpdates = new Map()

function sessionExpired(token, force = false) {
  if (token && (force || !sessionUpdates.has(token))) {
    window.dispatchEvent(new CustomEvent('cadence-session-expired', { detail: token }))
  }
}

async function updateSession(path, token, body, method = 'POST') {
  sessionUpdates.set(token, (sessionUpdates.get(token) || 0) + 1)
  try {
    return await request(path, { method, token, body })
  } catch (error) {
    if (error.status === 401) sessionExpired(token, true)
    throw error
  } finally {
    const pending = sessionUpdates.get(token) - 1
    if (pending) sessionUpdates.set(token, pending)
    else sessionUpdates.delete(token)
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) sessionExpired(token)
    const error = new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`)
    error.status = res.status
    throw error
  }
  return data
}

async function uploadFile(path, { token, file, fields = {} }) {
  const formData = new FormData()
  formData.append('file', file)
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value))

  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  // no Content-Type here — the browser sets the multipart boundary automatically

  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) sessionExpired(token)
    throw new Error(data.detail || `Request failed (${res.status})`)
  }
  return data
}

async function downloadFile(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(`${API_URL}${path}`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) sessionExpired(token)
    throw new Error(data.detail || `Download failed (${res.status})`)
  }
  return res.blob()
}

export const api = {
  signup: (body) => request('/auth/signup', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  googleConfig: () => request('/auth/google/config'),
  googleLogin: (body) => request('/auth/google', { method: 'POST', body }),
  me: (token) => request('/auth/me', { token }),
  profile: (token) => request('/auth/profile', { token }),
  updateProfile: (token, body) => updateSession('/auth/profile', token, body, 'PATCH'),
  changePassword: (token, body) => updateSession('/auth/password', token, body),
  linkGoogle: (token, body) => updateSession('/auth/google/link', token, body),
  unlinkGoogle: (token, body) => updateSession('/auth/google/unlink', token, body),
  isUpdatingSession: (token) => sessionUpdates.has(token),
  signOutAll: (token) => request('/auth/sessions/revoke', { method: 'POST', token }),
  deleteAccount: (token, body) => request('/auth/account', { method: 'DELETE', body, token }),
  employees: (token) => request('/employees', { token }),

  createProject: (token, body) => request('/projects', { method: 'POST', body, token }),
  listProjects: (token) => request('/projects', { token }),
  projectDetail: (token, id) => request(`/projects/${id}`, { token }),
  deleteProject: (token, id) => request(`/projects/${id}`, { method: 'DELETE', token }),
  addProjectMember: (token, projectId, userId) =>
    request(`/projects/${projectId}/members`, { method: 'POST', body: { user_id: userId }, token }),
  removeProjectMember: (token, projectId, userId) =>
    request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE', token }),

  analyzeMeeting: (token, body) => request('/meetings/analyze', { method: 'POST', body, token }),
  analyzeMeetingFile: (token, { file, title, project_id, duration, meeting_date, location, team }) =>
    uploadFile('/meetings/analyze-file', { token, file, fields: { title, project_id, duration: duration ?? '', meeting_date, location, team: team ?? '' } }),
  listMeetings: (token) => request('/meetings', { token }),
  meetingDetail: (token, id) => request(`/meetings/${id}`, { token }),
  editMeeting: (token, id, body) => request(`/meetings/${id}`, { method: 'PATCH', token, body }),
  deleteMeeting: (token, id) => request(`/meetings/${id}`, { method: 'DELETE', token }),
  downloadMeetingRecording: (token, id) => downloadFile(`/meetings/${id}/recording/download`, token),
  generateFollowup: (token, id) => request(`/meetings/${id}/followup`, { method: 'POST', token }),

  editActionItem: (token, id, body) => request(`/action-items/${id}`, { method: 'PATCH', body, token }),
  approveActionItem: (token, id) => request(`/action-items/${id}/approve`, { method: 'POST', token }),
  listFollowups: (token, id) => request(`/action-items/${id}/followups`, { token }),
  generateActionFollowup: (token, id, followup_type) =>
    request(`/action-items/${id}/followups`, { method: 'POST', body: { followup_type }, token }),
  saveFollowup: (token, id, followup_type, message) =>
    request(`/action-items/${id}/followups/save`, { method: 'POST', body: { followup_type, message }, token }),
  markFollowupSent: (token, id) =>
    request(`/action-items/followups/${id}/sent`, { method: 'PATCH', token }),
  myFollowups: (token) => request('/action-items/my-followups', { token }),
  respondToFollowup: (token, id, response) =>
    request(`/action-items/my-followups/${id}/response`, { method: 'POST', body: { response }, token }),
  editFollowup: (token, id, message) =>
    request(`/action-items/followups/${id}`, { method: 'PATCH', body: { message }, token }),
  setStatus: (token, id, status) =>
    request(`/action-items/${id}/status`, { method: 'PATCH', body: { status }, token }),

  dashboard: (token) => request('/dashboard', { token }),
  riskCheck: (token) => request('/dashboard/risk-check', { method: 'POST', token }),
}
