import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmployeePicker from '../components/EmployeePicker.jsx'
import './Projects.css'

function ProjectIcon({ name, className = '' }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m7 7 10 10M17 7 7 17" /></>,
    folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    sparkle: <><path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z" /><path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75.75-2.25Z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7M10 11v5M14 11v5" /></>,
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function initialsFor(name) {
  return (name || 'Team member').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export default function Projects() {
  const { token } = useAuth()
  const [projects, setProjects] = useState([])
  const [employees, setEmployees] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [addUserId, setAddUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [created, setCreated] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletedProjectName, setDeletedProjectName] = useState('')

  async function loadProjects() {
    const list = await api.listProjects(token)
    setProjects(list)
    return list
  }

  useEffect(() => {
    let active = true

    async function loadPage() {
      setLoading(true)
      setError(null)
      const [projectResult, employeeResult] = await Promise.allSettled([
          api.listProjects(token),
          api.employees(token),
      ])
      if (!active) return
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value)
      if (employeeResult.status === 'fulfilled') setEmployees(employeeResult.value)
      const failedRequest = projectResult.status === 'rejected' ? projectResult : employeeResult.status === 'rejected' ? employeeResult : null
      if (failedRequest) setError(failedRequest.reason.message)
      setLoading(false)
    }

    loadPage()
    return () => { active = false }
  }, [token])

  async function handleCreate(event) {
    event.preventDefault()
    if (creating) return
    setError(null)
    setCreated(false)
    setDeletedProjectName('')
    setCreating(true)
    try {
      await api.createProject(token, { name, description })
      setName('')
      setDescription('')
      await loadProjects()
      setCreated(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function openProject(project) {
    if (openingId) return
    setError(null)
    setOpeningId(project.id)
    setAddUserId('')
    setConfirmingDelete(false)
    try {
      const detail = await api.projectDetail(token, project.id)
      setSelected(detail)
    } catch (err) {
      setError(err.message)
    } finally {
      setOpeningId(null)
    }
  }

  async function handleAddMember(event) {
    event.preventDefault()
    if (!addUserId || adding) return
    setError(null)
    setAdding(true)
    try {
      await api.addProjectMember(token, selected.project.id, Number(addUserId))
      const detail = await api.projectDetail(token, selected.project.id)
      setSelected(detail)
      setAddUserId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (removingId) return
    setError(null)
    setRemovingId(userId)
    try {
      await api.removeProjectMember(token, selected.project.id, userId)
      const detail = await api.projectDetail(token, selected.project.id)
      setSelected(detail)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  async function handleDeleteProject() {
    if (!selected || deleting) return
    const projectName = selected.project.name
    setError(null)
    setDeleting(true)
    try {
      await api.deleteProject(token, selected.project.id)
      setSelected(null)
      setConfirmingDelete(false)
      setDeletedProjectName(projectName)
      await loadProjects()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const availableEmployees = selected
    ? employees.filter((employee) => !selected.members.some((member) => member.id === employee.id))
    : []

  return (
    <div className="projects-page">
      <header className="projects-hero">
        <div>
          <p className="projects-eyebrow"><span />PROJECT WORKSPACE</p>
          <h1>Projects</h1>
          <p className="projects-intro">Create focused spaces for every initiative and bring the right people together.</p>
        </div>
        <div className="projects-overview" aria-label="Projects overview">
          <div><span className="projects-overview-icon"><ProjectIcon name="folder" /></span><strong>{projects.length}</strong><small>{projects.length === 1 ? 'Project' : 'Projects'}</small></div>
          <i />
          <div><span className="projects-overview-icon people"><ProjectIcon name="people" /></span><strong>{employees.length}</strong><small>People available</small></div>
        </div>
      </header>

      {error && <div className="projects-alert" role="alert"><span><ProjectIcon name="close" /></span><div><strong>Something needs attention</strong><p>{error}</p></div></div>}
      {created && <div className="projects-success" role="status"><ProjectIcon name="check" />Project created and ready for its team.</div>}
      {deletedProjectName && <div className="projects-success" role="status"><ProjectIcon name="check" />{deletedProjectName} was deleted successfully.</div>}

      <section className="project-create-card" aria-labelledby="create-project-title">
        <div className="project-create-heading">
          <span><ProjectIcon name="sparkle" /></span>
          <div><p>START SOMETHING NEW</p><h2 id="create-project-title">Create a project</h2></div>
        </div>
        <form className="project-create-form" onSubmit={handleCreate}>
          <div className="project-field">
            <label htmlFor="project-name">Project name</label>
            <input id="project-name" value={name} onChange={(event) => { setName(event.target.value); setCreated(false) }} placeholder="e.g. Product launch" required />
          </div>
          <div className="project-field project-description-field">
            <label htmlFor="project-description">Description <span>Optional</span></label>
            <input id="project-description" value={description} onChange={(event) => { setDescription(event.target.value); setCreated(false) }} placeholder="What is this project about?" />
          </div>
          <button className="project-create-button" type="submit" disabled={creating}>
            <ProjectIcon name="plus" />{creating ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </section>

      <div className="projects-grid">
        <section className="project-directory" aria-labelledby="all-projects-title">
          <div className="projects-section-heading">
            <div><p>YOUR WORK</p><h2 id="all-projects-title">All projects</h2></div>
            <span>{projects.length} total</span>
          </div>

          <div className="project-list" aria-live="polite">
            {loading && <div className="project-loading" role="status"><span /><span /><span /><p>Gathering your projects…</p></div>}
            {!loading && projects.map((project, index) => {
              const isSelected = selected?.project.id === project.id
              const isOpening = openingId === project.id
              return (
                <button
                  className={`project-list-item${isSelected ? ' is-selected' : ''}`}
                  key={project.id}
                  type="button"
                  onClick={() => openProject(project)}
                  disabled={Boolean(openingId)}
                  aria-pressed={isSelected}
                >
                  <span className={`project-folder project-folder-${(index % 3) + 1}`}><ProjectIcon name="folder" /></span>
                  <span className="project-list-copy"><strong>{project.name}</strong><small>{project.description || 'No description added yet.'}</small></span>
                  <span className="project-open-label">{isOpening ? 'Opening…' : isSelected ? 'Selected' : 'Open'}</span>
                  <ProjectIcon name={isSelected ? 'check' : 'arrow'} className="project-list-arrow" />
                </button>
              )
            })}
            {!loading && projects.length === 0 && (
              <div className="projects-empty">
                <span><ProjectIcon name="briefcase" /></span>
                <h3>Your first project starts here</h3>
                <p>Create a project above to give your team a shared place to move work forward.</p>
              </div>
            )}
          </div>
        </section>

        <aside className={`project-team-panel${selected ? ' has-selection' : ''}`} aria-live="polite">
          {!selected ? (
            <div className="project-team-placeholder">
              <div className="project-team-illustration" aria-hidden="true"><span>AR</span><span>SK</span><span>+</span><i /><i /></div>
              <p>PROJECT TEAM</p>
              <h2>Choose a project</h2>
              <span>Select a project to see its members and shape the team.</span>
            </div>
          ) : (
            <>
              <div className="project-team-header">
                <div className="project-team-title">
                  <span><ProjectIcon name="people" /></span>
                  <div><p>PROJECT TEAM</p><h2>{selected.project.name}</h2></div>
                </div>
                <div className="project-team-actions">
                  <span className="project-member-count">{selected.members.length} {selected.members.length === 1 ? 'member' : 'members'}</span>
                  <button type="button" className="project-delete-button" onClick={() => setConfirmingDelete(true)} disabled={deleting} aria-label={`Delete ${selected.project.name}`} title="Delete project"><ProjectIcon name="trash" /></button>
                </div>
              </div>

              <div className="project-member-list">
                {selected.members.map((member, index) => (
                  <div className="project-member" key={member.id}>
                    <span className={`project-member-avatar avatar-${(index % 4) + 1}`}>{initialsFor(member.name)}<i /></span>
                    <span className="project-member-copy"><strong>{member.name}</strong><small>{member.email}</small></span>
                    <button type="button" className="project-remove-button" onClick={() => handleRemoveMember(member.id)} disabled={Boolean(removingId)} aria-label={`Remove ${member.name} from ${selected.project.name}`}>
                      <ProjectIcon name="close" />{removingId === member.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}
                {selected.members.length === 0 && (
                  <div className="project-members-empty"><span><ProjectIcon name="people" /></span><p>No members yet</p><small>Add someone below to start building this team.</small></div>
                )}
              </div>

              <form className="project-add-member" onSubmit={handleAddMember}>
                <label htmlFor="project-member-select">Add a team member</label>
                <div>
                  <EmployeePicker key={selected.project.id} id="project-member-select" employees={availableEmployees} value={addUserId} onChange={setAddUserId} disabled={availableEmployees.length === 0 || adding} />
                  <button className="project-add-member-button" type="submit" disabled={!addUserId || adding}><ProjectIcon name="plus" />{adding ? 'Adding…' : 'Add to team'}</button>
                </div>
              </form>

              {confirmingDelete && (
                <div className="project-delete-confirm" role="alert" aria-labelledby="delete-project-title" aria-describedby="delete-project-description">
                  <span className="project-delete-icon"><ProjectIcon name="trash" /></span>
                  <div className="project-delete-copy">
                    <strong id="delete-project-title">Delete “{selected.project.name}”?</strong>
                    <p id="delete-project-description">This removes the project and its team. Past meeting records will be kept.</p>
                  </div>
                  <div className="project-delete-confirm-actions">
                    <button type="button" className="project-delete-cancel" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</button>
                    <button type="button" className="project-delete-confirm-button" onClick={handleDeleteProject} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete project'}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
