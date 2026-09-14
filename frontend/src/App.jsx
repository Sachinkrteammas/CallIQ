import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import { FilterProvider } from './components/FilterContext.jsx'
import { ClientProvider } from './components/ClientContext.jsx'

import LoginPage from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import CallExplorer from './pages/CallExplorer.jsx'
import CallDetails from './pages/CallDetails.jsx'
import ConversationIntelligence from './pages/ConversationIntelligence.jsx'
import Agents from './pages/Agents.jsx'
import CoachingCenter from './pages/CoachingCenter.jsx'
import IncidentCenter from './pages/Incidents.jsx'
import Alerts from './pages/Alerts.jsx'
import Analytics from './pages/Analytics.jsx'
import Reports from './pages/Reports.jsx'
import AIConfig from './pages/AIConfig.jsx'
import Clients from './pages/Clients.jsx'
import Settings from './pages/Settings.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F4EE] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3457D5]" />
      </div>
    )
  }
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-[#16213E] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    )
  }
  return user ? <Navigate to="/" replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      <Route
        element={
          <ProtectedRoute>
            <FilterProvider>
              <ClientProvider>
                <Layout />
              </ClientProvider>
            </FilterProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/calls" element={<CallExplorer />} />
        <Route path="/calls/:id" element={<CallDetails />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/coaching" element={<CoachingCenter />} />
        <Route path="/conversation-intelligence" element={<ConversationIntelligence />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/ai-config" element={<AIConfig />} />
        <Route path="/incidents" element={<IncidentCenter />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
