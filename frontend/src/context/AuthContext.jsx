import React, { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('cadence_token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function sessionExpired(event) {
      if (event.detail !== localStorage.getItem('cadence_token')) return
      localStorage.removeItem('cadence_token')
      setToken(null)
      setUser(null)
    }
    function storageChanged(event) {
      if (event.key === 'cadence_token') {
        setToken(event.newValue)
        if (!event.newValue) setUser(null)
      }
    }
    window.addEventListener('cadence-session-expired', sessionExpired)
    window.addEventListener('storage', storageChanged)
    return () => {
      window.removeEventListener('cadence-session-expired', sessionExpired)
      window.removeEventListener('storage', storageChanged)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    const check = () => {
      if (document.visibilityState === 'visible' && !api.isUpdatingSession(token)) api.me(token).catch(() => {})
    }
    const interval = setInterval(check, 60000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [token])

  useEffect(() => {
    let active = true
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    api.me(token)
      .then((profile) => { if (active) setUser(profile) })
      .catch(() => {
        if (!active) return
        setToken(null)
        setUser(null)
        localStorage.removeItem('cadence_token')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  function login(newToken, userInfo) {
    localStorage.setItem('cadence_token', newToken)
    setToken(newToken)
    setUser(userInfo)
  }

  function logout() {
    window.google?.accounts?.id?.disableAutoSelect()
    localStorage.removeItem('cadence_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
