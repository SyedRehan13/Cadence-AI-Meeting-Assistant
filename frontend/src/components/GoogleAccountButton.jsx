import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { loadGoogleScript } from './GoogleSignIn.jsx'

export default function GoogleAccountButton({ onCredential, disabled }) {
  const containerRef = useRef(null)
  const latest = useRef({ onCredential, disabled })
  latest.current = { onCredential, disabled }
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    const container = containerRef.current
    setError('')
    setReady(false)
    async function initialize() {
      try {
        const { client_id: clientId } = await api.googleConfig()
        if (!clientId) throw new Error('Google sign-in is not available right now.')
        const google = await loadGoogleScript()
        if (!active) return
        const nonce = crypto.randomUUID()
        google.initialize({
          client_id: clientId, nonce, auto_select: false,
          callback: (response) => {
            if (!active || latest.current.disabled) return
            if (response.credential) latest.current.onCredential({ credential: response.credential, nonce })
            else setError('Google sign-in did not finish. Please try again.')
          },
        })
        google.renderButton(container, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(400, container.clientWidth) })
        setReady(true)
      } catch (err) {
        if (active) setError(err.message)
      }
    }
    initialize()
    return () => { active = false; container.replaceChildren() }
  }, [retry])

  return <div className="account-google-confirm"><div ref={containerRef} inert={disabled ? '' : undefined} />{!ready && !error && <p role="status">Loading Google sign-in…</p>}{error && <><p role="alert">{error}</p><button type="button" className="account-reset" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>Try Google again</button></>}</div>
}
