import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import AuthLayout, { AuthError, AuthField, AuthIcon, AuthSubmit } from '../components/AuthLayout.jsx'
import GoogleSignIn from '../components/GoogleSignIn.jsx'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const data = await api.signup({ name, email, password, role })
      login(data.access_token, { name: data.name, role: data.role })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="signup">
      <fieldset className="auth-role-picker auth-signup-role" disabled={loading}>
        <legend>How will you use Cadence?</legend>
        <div className="auth-role-options">
          {[{ value: 'employee', title: 'Team member', detail: 'Make things happen', icon: 'person' }, { value: 'pm', title: 'Project manager', detail: 'Bring it all together', icon: 'team' }].map((option) => (
            <label className="auth-role-option" key={option.value}>
              <input type="radio" name="role" value={option.value} checked={role === option.value} onChange={(e) => setRole(e.target.value)} />
              <span className="auth-role-card"><AuthIcon name={option.icon} /><span className="auth-role-indicator"><AuthIcon name="check" /></span><strong>{option.title}</strong><small>{option.detail}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <GoogleSignIn role={role} disabled={loading} onBusyChange={setLoading} />
      <form className="auth-form" onSubmit={handleSubmit} aria-label="Create an account">
        <AuthError>{error}</AuthError>
        <AuthField id="name" label="Full name" icon="person" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your first and last name" required />
        <AuthField id="email" label="Email address" icon="mail" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@company.com" required />
        <AuthField id="password" label="Password" icon="lock" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="Create a password" required />
        <AuthSubmit loading={loading} loadingText="Creating your account…">Create my account</AuthSubmit>
      </form>
    </AuthLayout>
  )
}
