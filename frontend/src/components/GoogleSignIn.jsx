import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { AuthError, AuthField, AuthSubmit } from './AuthLayout.jsx'

let googleScriptPromise

export function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      let timeout
      const fail = () => {
        clearTimeout(timeout)
        script.remove()
        googleScriptPromise = undefined
        reject(new Error('Google sign-in could not load. Please try again or use email and password.'))
      }
      script.onload = () => {
        clearTimeout(timeout)
        if (window.google?.accounts?.id) resolve(window.google.accounts.id)
        else fail()
      }
      script.onerror = fail
      timeout = setTimeout(fail, 15000)
      document.head.appendChild(script)
    })
  }
  return googleScriptPromise
}

export default function GoogleSignIn({ role = 'employee', disabled, onBusyChange }) {
  const buttonRef = useRef(null)
  const latest = useRef({ role, disabled, onBusyChange })
  latest.current = { role, disabled, onBusyChange }
  const busyRef = useRef(false)
  const mountedRef = useRef(false)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [pendingCredential, setPendingCredential] = useState(null)
  const [password, setPassword] = useState('')
  const [retry, setRetry] = useState(0)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function signIn(payload) {
    if (busyRef.current || latest.current.disabled) return
    busyRef.current = true
    latest.current.onBusyChange(true)
    setError(null)
    try {
      const data = await api.googleLogin(payload)
      if (!mountedRef.current) return
      login(data.access_token, { name: data.name, role: data.role })
      navigate('/dashboard')
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
      if (err.status === 409) {
        const { password: ignored, ...credential } = payload
        setPendingCredential(credential)
      } else {
        setPendingCredential(null)
      }
    } finally {
      busyRef.current = false
      if (mountedRef.current) {
        setPassword('')
        latest.current.onBusyChange(false)
      }
    }
  }

  useEffect(() => {
    let active = true
    mountedRef.current = true
    const container = buttonRef.current
    setStatus('loading')
    setError(null)
    async function initialize() {
      try {
        const { client_id: clientId } = await api.googleConfig()
        if (!active) return
        if (!clientId) {
          setStatus('unavailable')
          return
        }
        const google = await loadGoogleScript()
        if (!active) return
        const nonce = crypto.randomUUID()
        google.initialize({
          client_id: clientId,
          nonce,
          auto_select: false,
          callback: (response) => {
            if (!active) return
            if (!response.credential) {
              setError('Google sign-in did not finish. Please try again.')
              return
            }
            setPendingCredential(null)
            signIn({ credential: response.credential, nonce, role: latest.current.role })
          },
        })
        google.renderButton(container, {
          type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
          shape: 'pill', width: Math.min(400, container.clientWidth), logo_alignment: 'left',
        })
        setStatus('ready')
      } catch (err) {
        if (!active) return
        setStatus('error')
        setError(err.message)
      }
    }
    initialize()
    return () => {
      active = false
      mountedRef.current = false
      container.replaceChildren()
    }
  }, [retry])

  function cancelLink() {
    setPendingCredential(null)
    setPassword('')
    setError(null)
  }

  return (
    <div className="auth-google">
      <div ref={buttonRef} className="auth-google-button" inert={disabled || pendingCredential ? '' : undefined} aria-busy={disabled || status === 'loading'} />
      {status === 'loading' && <p className="auth-google-status" role="status">Loading Google sign-in…</p>}
      {status === 'unavailable' && <><button className="auth-google-unavailable" type="button" disabled>Continue with Google</button><p className="auth-google-status">Google sign-in is not available yet.</p></>}
      {status === 'error' && <button className="auth-google-retry" type="button" onClick={() => setRetry((value) => value + 1)}>Retry Google sign-in</button>}
      {disabled && status === 'ready' && <p className="auth-google-status" role="status">Signing you in…</p>}
      <AuthError>{error}</AuthError>
      {pendingCredential && (
        <form className="auth-google-link" onSubmit={(event) => { event.preventDefault(); signIn({ ...pendingCredential, password }) }} aria-label="Link your Google account">
          <p>Confirm your Cadence password once to use Google with your existing account.</p>
          <AuthField id="google-link-password" label="Cadence password" icon="lock" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={disabled} />
          <AuthSubmit loading={disabled} loadingText="Linking your account…">Link Google and continue</AuthSubmit>
          <button className="auth-google-cancel" type="button" onClick={cancelLink} disabled={disabled}>Cancel</button>
        </form>
      )}
      <div className="auth-divider"><span>or continue with email</span></div>
    </div>
  )
}
