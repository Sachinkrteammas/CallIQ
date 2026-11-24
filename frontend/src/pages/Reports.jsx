import React, { useState, useEffect } from 'react'
import { Card, SectionTitle } from '../components/shared.jsx'
import { FileText, Download, Loader2, Clock, CheckCircle, Mail, Calendar, Filter, AlertTriangle } from 'lucide-react'
import { useClientFilter } from '../components/ClientContext.jsx'
import { exportClientWiseReport, exportAgentWiseReport, exportAuditsReport, triggerPipeline, getPipelineStatus } from '../api/client.js'
import { Zap, RefreshCw, BarChart3 } from 'lucide-react'

const TYPES = [
  { name: 'Detailed Audit Records', icon: FileText, desc: 'Call-level audit export with scores, sale status and reasons', export: 'audits' },
  { name: 'Agent Performance', icon: FileText, desc: 'Agent-wise audits, scores and sale outcomes', export: 'agent' },
  { name: 'Client Scorecard', icon: FileText, desc: 'Client-wise summary of audits and sales quality', export: 'client' },
  { name: 'Sales Categorization', icon: FileText, desc: 'Genuine vs Invalid sales with reasons (included in audit export)', export: 'audits' },
  { name: 'Executive Summary', icon: FileText, desc: 'Use Client Scorecard export for a client-level summary', export: 'client' },
  { name: 'Compliance Audit', icon: FileText, desc: 'Use Detailed Audit Records export and filter by fatal/score in sheet', export: 'audits' },
]
const FORMATS = ['CSV']

export default function Reports() {
  const { clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate } = useClientFilter()
  const [type, setType] = useState(TYPES[0].name)
  const [format, setFormat] = useState('CSV')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  
  // NEW FILTERS
  const [advisorId, setAdvisorId] = useState('')
  const [category, setCategory] = useState('')
  const [saleCategory, setSaleCategory] = useState('')
  const [invalidReason, setInvalidReason] = useState('')

  const [error, setError] = useState(null)

  // Issue 6: live data — trigger the fetch/STT/audit pipeline on demand
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineResult, setPipelineResult] = useState(null)
  const [pipelineStatus, setPipelineStatus] = useState(null)

  const refreshPipelineStatus = async () => {
    try {
      const st = await getPipelineStatus({ client_id: clientId && clientId !== 'all' ? Number(clientId) : null })
      setPipelineStatus(st)
    } catch { /* ignore */ }
  }
  useEffect(() => { refreshPipelineStatus() }, [clientId])

  const runPipeline = async () => {
    setPipelineRunning(true)
    setPipelineResult(null)
    try {
      const res = await triggerPipeline({ client_id: clientId && clientId !== 'all' ? Number(clientId) : null, limit: 50 })
      setPipelineResult(res)
      setTimeout(refreshPipelineStatus, 1500)
    } catch (e) {
      setPipelineResult({ errors: [e?.response?.data?.detail || e?.message || 'Pipeline trigger failed'] })
    } finally {
      setPipelineRunning(false)
      setTimeout(refreshPipelineStatus, 2000)
    }
  }

  const generate = async () => {
    setLoading(true); setDone(false); setError(null)
    try {
      const params = {}
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (clientId && clientId !== 'all') params.client_id = clientId
      if (saleCategory) params.sale_category = saleCategory

      const selected = TYPES.find(t => t.name === type) || TYPES[0]
      if (selected.export === 'client') {
        await exportClientWiseReport(params)
      } else if (selected.export === 'agent') {
        await exportAgentWiseReport(params)
      } else {
        await exportAuditsReport(params)
      }
      setDone(true)
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to export report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">Reports</h1>

      {/* Live Data — Issue 6: fetch/STT/audit pipeline */}
      <Card>
        <SectionTitle>Live Data — Run Audit Pipeline</SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={runPipeline}
            disabled={pipelineRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3457D5] text-white text-sm font-semibold hover:bg-[#2a45b0] transition disabled:opacity-60"
          >
            {pipelineRunning ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {pipelineRunning ? 'Running...' : 'Run Fetch + STT + Audit'}
          </button>
          <div className="text-xs text-[#6B7385] flex items-center gap-1.5">
            {pipelineStatus ? (
              <>
                <BarChart3 size={12} className="text-[#3457D5]" />
                Calls: <span className="font-bold text-[#1D2433]">{pipelineStatus.calls}</span>
                {' · '}Audited: <span className="font-bold text-[#1C9A6C]">{pipelineStatus.audited_calls}</span>
                {' · '}Avg %: <span className="font-bold text-[#C9862B]">{pipelineStatus.avg_percentage}</span>
                {pipelineStatus.fatal_calls > 0 && <span className="text-[#D14343]"> · {pipelineStatus.fatal_calls} fatal</span>}
              </>
            ) : 'Loading pipeline status...'}
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-[#6B7385]">
            <RefreshCw size={10} className="text-[#3457D5] animate-spin" /> Live
          </div>
        </div>
        {pipelineResult && (
          <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-xl ${pipelineResult.errors?.length ? 'bg-[#FBE9E9] text-[#D14343]' : 'bg-[#E7F7EF] text-[#1C9A6C]'}`}>
            {pipelineResult.errors?.length ? (
              <div><div>Pipeline errors:</div><div className="mt-1">{pipelineResult.errors.join(' | ')}</div></div>
            ) : (
              <div>Pipeline result: fetch={pipelineResult.stages?.fetch ?? '-'}, stt={pipelineResult.stages?.stt ?? '-'}, audit={pipelineResult.stages?.audit ?? '-'}</div>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <SectionTitle>Generate Report</SectionTitle>
          
          {/* NEW FILTERS SECTION */}
          <div className="mb-4 p-3 rounded-xl border border-[#E7E2D8] bg-[#F7F4EE]/50">
            <div className="flex items-center gap-2 mb-2">
              <Filter size={14} className="text-[#6B7385]" />
              <span className="text-xs font-semibold text-[#6B7385] uppercase">Report Filters</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Client</label>
                <select
                  value={clientId ?? ''}
                  onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5]"
                >
                  <option value="all">All Clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Advisor ID</label>
                <input
                  type="text"
                  value={advisorId}
                  onChange={(e) => setAdvisorId(e.target.value)}
                  placeholder="e.g. AGT-101"
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5]"
                >
                  <option value="">All Categories</option>
                  <option value="Inbound">Inbound</option>
                  <option value="Outbound">Outbound</option>
                  <option value="Sales">Sales</option>
                  <option value="Service">Service</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Sale Status</label>
                <select
                  value={saleCategory}
                  onChange={(e) => setSaleCategory(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5]"
                >
                  <option value="">All</option>
                  <option value="Genuine">Genuine</option>
                  <option value="Invalid">Invalid</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Invalid Reason</label>
                <select
                  value={invalidReason}
                  onChange={(e) => setInvalidReason(e.target.value)}
                  className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5]"
                >
                  <option value="">All</option>
                  <option value="Forcefully Placed">Forcefully Placed</option>
                  <option value="Not Confirmed">Not Confirmed</option>
                  <option value="Without Information">Without Information</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold text-[#6B7385] mb-2 uppercase">Report Type</div>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button key={t.name} onClick={() => setType(t.name)} className={`text-left text-sm px-4 py-3 rounded-xl border transition-all ${type === t.name ? 'border-[#3457D5] bg-[#EEF1FE] text-[#3457D5] font-semibold shadow-sm' : 'border-[#E7E2D8] text-[#1D2433] hover:border-[#3457D5]/30'}`}>
                  <div className="flex items-center gap-2">
                    <t.icon size={14} />
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-[10px] text-[#6B7385] font-normal mt-0.5">{t.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={generate} className="flex items-center gap-2 bg-[#3457D5] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {loading ? 'Exporting…' : `Export ${type} (CSV)`}
          </button>
          {done && (
            <div className="flex items-center gap-2 text-xs text-[#1C9A6C] font-semibold mt-3">
              <CheckCircle size={14} /> Report exported successfully
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-[#D14343] font-semibold mt-3">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <div className="mt-2 text-[10px] text-[#6B7385]">
            Exports use real audited data and respect Client, Date range and Sale Status filters. PDF/Excel/Email scheduling is not configured in this build.
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionTitle icon={Clock}>Scheduled Reports</SectionTitle>
            <div className="space-y-3 text-sm">
              <div className="border border-[#E7E2D8] rounded-xl p-3">
                <div className="font-semibold text-[#1D2433]">Weekly Executive Summary</div>
                <div className="text-xs text-[#6B7385] flex items-center gap-1 mt-0.5">
                  <Calendar size={11} /> Every Monday · 8:00 AM · Email
                </div>
              </div>
              <div className="border border-[#E7E2D8] rounded-xl p-3">
                <div className="font-semibold text-[#1D2433]">Monthly Compliance Audit</div>
                <div className="text-xs text-[#6B7385] flex items-center gap-1 mt-0.5">
                  <Calendar size={11} /> 1st of month · PDF
                </div>
              </div>
              <div className="border border-[#E7E2D8] rounded-xl p-3">
                <div className="font-semibold text-[#1D2433]">Daily Alert Digest</div>
                <div className="text-xs text-[#6B7385] flex items-center gap-1 mt-0.5">
                  <Mail size={11} /> Daily · 6:00 PM · Slack
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Recent Reports</SectionTitle>
            <div className="space-y-2 text-xs">
              {[
                { name: 'Executive Summary — Week 31', date: 'Aug 4, 2026', format: 'PDF' },
                { name: 'Agent Performance — July', date: 'Aug 1, 2026', format: 'Excel' },
                { name: 'Compliance Audit — Week 30', date: 'Jul 28, 2026', format: 'PDF' },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-[#E7E2D8] hover:bg-[#F7F4EE] transition">
                  <div>
                    <div className="font-semibold text-[#1D2433]">{r.name}</div>
                    <div className="text-[#6B7385]">{r.date}</div>
                  </div>
                  <button className="text-[#3457D5] font-semibold hover:underline flex items-center gap-1">
                    <Download size={11} /> {r.format}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}