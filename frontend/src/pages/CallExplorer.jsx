import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, SeverityBadge, EmptyState } from '../components/shared.jsx'
import { getClientCalls } from '../api/client.js'
import { useClientFilter } from '../components/ClientContext.jsx'
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Calendar, RefreshCw, Building2 } from 'lucide-react'

function getDateRange(days) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

const rankingColor = {
  Excellent: 'bg-[#E7F7EF] text-[#1C9A6C]',
  Good: 'bg-[#EEF1FE] text-[#3457D5]',
  Average: 'bg-[#FCF1DF] text-[#C9862B]',
  Poor: 'bg-[#FBE9E9] text-[#D14343]',
  Critical: 'bg-[#D14343] text-white',
}

export default function CallExplorer() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { clientId, clients, setClientId, selectedClient, isAllClients, fromDate, toDate, setFromDate, setToDate, clientType } = useClientFilter()
  const [calls, setCalls] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const pageSize = 20

  const fetchCalls = useCallback(() => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    getClientCalls(clientId, fromDate, toDate, page, pageSize, clientType)
      .then((res) => {
        setCalls(res.calls || [])
        setTotal(res.total || 0)
        setTotalPages(res.pages || 0)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load calls')
        setLoading(false)
      })
  }, [clientId, fromDate, toDate, page, clientType])

  useEffect(() => {
    fetchCalls()
  }, [fetchCalls])

  useEffect(() => {
    setPage(1)
  }, [clientId, fromDate, toDate])

  const filtered = calls.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c._call_id || '').toLowerCase().includes(q) ||
      (c._agent_id || '').toLowerCase().includes(q) ||
      JSON.stringify(c.sections || {}).toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'score') return ((a.total_score || 0) - (b.total_score || 0)) * dir
    if (sortKey === 'percentage') return ((a.percentage || 0) - (b.percentage || 0)) * dir
    if (sortKey === 'duration') return (((a._duration ?? 0) || 0) - ((b._duration ?? 0) || 0)) * dir
    if (sortKey === 'date') return ((a._created_at || '') > (b._created_at || '') ? 1 : -1) * dir
    return 0
  })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const handlePreset = (days) => {
    const range = getDateRange(days)
    setFromDate(range.from)
    setToDate(range.to)
  }

  const openingScore = (c) => {
    const s = c.sections?.opening
    return s ? Math.round((s.score / s.max_score) * 100) : 0
  }

  const communicationScore = (c) => {
    const s = c.sections?.communication
    return s ? Math.round((s.score / s.max_score) * 100) : 0
  }

  const formatDuration = (sec) => {
    if (sec === null || sec === undefined) return '—'
    const total = Math.round(Number(sec))
    if (Number.isNaN(total)) return '—'
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Call Explorer</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{isAllClients ? 'All Clients' : selectedClient ? selectedClient.name : 'No client selected'} · {fromDate} to {toDate}</p>
        </div>
        <span className="text-xs text-[#6B7385] font-medium">{total} calls found</span>
      </div>

      {/* Filter Bar */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-[#6B7385]" />
            <label className="text-xs font-semibold text-[#6B7385]">Client</label>
            <select
              value={clientId ?? ''}
              onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5] min-w-[160px]"
            >
              <option value="all">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-[#6B7385]" />
            <label className="text-xs font-semibold text-[#6B7385]">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#6B7385]">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => handlePreset(d)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#E7E2D8] hover:border-[#3457D5]/40 text-[#6B7385] hover:text-[#3457D5] transition"
              >
                {d}D
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7385]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by Call ID, Agent..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <RefreshCw size={24} className="text-[#3457D5] animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-14">
            <p className="text-sm text-[#D14343] font-medium">{error}</p>
            <button onClick={fetchCalls} className="mt-2 text-xs font-semibold text-[#3457D5] hover:underline">Retry</button>
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState text="No calls match these filters. Try widening your date range or clearing filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2 pr-3">Call ID</th>
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('duration')}>
                    <span className="flex items-center gap-1">Duration <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('score')}>
                    <span className="flex items-center gap-1">Score <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('percentage')}>
                    <span className="flex items-center gap-1">Percentage <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="py-2 pr-3">Ranking</th>
                  <th className="py-2 pr-3">Opening</th>
                  <th className="py-2 pr-3">Communication</th>
                  <th className="py-2 pr-3">Fatal</th>
                  <th className="py-2 pr-3">Category</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr
                    key={c._call_id || c._id || i}
                    onClick={() => navigate(`/calls/${c._call_id || c._id}`)}
                    className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] cursor-pointer transition"
                  >
                    <td className="py-2.5 pr-3 font-semibold text-[#3457D5]">{c._call_id || '—'}</td>
                    <td className="py-2.5 pr-3 font-medium text-[#1D2433]">{c._agent_name || c._agent_id || '—'}</td>
                    <td className="py-2.5 pr-3 text-[#6B7385] text-xs">{(c._created_at || '').slice(0, 10)}</td>
                    <td className="py-2.5 pr-3 text-xs font-medium text-[#1D2433]">{formatDuration(c._duration)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`font-semibold ${(c.total_score || 0) >= 80 ? 'text-[#1C9A6C]' : (c.total_score || 0) >= 60 ? 'text-[#C9862B]' : 'text-[#D14343]'}`}>
                        {c.total_score || 0}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-[#F0EDE4] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${c.percentage || 0}%`,
                              background: (c.percentage || 0) >= 80 ? '#1C9A6C' : (c.percentage || 0) >= 60 ? '#C9862B' : '#D14343',
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium">{c.percentage || 0}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rankingColor[c.ranking] || 'bg-gray-100 text-gray-600'}`}>
                        {c.ranking || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-semibold ${openingScore(c) >= 80 ? 'text-[#1C9A6C]' : openingScore(c) >= 60 ? 'text-[#C9862B]' : 'text-[#D14343]'}`}>
                        {openingScore(c)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-semibold ${communicationScore(c) >= 80 ? 'text-[#1C9A6C]' : communicationScore(c) >= 60 ? 'text-[#C9862B]' : 'text-[#D14343]'}`}>
                        {communicationScore(c)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.fatal_flag || c._is_transcript_fatal ? (
                        <span className="text-[10px] font-bold text-[#D14343] bg-[#FBE9E9] px-2 py-0.5 rounded-full">Fatal</span>
                      ) : (
                        <span className="text-[10px] font-medium text-[#6B7385]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[#6B7385] text-xs capitalize">{(c.call_category || '—').replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-4 text-xs text-[#6B7385]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-[#E7E2D8] disabled:opacity-40 font-semibold hover:bg-[#F7F4EE] transition flex items-center gap-1">
                  <ChevronLeft size={13} /> Previous
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-[#E7E2D8] disabled:opacity-40 font-semibold hover:bg-[#F7F4EE] transition flex items-center gap-1">
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
