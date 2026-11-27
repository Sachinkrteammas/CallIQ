import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { listClients, setApiClientType } from '../api/client.js'
import { useAuth } from './AuthContext.jsx'

const ClientContext = createContext(null)

export function getDateRange(days) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function resolveType(c) {
  // Canonical backend rule: empty ingroups = Sales, otherwise Service.
  if (c.type === 'Sales' || c.type === 'Service') return c.type
  return (c.ingroups || '').trim() ? 'Service' : 'Sales'
}

const typeFromUser = (user) => {
  const raw = String(user?.client_type || '').toLowerCase()
  if (raw === 'service') return 'Service'
  if (raw === 'sales') return 'Sales'
  return null
}

export function ClientProvider({ children }) {
  const { user, isClientUser, clientId: userClientId } = useAuth() || {}
  const [allClients, setAllClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [clientType, setClientType] = useState(() => typeFromUser(user) || 'Sales')
  const [clientId, setClientId] = useState('all')
  const [fromDate, setFromDate] = useState(() => getDateRange(90).from)
  const [toDate, setToDate] = useState(() => getDateRange(90).to)

  const refreshClients = useCallback(async () => {
    try {
      const res = await listClients()
      const typed = (res || []).map((c) => ({ ...c, type: resolveType(c) }))
      setAllClients(typed)
      if (isClientUser && userClientId) setClientId(Number(userClientId))
    } catch {
      setAllClients([])
    }
  }, [isClientUser, userClientId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listClients()
      .then((res) => {
        if (cancelled) return
        const typed = (res || []).map((c) => ({ ...c, type: resolveType(c) }))
        setAllClients(typed)
        if (isClientUser && userClientId) setClientId(Number(userClientId))
      })
      .catch(() => {
        if (!cancelled) setAllClients([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const onRefresh = () => { if (!cancelled) refreshClients() }
    window.addEventListener('clients:refresh', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('clients:refresh', onRefresh)
    }
  }, [isClientUser, userClientId, refreshClients])

  const clients = allClients.filter((c) => !clientType || c.type === clientType)

  // Propagate the active scope to every API call and keep the selection valid.
  useEffect(() => { setApiClientType(clientType) }, [clientType])

  useEffect(() => {
    if (!isClientUser) return
    const userType = typeFromUser(user)
    if (userType && userType !== clientType) setClientType(userType)
    if (userClientId && clientId !== Number(userClientId)) setClientId(Number(userClientId))
  }, [isClientUser, user, userClientId, clientType, clientId])

  useEffect(() => {
    // A client user's ID is fixed by login. Do not reset it while the typed
    // client list is still loading, or a stale saved type can cause a loop.
    if (isClientUser || !clients.length || clientId === 'all') return
    if (!clients.some((c) => c.id === clientId)) setClientId('all')
  }, [clients, clientId, isClientUser])

  const handleSetClientType = useCallback((t) => {
    setClientType(t)
    setClientId('all')
  }, [])
  const handleSetClientId = useCallback((id) => setClientId(id), [])

  const selectedClient = clientId === 'all' ? null : clients.find((c) => c.id === clientId) || null
  const isAllClients = clientId === 'all'

  return (
    <ClientContext.Provider
      value={{
        allClients,
        clients,
        loading,
        clientType,
        setClientType: handleSetClientType,
        clientId,
        setClientId: handleSetClientId,
        selectedClient,
        isAllClients,
        isClientUser: !!isClientUser,
        fromDate,
        toDate,
        setFromDate,
        setToDate,
        refreshClients,
      }}
    >
      {children}
    </ClientContext.Provider>
  )
}

export const useClientFilter = () => useContext(ClientContext)
