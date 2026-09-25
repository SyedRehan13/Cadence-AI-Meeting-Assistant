import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import AuthLayout, { AuthError, AuthField, AuthSubmit } from '../components/AuthLayout.jsx'
import GoogleSignIn from '../components/GoogleSignIn.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      const data = await api.login({ email, password })
      login(data.access_token, { name: data.name, role: data.role })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="login">
      <GoogleSignIn disabled={loading} onBusyChange={setLoading} />
      <form className="auth-form" onSubmit={handleSubmit} aria-label="Log in">
        <AuthError>{error}</AuthError>
        <AuthField id="email" label="Email address" icon="mail" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@company.com" required />
        <AuthField id="password" label="Password" icon="lock" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password" required />
        <AuthSubmit loading={loading} loadingText="Logging in…">Let’s get started</AuthSubmit>
      </form>
    </AuthLayout>
  )
}
