import React, { useState } from 'react'
import { Card, SectionTitle } from '../components/shared.jsx'
import { FileText, Download, Loader2, Clock, CheckCircle, Mail, Calendar, Filter } from 'lucide-react'
import { useClientFilter } from '../components/ClientContext.jsx'

const TYPES = [
  { name: 'Executive Summary', icon: FileText, desc: 'High-level overview of all metrics and key findings' },
  { name: 'Agent Performance', icon: FileText, desc: 'Individual agent scores, trends, and comparisons' },
  { name: 'Compliance Audit', icon: FileText, desc: 'Compliance violations, patterns, and recommendations' },
  { name: 'Conversation Intelligence', icon: FileText, desc: 'AI-detected behaviours, sentiment, and patterns' },
  { name: 'Incident Report', icon: FileText, desc: 'All incidents with severity, status, and resolution' },
  { name: 'Coaching Effectiveness', icon: FileText, desc: 'Training outcomes and improvement metrics' },
  { name: 'Queue Performance', icon: FileText, desc: 'Queue-wise score breakdown and volume analysis' },
  { name: 'Client Scorecard', icon: FileText, desc: 'Per-client quality metrics and SLA compliance' },
  { name: 'Sales Categorization', icon: FileText, desc: 'Genuine vs Invalid sales with reasons' },
]
const FORMATS = ['PDF', 'Excel', 'CSV', 'Email']

export default function Reports() {
  const { clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate } = useClientFilter()
  const [type, setType] = useState(TYPES[0].name)
  const [format, setFormat] = useState('PDF')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  
  // NEW FILTERS
  const [advisorId, setAdvisorId] = useState('')
  const [category, setCategory] = useState('')
  const [saleCategory, setSaleCategory] = useState('')
  const [invalidReason, setInvalidReason] = useState('')

  const generate = () => {
    setLoading(true); setDone(false)
    setTimeout(() => { setLoading(false); setDone(true) }, 1500)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">Reports</h1>

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
          <div className="mb-4">
            <div className="text-xs font-semibold text-[#6B7385] mb-2 uppercase">Export Format</div>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button key={f} onClick={() => setFormat(f)} className={`text-xs font-semibold px-4 py-2 rounded-full border transition ${format === f ? 'bg-[#16213E] text-white border-[#16213E]' : 'border-[#E7E2D8] text-[#6B7385] hover:border-[#3457D5]/40'}`}>{f}</button>
              ))}
            </div>
          </div>
          <button onClick={generate} className="flex items-center gap-2 bg-[#3457D5] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {loading ? 'Generating…' : `Generate ${type} (${format})`}
          </button>
          {done && (
            <div className="flex items-center gap-2 text-xs text-[#1C9A6C] font-semibold mt-3">
              <CheckCircle size={14} /> Report generated successfully — ready for download
            </div>
          )}
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