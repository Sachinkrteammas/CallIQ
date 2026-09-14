import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '../components/shared.jsx'
import { useAuth } from '../components/AuthContext.jsx'
import { useClientFilter } from '../components/ClientContext.jsx'
import {
  listAllClients, getClientDetail, createClient, updateClient,
  deleteClient, toggleClientStatus
} from '../api/client.js'
import {
  Plus, Search, Eye, Edit3, Trash2, ToggleLeft, ToggleRight,
  X, Loader2, Users, Building2, ChevronLeft, ChevronRight,
} from 'lucide-react'

const EMPTY_FORM = {
  name: '', email: '', login_password: '', db_ip: '',
  dialer_user: '', dialer_pass: '', db_host: '', db_user: '',
  db_pass: '', campaigns: '', ingroups: '',
}

function MaskedField({ value }) {
  if (!value) return <span className="text-[#6B7385]">—</span>
  return <span>••••••••</span>
}

export default function Clients() {
  const { user, isAdmin } = useAuth()
  const { clientType: globalClientType } = useClientFilter()
  const showIngroups = isAdmin || user?.client_type !== 'sales'

  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 10

  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showView, setShowView] = useState(false)
  const [viewClient, setViewClient] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAllClients()
      setClients(data || [])
    } catch {
      showToast('Failed to load clients', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const typeOf = (c) => {
    const ig = (c.ingroups || '').trim()
    return ig ? 'Service' : 'Sales'
  }

  const filtered = clients.filter(c =>
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.db_ip.toLowerCase().includes(search.toLowerCase()) ||
      c.campaigns.toLowerCase().includes(search.toLowerCase()))
  ).filter(c => !globalClientType || typeOf(c) === globalClientType)

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  useEffect(() => { setPage(1) }, [search])

  const openAdd = () => {
    setForm({ ...EMPTY_FORM })
    setEditId(null)
    setModalMode('add')
    setShowModal(true)
  }

  const openEdit = (client) => {
    setForm({
      name: client.name || '',
      email: client.email || '',
      login_password: client.login_password || '',
      db_ip: client.db_ip || '',
      dialer_user: client.dialer_user || '',
      dialer_pass: client.dialer_pass || '',
      db_host: client.db_host || '',
      db_user: client.db_user || '',
      db_pass: client.db_pass || '',
      campaigns: client.campaigns || '',
      ingroups: client.ingroups || '',
    })
    setEditId(client.id)
    setModalMode('edit')
    setShowModal(true)
  }

  const openView = async (client) => {
    setShowView(true)
    setViewLoading(true)
    try {
      const data = await getClientDetail(client.id)
      setViewClient(data)
    } catch {
      setViewClient(client)
    } finally {
      setViewLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Client name is required', 'error')
      return
    }
    setSaving(true)
    try {
      if (modalMode === 'edit' && editId) {
        await updateClient(editId, form)
        showToast('Client updated successfully')
      } else {
        await createClient(form)
        showToast('Client created successfully')
      }
      setShowModal(false)
      fetchClients()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to save client', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (client) => {
    try {
      await toggleClientStatus(client.id)
      showToast(`Client ${client.is_active ? 'deactivated' : 'activated'}`)
      fetchClients()
    } catch {
      showToast('Failed to update status', 'error')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteClient(confirmDelete.id)
      showToast('Client deleted successfully')
      setConfirmDelete(null)
      fetchClients()
    } catch {
      showToast('Failed to delete client', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'db_ip', label: 'DB IP' },
    { key: 'campaigns', label: 'Campaigns' },
  ]
  if (showIngroups) {
    columns.push({ key: 'ingroups', label: 'Ingroups' })
  }
  columns.push(
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Action' },
    { key: 'created_at', label: 'Created' },
  )

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all ${
          toast.type === 'error' ? 'bg-[#D14343] text-white' : 'bg-[#1C9A6C] text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D2433]">Client Management</h1>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3457D5] text-white text-sm font-semibold hover:bg-[#2A45B0] transition"
          >
            <Plus size={16} />
            Add Client
          </button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-[#E7E2D8]">
          <div className="relative w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7385]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#3457D5]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={40} className="text-[#6B7385] mb-3" />
            <p className="text-sm text-[#6B7385] font-medium">
              {search ? 'No clients match your search' : 'No clients yet. Click "Add Client" to create one.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F4EE]">
                    {columns.map(col => (
                      <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-[#6B7385] uppercase tracking-wider">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((client) => (
                    <tr key={client.id} className="border-t border-[#E7E2D8] hover:bg-[#F7F4EE]/50 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#1D2433]">{client.name}</div>
                        {client.email && <div className="text-xs text-[#6B7385] mt-0.5">{client.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-[#1D2433] font-mono text-xs">{client.db_ip || '—'}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="text-xs text-[#1D2433] truncate" title={client.campaigns}>
                          {client.campaigns || '—'}
                        </div>
                      </td>
                      {showIngroups && (
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="text-xs text-[#1D2433] truncate" title={client.ingroups}>
                            {client.ingroups || '—'}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          client.is_active ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'
                        }`}>
                          {client.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openView(client)}
                            className="p-1.5 rounded-lg hover:bg-[#EEF1FE] text-[#3457D5] transition"
                            title="View"
                          >
                            <Eye size={15} />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleToggle(client)}
                                className={`p-1.5 rounded-lg hover:bg-[#FCF1DF] transition ${client.is_active ? 'text-[#C9862B]' : 'text-[#1C9A6C]'}`}
                                title={client.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {client.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                              </button>
                              <button
                                onClick={() => openEdit(client)}
                                className="p-1.5 rounded-lg hover:bg-[#EEF1FE] text-[#3457D5] transition"
                                title="Edit"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(client)}
                                className="p-1.5 rounded-lg hover:bg-[#FBE9E9] text-[#D14343] transition"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6B7385] whitespace-nowrap">
                        {client.created_at ? new Date(client.created_at).toLocaleDateString('en-US', {
                          month: 'numeric', day: 'numeric', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#E7E2D8]">
                <span className="text-xs text-[#6B7385]">
                  Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-[#F7F4EE] disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                        p === page ? 'bg-[#3457D5] text-white' : 'hover:bg-[#F7F4EE] text-[#6B7385]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-[#F7F4EE] disabled:opacity-30 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E2D8]">
              <h2 className="text-lg font-bold text-[#1D2433]">
                {modalMode === 'edit' ? 'Edit Client' : 'Add Client'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-[#F7F4EE] transition">
                <X size={18} className="text-[#6B7385]" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Client name" />
                <InputField label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="Email address" type="email" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Login Password" value={form.login_password} onChange={v => setForm(f => ({ ...f, login_password: v }))} placeholder="Login password" type="password" />
                <InputField label="DB IP" value={form.db_ip} onChange={v => setForm(f => ({ ...f, db_ip: v }))} placeholder="e.g. 192.168.10.9" />
              </div>

              <div className="border-t border-[#E7E2D8] pt-4">
                <h3 className="text-xs font-semibold text-[#6B7385] uppercase tracking-wider mb-3">Dialer Credentials</h3>
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Dialer User" value={form.dialer_user} onChange={v => setForm(f => ({ ...f, dialer_user: v }))} placeholder="Dialer username" />
                  <InputField label="Dialer Pass" value={form.dialer_pass} onChange={v => setForm(f => ({ ...f, dialer_pass: v }))} placeholder="Dialer password" type="password" />
                </div>
              </div>

              <div className="border-t border-[#E7E2D8] pt-4">
                <h3 className="text-xs font-semibold text-[#6B7385] uppercase tracking-wider mb-3">Database Credentials</h3>
                <div className="grid grid-cols-3 gap-4">
                  <InputField label="DB Host" value={form.db_host} onChange={v => setForm(f => ({ ...f, db_host: v }))} placeholder="Database host" />
                  <InputField label="DB User" value={form.db_user} onChange={v => setForm(f => ({ ...f, db_user: v }))} placeholder="Database user" />
                  <InputField label="DB Pass" value={form.db_pass} onChange={v => setForm(f => ({ ...f, db_pass: v }))} placeholder="Database password" type="password" />
                </div>
              </div>

              <div className="border-t border-[#E7E2D8] pt-4">
                <h3 className="text-xs font-semibold text-[#6B7385] uppercase tracking-wider mb-3">Campaigns & Groups</h3>
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Campaigns" value={form.campaigns} onChange={v => setForm(f => ({ ...f, campaigns: v }))} placeholder="Comma-separated campaigns" />
                  <InputField label="Ingroups" value={form.ingroups} onChange={v => setForm(f => ({ ...f, ingroups: v }))} placeholder="Comma-separated ingroups" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E7E2D8]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#6B7385] hover:bg-[#F7F4EE] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#3457D5] text-white text-sm font-semibold hover:bg-[#2A45B0] transition disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {modalMode === 'edit' ? 'Update Client' : 'Create Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E2D8]">
              <h2 className="text-lg font-bold text-[#1D2433]">Client Details</h2>
              <button onClick={() => { setShowView(false); setViewClient(null) }} className="p-1.5 rounded-lg hover:bg-[#F7F4EE] transition">
                <X size={18} className="text-[#6B7385]" />
              </button>
            </div>

            {viewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[#3457D5]" />
              </div>
            ) : viewClient && (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF1FE] flex items-center justify-center">
                    <Users size={22} className="text-[#3457D5]" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[#1D2433]">{viewClient.name}</div>
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      viewClient.is_active ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'
                    }`}>
                      {viewClient.status}
                    </span>
                  </div>
                </div>

                <DetailRow label="Email" value={viewClient.email || '—'} />
                <DetailRow label="DB IP" value={viewClient.db_ip || '—'} mono />
                <DetailRow label="Login Password" value={viewClient.login_password} masked />
                <DetailRow label="Dialer User" value={viewClient.dialer_user || '—'} />
                <DetailRow label="Dialer Pass" value={viewClient.dialer_pass} masked />
                <DetailRow label="DB Host" value={viewClient.db_host || '—'} />
                <DetailRow label="DB User" value={viewClient.db_user || '—'} />
                <DetailRow label="DB Pass" value={viewClient.db_pass} masked />
                <DetailRow label="Campaigns" value={viewClient.campaigns || '—'} />
                {showIngroups && <DetailRow label="Ingroups" value={viewClient.ingroups || '—'} />}
                <DetailRow label="Created" value={viewClient.created_at
                  ? new Date(viewClient.created_at).toLocaleString()
                  : '—'
                } />
              </div>
            )}

            <div className="flex justify-end px-6 py-4 border-t border-[#E7E2D8]">
              <button
                onClick={() => { setShowView(false); setViewClient(null) }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#6B7385] hover:bg-[#F7F4EE] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-[#1D2433] mb-2">Delete Client</h3>
            <p className="text-sm text-[#6B7385] mb-6">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#6B7385] hover:bg-[#F7F4EE] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl bg-[#D14343] text-white text-sm font-semibold hover:bg-[#B83535] transition disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#1D2433] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] text-[#1D2433] placeholder-[#6B7385] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 transition"
      />
    </div>
  )
}

function DetailRow({ label, value, masked, mono }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#E7E2D8]/50 last:border-0">
      <span className="text-xs font-semibold text-[#6B7385] w-28 shrink-0">{label}</span>
      {masked ? (
        <span className="text-sm text-[#1D2433]">••••••••</span>
      ) : (
        <span className={`text-sm text-[#1D2433] ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  )
}
