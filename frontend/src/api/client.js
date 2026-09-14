import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const login = (username, password) => api.post('/auth/login', { username, password }).then(r => r.data)
export const getMe = () => api.get('/auth/me').then(r => r.data)
export const registerUser = (payload) => api.post('/auth/register', payload).then(r => r.data)

export const getOverview = () => api.get('/kpis/overview').then(r => r.data)
export const getHealthScore = () => api.get('/kpis/health-score').then(r => r.data)
export const getInsights = () => api.get('/kpis/insights').then(r => r.data)
export const getTrend = () => api.get('/kpis/trend').then(r => r.data)

export const getDistribution = () => api.get('/conversation/distribution').then(r => r.data)
export const getHeatmap = () => api.get('/conversation/heatmap').then(r => r.data)
export const getFindings = () => api.get('/conversation/findings').then(r => r.data)

export const listCalls = (params = {}) => api.get('/calls', { params }).then(r => r.data)
export const getCall = (id) => api.get(`/calls/${id}`).then(r => r.data)
export const getCallDetail = (callId) => api.get(`/client/call/${callId}`).then(r => r.data)

export const listAgents = () => api.get('/agents').then(r => r.data)
export const getAgent = (id) => api.get(`/agents/${id}`).then(r => r.data)
export const getTeamHealth = () => api.get('/agents/team-health').then(r => r.data)
export const getCoachingQueue = () => api.get('/agents/coaching').then(r => r.data)
export const createCoaching = (payload) => api.post('/agents/coaching', payload).then(r => r.data)
export const updateCoaching = (id, payload) => api.put(`/agents/coaching/${id}`, payload).then(r => r.data)
export const deleteCoaching = (id) => api.delete(`/agents/coaching/${id}`).then(r => r.data)
export const autoFlagCoaching = () => api.post('/agents/coaching/auto-flag').then(r => r.data)

export const listIncidents = (severity, status) => api.get('/incidents', { params: { ...(severity ? { severity } : {}), ...(status && status !== 'All' ? { status } : {}) } }).then(r => r.data)
export const createIncident = (payload) => api.post('/incidents', payload).then(r => r.data)
export const updateIncident = (id, payload) => api.patch(`/incidents/${id}`, payload).then(r => r.data)
export const deleteIncident = (id) => api.delete(`/incidents/${id}`).then(r => r.data)
export const getFatalRules = () => api.get('/incidents/fatal-rules/all').then(r => r.data)
export const createFatalRule = (payload) => api.post('/incidents/fatal-rules', payload).then(r => r.data)
export const updateFatalRule = (id, payload) => api.patch(`/incidents/fatal-rules/${id}`, payload).then(r => r.data)
export const deleteFatalRule = (id) => api.delete(`/incidents/fatal-rules/${id}`).then(r => r.data)
export const getIncidentAgents = () => api.get('/incidents/agents').then(r => r.data)

export const listAlerts = () => api.get('/alerts').then(r => r.data)
export const listAlertCategories = () => api.get('/alerts/categories').then(r => r.data)
export const updateAlert = (id, payload) => api.patch(`/alerts/${id}`, payload).then(r => r.data)
export const getSampleEmail = (id) => api.get(`/alerts/sample-email/${id}`).then(r => r.data)

export const getNotificationRules = () => api.get('/settings/notifications').then(r => r.data)
export const addNotificationRule = (payload) => api.post('/settings/notifications', payload).then(r => r.data)
export const updateNotificationRule = (id, payload) => api.put(`/settings/notifications/${id}`, payload).then(r => r.data)
export const deleteNotificationRule = (id) => api.delete(`/settings/notifications/${id}`).then(r => r.data)

export const getWorkspace = () => api.get('/settings/workspace').then(r => r.data)
export const updateWorkspace = (payload) => api.put('/settings/workspace', payload).then(r => r.data)

export const getSettingsUsers = (role) => api.get('/settings/users', { params: role && role !== 'All' ? { role } : {} }).then(r => r.data)
export const createSettingsUser = (payload) => api.post('/settings/users', payload).then(r => r.data)
export const updateSettingsUser = (id, payload) => api.put(`/settings/users/${id}`, payload).then(r => r.data)
export const deleteSettingsUser = (id) => api.delete(`/settings/users/${id}`).then(r => r.data)

export const getSettingsIntegrations = () => api.get('/settings/integrations').then(r => r.data)
export const addIntegration = (payload) => api.post('/settings/integrations', payload).then(r => r.data)
export const updateIntegration = (id, payload) => api.put(`/settings/integrations/${id}`, payload).then(r => r.data)
export const deleteIntegration = (id) => api.delete(`/settings/integrations/${id}`).then(r => r.data)

export const getSecuritySettings = () => api.get('/settings/security').then(r => r.data)
export const updateSecuritySettings = (payload) => api.put('/settings/security', payload).then(r => r.data)

export const listAiPrompts = (clientId) =>
  api.get('/settings/ai-prompts', { params: clientId ? { client_id: clientId } : {} }).then(r => r.data)
export const getAiPrompt = (id) => api.get(`/settings/ai-prompts/${id}`).then(r => r.data)
export const createAiPrompt = (payload) => api.post('/settings/ai-prompts', payload).then(r => r.data)
export const updateAiPrompt = (id, payload) => api.patch(`/settings/ai-prompts/${id}`, payload).then(r => r.data)
export const activateAiPrompt = (id) => api.post(`/settings/ai-prompts/${id}/activate`).then(r => r.data)
export const deleteAiPrompt = (id) => api.delete(`/settings/ai-prompts/${id}`).then(r => r.data)

export const listClients = () => api.get('/clients').then(r => r.data)

export const listAllClients = () => api.get('/clients/list').then(r => r.data)
export const getClientDetail = (id) => api.get(`/clients/detail/${id}`).then(r => r.data)
export const createClient = (payload) => api.post('/clients', payload).then(r => r.data)
export const updateClient = (id, payload) => api.put(`/clients/${id}`, payload).then(r => r.data)
export const deleteClient = (id) => api.delete(`/clients/${id}`).then(r => r.data)
export const toggleClientStatus = (id) => api.patch(`/clients/${id}/toggle-status`).then(r => r.data)

export const getClientsSummary = (fromDate, toDate, clientType) =>
  api.get('/clients/summary', { params: { from_date: fromDate, to_date: toDate, client_type: clientType } }).then(r => r.data)

export const getClientOverview = (clientId, fromDate, toDate, clientType) =>
  api.get(`/client/${clientId}/overview`, { params: { from_date: fromDate, to_date: toDate, client_type: clientType } }).then(r => r.data)

export const getClientCalls = (clientId, fromDate, toDate, page = 1, limit = 20, clientType) =>
  api.get(`/client/${clientId}/calls`, { params: { from_date: fromDate, to_date: toDate, page, limit, client_type: clientType } }).then(r => r.data)

export const getClientAgents = (clientId, fromDate, toDate, clientType) =>
  api.get(`/client/${clientId}/agents`, { params: { from_date: fromDate, to_date: toDate, client_type: clientType } }).then(r => r.data)

export const getClientTeamHealth = (clientId, fromDate, toDate, clientType) =>
  api.get(`/client/${clientId}/team-health`, { params: { from_date: fromDate, to_date: toDate, client_type: clientType } }).then(r => r.data)

export const getClientSettings = async (clientId) => {
  try {
    const res = await api.get(`/client-settings/${clientId}`)
    return res.data
  } catch (err) {
    if (err.response?.status === 404) return null
    throw err
  }
}

export const saveClientSettings = (payload) =>
  api.post('/client-settings', payload).then(r => r.data)

export default api
