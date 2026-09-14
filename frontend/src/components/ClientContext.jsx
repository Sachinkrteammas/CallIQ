import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { listClients } from '../api/client.js'
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
  if (c.type === 'Sales' || c.type === 'Service') return c.type
  const ig = (c.ingroups || '').trim()
  const cp = (c.campaigns || '').trim()
  if (!ig) return 'Sales'
  if (!cp) return 'Service'
  return 'Sales'
}

export function ClientProvider({ children }) {
  const { isClientUser, clientId: userClientId } = useAuth() || {}
  const [allClients, setAllClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [clientType, setClientType] = useState('Sales')
  const [clientId, setClientId] = useState('all')
  const [fromDate, setFromDate] = useState(() => getDateRange(7).from)
  const [toDate, setToDate] = useState(() => getDateRange(7).to)

  useEffect(() => {
    let cancelled = false
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
    return () => { cancelled = true }
  }, [isClientUser, userClientId])

  const clients = allClients.filter((c) => !clientType || c.type === clientType)

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
      }}
    >
      {children}
    </ClientContext.Provider>
  )
}

export const useClientFilter = () => useContext(ClientContext)
