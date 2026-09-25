import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api.js'
import GoogleAccountButton from './GoogleAccountButton.jsx'

const actionCopy = {
  profile: ['Confirm email change', 'Save new email'],
  password: ['Change password', 'Save password'],
  link: ['Link your Google account', 'Link Google account'],
  unlink: ['Unlink your Google account', 'Unlink Google'],
  signout: ['Sign out from all devices', 'Sign out everywhere'],
  delete: ['Delete your account', 'Delete my account'],
}

export default function AccountActionDialog({ action, profile, token, onClose, onComplete }) {
  const dialogRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [method, setMethod] = useState(profile.has_password ? 'password' : 'google')
  const [currentPassword, setCurrentPassword] = useState('')
  const [googleProof, setGoogleProof] = useState(null)
  const [linkProof, setLinkProof] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteText, setDeleteText] = useState('')
  const needsProof = action.kind !== 'signout'
  const [title, submitLabel] = actionCopy[action.kind]

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  function keyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busyRef.current) onClose()
    }
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), iframe, a[href]')].filter((element) => !element.closest('[inert]') && element.getClientRects().length)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current) return
    setError('')
    if (needsProof && method === 'google' && !googleProof) { setError('Continue with your connected Google account first.'); return }
    if (action.kind === 'link' && !linkProof) { setError('Choose the Google account you want to link first.'); return }
    if (action.kind === 'password' && newPassword !== confirmPassword) { setError('The new passwords do not match.'); return }
    if (action.kind === 'password' && new TextEncoder().encode(newPassword).length > 72) { setError('Please choose a shorter password (at most 72 UTF-8 bytes).'); return }
    busyRef.current = true
    setBusy(true)
    try {
      const proof = method === 'password' ? { current_password: currentPassword } : googleProof
      let result
      switch (action.kind) {
        case 'profile': result = await api.updateProfile(token, { ...action.payload, ...proof }); break
        case 'password': result = await api.changePassword(token, { ...proof, new_password: newPassword }); break
        case 'link': result = await api.linkGoogle(token, { ...proof, google_credential: linkProof.credential, google_nonce: linkProof.nonce }); break
        case 'unlink': result = await api.unlinkGoogle(token, proof); break
        case 'signout': result = await api.signOutAll(token); break
        case 'delete': result = await api.deleteAccount(token, { ...proof, confirmation: deleteText }); break
        default: throw new Error('Please choose an account action.')
      }
      onComplete(action.kind, result)
    } catch (err) {
      setError(err.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return createPortal(
    <div className="account-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyRef.current) onClose() }}>
      <section ref={dialogRef} className="account-dialog account-page" role="dialog" aria-modal="true" aria-labelledby="account-action-title" tabIndex={-1} onKeyDown={keyDown}>
        <header><h2 id="account-action-title">{action.kind === 'password' && !profile.has_password ? 'Set a password' : title}</h2><button type="button" className="account-dialog-close" onClick={onClose} disabled={busy} aria-label="Close account action">×</button></header>
        <form onSubmit={submit}>
          <div className="account-dialog-content">
            {error && <div className="account-alert is-error" role="alert">{error}</div>}
            {action.kind === 'profile' && <p>Your new sign-in email will be <strong>{action.payload.email}</strong>. Other devices will be signed out. Your Google connection stays the same.</p>}
            {action.kind === 'password' && <><p>Use at least 8 characters. Saving will sign out other devices.</p><div className="account-field"><label htmlFor="account-new-password">New password</label><input id="account-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><div className="account-field"><label htmlFor="account-confirm-password">Confirm new password</label><input id="account-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></>}
            {action.kind === 'link' && <><p>Choose a Google account, then confirm your Cadence password to link it. Other devices will be signed out.</p><GoogleAccountButton onCredential={setLinkProof} disabled={busy} />{linkProof && <p className="account-proof-ready" role="status">Google account selected.</p>}</>}
            {action.kind === 'unlink' && <p>Google will no longer sign you in to this Cadence account. Use <strong>{profile.email}</strong> and your password instead. Other devices will be signed out.</p>}
            {action.kind === 'signout' && <p>This ends every Cadence session, including this one. You will need to sign in again on each device.</p>}
            {action.kind === 'delete' && <><p className="account-delete-explanation">Your profile and sign-in methods will be removed, and you will be signed out everywhere. This cannot be undone. Shared project and meeting history stays available to your team with an anonymous author.</p><div className="account-field"><label htmlFor="account-delete-confirm">Type DELETE to confirm</label><input id="account-delete-confirm" autoComplete="off" pattern="DELETE" required disabled={busy} value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></div></>}
            {needsProof && <fieldset className="account-identity" disabled={busy}><legend>Confirm it’s you</legend>{profile.has_password && profile.google_connected && action.kind !== 'link' && <div className="account-proof-methods"><button type="button" aria-pressed={method === 'password'} onClick={() => { setMethod('password'); setGoogleProof(null) }}>Use password</button><button type="button" aria-pressed={method === 'google'} onClick={() => { setMethod('google'); setCurrentPassword('') }}>Use Google</button></div>}{method === 'password' ? <div className="account-field"><label htmlFor="account-proof-password">Current password</label><input id="account-proof-password" type="password" autoComplete="current-password" required disabled={busy} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div> : <><p>Continue with your connected Google account{profile.google_email ? ` (${profile.google_email})` : ''}.</p><GoogleAccountButton onCredential={setGoogleProof} disabled={busy} />{googleProof && <p className="account-proof-ready" role="status">Google account selected.</p>}</>}</fieldset>}
          </div>
          <footer className="account-dialog-footer"><button type="button" className="account-reset" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={action.kind === 'delete' ? 'account-danger-button' : 'account-save'} disabled={busy || (action.kind === 'delete' && deleteText !== 'DELETE')}>{busy ? 'Working…' : submitLabel}</button></footer>
        </form>
      </section>
    </div>, document.body,
  )
}
