import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { login as apiLogin, getMe } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    getMe()
      .then((data) => {
        setUser(data)
        localStorage.setItem('user', JSON.stringify(data))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await apiLogin(username, password)
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const isAdmin = user?.is_admin || user?.is_superuser || user?.role === 'admin'
  const clientId = user?.client_id || null
  const isClientUser = !isAdmin && clientId

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, isClientUser, clientId }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
