import React, { useState, useEffect, useCallback } from 'react'
import { Card, SectionTitle, Toggle } from '../components/shared.jsx'
import { useAuth } from '../components/AuthContext.jsx'
import ClientSettings from './ClientSettings.jsx'
import {
  getWorkspace, updateWorkspace,
  getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser,
  getNotificationRules, addNotificationRule, updateNotificationRule, deleteNotificationRule,
  getSettingsIntegrations, addIntegration, updateIntegration, deleteIntegration,
  getSecuritySettings, updateSecuritySettings,
} from '../api/client.js'
import {
  Settings as SettingsIcon, Users as UsersIcon, Bell, Link as LinkIcon, Shield,
  Phone, MessageSquare, Database, Ticket, Cloud, Mail, Plus, Trash2, Save, X, UserPlus, Filter, SlidersHorizontal,
} from 'lucide-react'

const integrIcons = { Phone, MessageSquare, Database, Ticket, Cloud, Mail }

const AVAILABLE_CHANNELS = ['Email', 'Slack', 'SMS', 'Teams', 'Webhook']
const FREQUENCIES = ['Immediate', 'Hourly Digest', 'Daily Digest', 'Daily 6 PM', 'Monday 8 AM']
const ROLE_OPTIONS = ['System Admin', 'Operations Manager', 'Team Lead', 'QA Analyst', 'Agent', 'User']

export default function Settings() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('workspace')
  const [loading, setLoading] = useState(true)

  const [workspace, setWorkspace] = useState({ workspace_name: '', timezone: '', default_language: '', date_format: '' })
  const [workspaceDraft, setWorkspaceDraft] = useState(null)
  const [workspaceSaving, setWorkspaceSaving] = useState(false)

  const [users, setUsers] = useState([])
  const [editingUser, setEditingUser] = useState(null)
  const [roleFilter, setRoleFilter] = useState('All')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userError, setUserError] = useState(null)
  const [userSaving, setUserSaving] = useState(false)
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'Agent' })

  const [rules, setRules] = useState([])
  const [showAddNotification, setShowAddNotification] = useState(false)
  const [newNotif, setNewNotif] = useState({ trigger: '', channels: ['Email'], frequency: 'Immediate' })

  const [integrations, setIntegrations] = useState([])
  const [showAddIntegration, setShowAddIntegration] = useState(false)
  const [newIntg, setNewIntg] = useState({ name: '', type: '', icon: 'Link' })

  const [security, setSecurity] = useState({})
  const [securitySaving, setSecuritySaving] = useState(false)

  const tabs = [
    { id: 'workspace', label: 'Workspace', icon: SettingsIcon },
    { id: 'users', label: 'Users & Roles', icon: UsersIcon },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    // { id: 'integrations', label: 'Integrations', icon: LinkIcon },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'client', label: 'Client Setting', icon: SlidersHorizontal },
  ]

  const loadWorkspace = useCallback(async () => {
    try {
      const data = await getWorkspace()
      setWorkspace(data)
    } catch { /* ignore */ }
  }, [])

  const loadUsers = useCallback(async (role) => {
    try {
      const data = await getSettingsUsers(role || 'All')
      setUsers(data)
    } catch { /* ignore */ }
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getNotificationRules()
      setRules(data)
    } catch { /* ignore */ }
  }, [])

  const loadIntegrations = useCallback(async () => {
    try {
      const data = await getSettingsIntegrations()
      setIntegrations(data)
    } catch { /* ignore */ }
  }, [])

  const loadSecurity = useCallback(async () => {
    try {
      const data = await getSecuritySettings()
      setSecurity(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([loadWorkspace(), loadUsers(), loadNotifications(), loadIntegrations(), loadSecurity()])
      setLoading(false)
    }
    load()
  }, [loadWorkspace, loadUsers, loadNotifications, loadIntegrations, loadSecurity])

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers(roleFilter)
    }
  }, [roleFilter, activeTab, loadUsers])

  // ─── Workspace handlers ─────────────────────────────────────────────
  const startEditWorkspace = () => setWorkspaceDraft({ ...workspace })
  const cancelEditWorkspace = () => setWorkspaceDraft(null)
  const saveWorkspace = async () => {
    setWorkspaceSaving(true)
    try {
      const updated = await updateWorkspace(workspaceDraft)
      setWorkspace(updated)
      setWorkspaceDraft(null)
    } catch { /* ignore */ }
    setWorkspaceSaving(false)
  }

  // ─── User handlers ──────────────────────────────────────────────────
  const saveUserRole = async (userId, newRole) => {
    try {
      await updateSettingsUser(userId, { role: newRole })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      setEditingUser(null)
    } catch { /* ignore */ }
  }
  const toggleUserActive = async (userId, currentActive) => {
    try {
      await updateSettingsUser(userId, { is_active: !currentActive })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: !currentActive ? 'Active' : 'Inactive' } : u))
    } catch { /* ignore */ }
  }
  const removeUser = async (userId) => {
    if (!window.confirm('Delete this user?')) return
    try {
      await deleteSettingsUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch { /* ignore */ }
  }
  const createUser = async () => {
    setUserError(null)
    if (!newUser.email.trim() || !newUser.password) {
      setUserError('Email and password are required')
      return
    }
    setUserSaving(true)
    try {
      const created = await createSettingsUser(newUser)
      setUsers(prev => [...prev, created])
      setNewUser({ full_name: '', email: '', password: '', role: 'Agent' })
      setShowAddUser(false)
    } catch (e) {
      setUserError(e?.response?.data?.detail || 'Failed to create user')
    }
    setUserSaving(false)
  }

  // ─── Notification handlers ──────────────────────────────────────────
  const toggleNotif = async (id) => {
    const rule = rules.find(r => r.id === id)
    if (!rule) return
    try {
      await updateNotificationRule(id, { enabled: !rule.enabled })
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    } catch { /* ignore */ }
  }
  const addNotif = async () => {
    if (!newNotif.trigger.trim()) return
    try {
      const created = await addNotificationRule(newNotif)
      setRules(prev => [...prev, created])
      setNewNotif({ trigger: '', channels: ['Email'], frequency: 'Immediate' })
      setShowAddNotification(false)
    } catch { /* ignore */ }
  }
  const removeNotif = async (id) => {
    try {
      await deleteNotificationRule(id)
      setRules(prev => prev.filter(r => r.id !== id))
    } catch { /* ignore */ }
  }

  // ─── Integration handlers ───────────────────────────────────────────
  const toggleIntgStatus = async (id) => {
    const intg = integrations.find(i => i.id === id)
    if (!intg) return
    const newStatus = intg.status === 'Connected' ? 'Disconnected' : 'Connected'
    try {
      await updateIntegration(id, { status: newStatus })
      setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
    } catch { /* ignore */ }
  }
  const addIntg = async () => {
    if (!newIntg.name.trim() || !newIntg.type.trim()) return
    try {
      const created = await addIntegration(newIntg)
      setIntegrations(prev => [...prev, created])
      setNewIntg({ name: '', type: '', icon: 'Link' })
      setShowAddIntegration(false)
    } catch { /* ignore */ }
  }
  const removeIntg = async (id) => {
    try {
      await deleteIntegration(id)
      setIntegrations(prev => prev.filter(i => i.id !== id))
    } catch { /* ignore */ }
  }

  // ─── Security handlers ──────────────────────────────────────────────
  const toggleSecurity = async (key) => {
    setSecuritySaving(true)
    const newVal = !security[key]
    try {
      await updateSecuritySettings({ [key]: newVal })
      setSecurity(prev => ({ ...prev, [key]: newVal }))
    } catch { /* ignore */ }
    setSecuritySaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-[#1D2433]">Settings</h1>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3457D5]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">Settings</h1>

      <div className="flex gap-1 bg-white rounded-xl border border-[#E7E2D8] p-1 max-w-xl">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${activeTab === t.id ? 'bg-[#16213E] text-white' : 'text-[#6B7385] hover:bg-[#F7F4EE]'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── Workspace Tab ─────────────────────────────────────────────── */}
      {activeTab === 'workspace' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Workspace Settings</SectionTitle>
            {isAdmin && !workspaceDraft && (
              <button onClick={startEditWorkspace} className="text-xs font-semibold text-[#3457D5] hover:underline">Edit</button>
            )}
          </div>
          {workspaceDraft ? (
            <div className="grid grid-cols-2 gap-4 text-sm max-w-2xl">
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Workspace name</label>
                <input value={workspaceDraft.workspace_name} onChange={e => setWorkspaceDraft(p => ({ ...p, workspace_name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Timezone</label>
                <input value={workspaceDraft.timezone} onChange={e => setWorkspaceDraft(p => ({ ...p, timezone: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Default language</label>
                <input value={workspaceDraft.default_language} onChange={e => setWorkspaceDraft(p => ({ ...p, default_language: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Date format</label>
                <input value={workspaceDraft.date_format} onChange={e => setWorkspaceDraft(p => ({ ...p, date_format: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              </div>
              <div className="col-span-2 flex gap-2 mt-2">
                <button onClick={saveWorkspace} disabled={workspaceSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0] disabled:opacity-50">
                  <Save size={13} /> {workspaceSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={cancelEditWorkspace}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E7E2D8] text-[#6B7385] text-xs font-semibold hover:bg-[#F7F4EE]">
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm max-w-2xl">
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Workspace name</label>
                <div className="mt-1 px-3 py-2 rounded-xl bg-[#F7F4EE] text-[#1D2433] font-semibold">{workspace.workspace_name || '-'}</div>
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Timezone</label>
                <div className="mt-1 px-3 py-2 rounded-xl bg-[#F7F4EE] text-[#1D2433]">{workspace.timezone || '-'}</div>
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Default language</label>
                <div className="mt-1 px-3 py-2 rounded-xl bg-[#F7F4EE] text-[#1D2433]">{workspace.default_language || '-'}</div>
              </div>
              <div>
                <label className="text-xs text-[#6B7385] font-medium">Date format</label>
                <div className="mt-1 px-3 py-2 rounded-xl bg-[#F7F4EE] text-[#1D2433]">{workspace.date_format || '-'}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── Users & Roles Tab ─────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <SectionTitle>Users and Roles</SectionTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-[#6B7385]" />
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5]">
                  <option value="All">All Roles</option>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {isAdmin && (
                <button onClick={() => { setShowAddUser(!showAddUser); setUserError(null) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0] transition">
                  <UserPlus size={13} /> Create User
                </button>
              )}
            </div>
          </div>

          {showAddUser && isAdmin && (
            <div className="border border-[#3457D5]/30 bg-[#EEF1FE]/40 rounded-xl p-4 mb-4 space-y-3">
              <div className="text-xs font-bold text-[#1D2433]">Create New User</div>
              {userError && (
                <div className="bg-[#FBE9E9] text-[#D14343] text-xs font-semibold px-3 py-2 rounded-xl">{userError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#6B7385] font-medium">Full Name</label>
                  <input value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Agent full name" className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7385] font-medium">Email</label>
                  <input value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                    placeholder="agent@company.com" className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7385] font-medium">Password</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                    placeholder="Temporary password" className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7385] font-medium">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30">
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={createUser} disabled={userSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0] disabled:opacity-50 transition">
                  <Save size={13} /> {userSaving ? 'Creating...' : 'Create User'}
                </button>
                <button onClick={() => setShowAddUser(false)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E7E2D8] text-[#6B7385] text-xs font-semibold hover:bg-[#F7F4EE]">
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleColor = u.role === 'System Admin' || u.role === 'Operations Manager' ? '#D14343' : u.role === 'Team Lead' ? '#7C3AED' : u.role === 'QA Analyst' ? '#C9862B' : '#3457D5'
                  return (
                    <tr key={u.id} className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] transition">
                      <td className="py-2.5 pr-3 font-semibold text-[#1D2433]">{u.full_name}</td>
                      <td className="py-2.5 pr-3">
                        {editingUser === u.id ? (
                          <select defaultValue={u.role} onChange={e => saveUserRole(u.id, e.target.value)}
                            className="text-xs px-2 py-1 rounded-lg border border-[#E7E2D8] bg-white focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30">
                            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span onClick={() => isAdmin && setEditingUser(u.id)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80" style={{ background: roleColor + '15', color: roleColor }}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-[#6B7385] text-xs">{u.email}</td>
                      <td className="py-2.5 pr-3">
                        <button onClick={() => isAdmin && toggleUserActive(u.id, u.status === 'Active')}>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer ${u.status === 'Active' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'}`}>
                            {u.status}
                          </span>
                        </button>
                      </td>
                      <td className="py-2.5 pr-3">
                        {isAdmin && (
                          <button onClick={() => removeUser(u.id)} className="text-[#D14343] hover:text-red-700">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && (
                  <tr><td colSpan="5" className="py-6 text-center text-[#6B7385] text-xs">No users found for this role</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Notifications Tab ─────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Notification Preferences</SectionTitle>
            {isAdmin && (
              <button onClick={() => setShowAddNotification(!showAddNotification)}
                className="flex items-center gap-1 text-xs font-semibold text-[#3457D5] hover:underline">
                <Plus size={13} /> Add Rule
              </button>
            )}
          </div>
          {showAddNotification && (
            <div className="border border-[#E7E2D8] rounded-xl p-4 mb-3 space-y-3">
              <input value={newNotif.trigger} onChange={e => setNewNotif(p => ({ ...p, trigger: e.target.value }))}
                placeholder="Trigger name" className="w-full px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_CHANNELS.map(ch => (
                  <button key={ch} onClick={() => {
                    setNewNotif(p => ({
                      ...p,
                      channels: p.channels.includes(ch) ? p.channels.filter(c => c !== ch) : [...p.channels, ch]
                    }))
                  }}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition ${newNotif.channels.includes(ch) ? 'bg-[#3457D5] text-white border-[#3457D5]' : 'bg-white text-[#6B7385] border-[#E7E2D8]'}`}>
                    {ch}
                  </button>
                ))}
              </div>
              <select value={newNotif.frequency} onChange={e => setNewNotif(p => ({ ...p, frequency: e.target.value }))}
                className="text-xs px-3 py-2 rounded-xl border border-[#E7E2D8] bg-white focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30">
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={addNotif} className="px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0]">Save</button>
                <button onClick={() => setShowAddNotification(false)} className="px-4 py-2 rounded-xl border border-[#E7E2D8] text-[#6B7385] text-xs font-semibold hover:bg-[#F7F4EE]">Cancel</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-[#E7E2D8] rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[#1D2433]">{r.trigger}</div>
                  <div className="text-xs text-[#6B7385]">Channels: {r.channels.join(', ')} - {r.frequency}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Toggle checked={r.enabled} onChange={() => toggleNotif(r.id)} />
                  {isAdmin && (
                    <button onClick={() => removeNotif(r.id)} className="text-[#D14343] hover:text-red-700">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {rules.length === 0 && <p className="text-xs text-[#6B7385] text-center py-4">No notification rules</p>}
          </div>
        </Card>
      )}

      {/* ─── Integrations Tab (hidden) ─────────────────────────────────── */}
      {false && activeTab === 'integrations' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Integrations</SectionTitle>
            {isAdmin && (
              <button onClick={() => setShowAddIntegration(!showAddIntegration)}
                className="flex items-center gap-1 text-xs font-semibold text-[#3457D5] hover:underline">
                <Plus size={13} /> Add Integration
              </button>
            )}
          </div>
          {showAddIntegration && (
            <div className="border border-[#E7E2D8] rounded-xl p-4 mb-4 space-y-3">
              <input value={newIntg.name} onChange={e => setNewIntg(p => ({ ...p, name: e.target.value }))}
                placeholder="Integration name" className="w-full px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              <input value={newIntg.type} onChange={e => setNewIntg(p => ({ ...p, type: e.target.value }))}
                placeholder="Type (e.g. CRM, Telephony)" className="w-full px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
              <div className="flex gap-2">
                <button onClick={addIntg} className="px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0]">Save</button>
                <button onClick={() => setShowAddIntegration(false)} className="px-4 py-2 rounded-xl border border-[#E7E2D8] text-[#6B7385] text-xs font-semibold hover:bg-[#F7F4EE]">Cancel</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {integrations.map((intg) => {
              const Icon = integrIcons[intg.icon] || LinkIcon
              return (
                <div key={intg.id} className="border border-[#E7E2D8] rounded-xl p-4 relative group">
                  {isAdmin && (
                    <button onClick={() => removeIntg(intg.id)}
                      className="absolute top-2 right-2 text-[#D14343] opacity-0 group-hover:opacity-100 transition">
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-[#EEF1FE] flex items-center justify-center">
                      <Icon size={17} className="text-[#3457D5]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1D2433]">{intg.name}</div>
                      <div className="text-[10px] text-[#6B7385]">{intg.type}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${intg.status === 'Connected' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'}`}>
                      {intg.status}
                    </span>
                    <button onClick={() => isAdmin && toggleIntgStatus(intg.id)}
                      className="text-xs font-semibold text-[#3457D5] hover:underline">
                      {intg.status === 'Connected' ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
              )
            })}
            {integrations.length === 0 && <p className="col-span-3 text-xs text-[#6B7385] text-center py-8">No integrations configured</p>}
          </div>
        </Card>
      )}

      {/* ─── Security Tab ──────────────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <SectionTitle>Security Settings</SectionTitle>
            <div className="space-y-3">
              {[
                { key: 'two_factor_auth', label: 'Two-Factor Authentication', desc: 'Require 2FA for all users' },
                { key: 'session_timeout', label: 'Session Timeout', desc: 'Auto-logout after 30 minutes of inactivity' },
                { key: 'ip_whitelisting', label: 'IP Whitelisting', desc: 'Restrict access to approved IP ranges' },
                { key: 'audit_logging', label: 'Audit Logging', desc: 'Log all user actions for compliance' },
                { key: 'data_encryption', label: 'Data Encryption at Rest', desc: 'Encrypt stored call recordings' },
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between border border-[#E7E2D8] rounded-xl px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-[#1D2433]">{s.label}</div>
                    <div className="text-xs text-[#6B7385]">{s.desc}</div>
                  </div>
                  <Toggle checked={!!security[s.key]} onChange={() => isAdmin && toggleSecurity(s.key)} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    {/* ─── Client Settings Tab ───────────────────────────────────────── */}
      {activeTab === 'client' && <ClientSettings />}
    </div>
  )
}
