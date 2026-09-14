import React, { useState } from 'react'
import { Card, SectionTitle } from '../components/shared.jsx'
import { FileText, Download, Loader2, Clock, CheckCircle, Mail, Calendar } from 'lucide-react'

const TYPES = [
  { name: 'Executive Summary', icon: FileText, desc: 'High-level overview of all metrics and key findings' },
  { name: 'Agent Performance', icon: FileText, desc: 'Individual agent scores, trends, and comparisons' },
  { name: 'Compliance Audit', icon: FileText, desc: 'Compliance violations, patterns, and recommendations' },
  { name: 'Conversation Intelligence', icon: FileText, desc: 'AI-detected behaviours, sentiment, and patterns' },
  { name: 'Incident Report', icon: FileText, desc: 'All incidents with severity, status, and resolution' },
  { name: 'Coaching Effectiveness', icon: FileText, desc: 'Training outcomes and improvement metrics' },
  { name: 'Queue Performance', icon: FileText, desc: 'Queue-wise score breakdown and volume analysis' },
  { name: 'Client Scorecard', icon: FileText, desc: 'Per-client quality metrics and SLA compliance' },
]
const FORMATS = ['PDF', 'Excel', 'CSV', 'Email']

export default function Reports() {
  const [type, setType] = useState(TYPES[0].name)
  const [format, setFormat] = useState('PDF')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

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
