import React, { useState } from 'react'
import { Card, SectionTitle, ProgressBar } from '../components/shared.jsx'
import { CONVERSATION_SCORE_DIMENSIONS } from '../data/mock.js'
import PromptBuilder from '../components/promptBuilder/PromptBuilder.jsx'
import { Settings, Sliders, Bell, History } from 'lucide-react'

export default function AIConfig() {
  const [activeTab, setActiveTab] = useState('parameters')
  const [weights, setWeights] = useState({
    professionalism: 15, empathy: 12, listening: 14, confidence: 10,
    compliance: 18, patience: 8, resolution: 13, customer_experience: 10,
  })

  const tabs = [
    { id: 'parameters', label: 'Parameters', icon: Sliders },
    { id: 'scorecard', label: 'Scorecard Sim', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'prompts', label: 'Prompt Builder', icon: Settings },
    { id: 'history', label: 'Version History', icon: History },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">AI Configuration</h1>

      <div className="flex gap-1 bg-white rounded-xl border border-[#E7E2D8] p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${activeTab === t.id ? 'bg-[#16213E] text-white' : 'text-[#6B7385] hover:bg-[#F7F4EE]'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'parameters' && (
        <Card>
          <SectionTitle icon={Sliders}>Quality Parameters and Weights</SectionTitle>
          <p className="text-xs text-[#6B7385] mb-4">Adjust the weight of each parameter in the overall scoring formula.</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              {Object.entries(weights).map(([key, value]) => (
                <div key={key} className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#1D2433] font-medium capitalize">{key.replace('_', ' ')}</span>
                    <span className="text-[#6B7385] font-semibold">{value}%</span>
                  </div>
                  <input type="range" min="0" max="30" value={value}
                    onChange={(e) => setWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-[#F0EDE4] rounded-full appearance-none cursor-pointer accent-[#3457D5]" />
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-[#E7E2D8]">
                <span>Total Weight</span>
                <span className={Object.values(weights).reduce((a, b) => a + b, 0) === 100 ? 'text-[#1C9A6C]' : 'text-[#D14343]'}>
                  {Object.values(weights).reduce((a, b) => a + b, 0)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#6B7385] mb-3 uppercase">Current Score Distribution</div>
              {CONVERSATION_SCORE_DIMENSIONS.map((d) => (
                <ProgressBar key={d.dimension} label={d.dimension} value={d.score} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'scorecard' && (
        <Card>
          <SectionTitle icon={Settings}>Scorecard Simulator</SectionTitle>
          <div className="grid grid-cols-2 gap-6">
            <div>
              {CONVERSATION_SCORE_DIMENSIONS.map((d) => (
                <ProgressBar key={d.dimension} label={d.dimension} value={d.score} />
              ))}
            </div>
            <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-[#F7F4EE] border border-[#E7E2D8]">
              <div className="text-xs text-[#6B7385] font-semibold mb-2">Simulated Score</div>
              <div className="text-5xl font-extrabold text-[#1D2433]">77%</div>
              <div className="text-sm font-semibold text-[#C9862B] mt-1">Needs Attention</div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <SectionTitle icon={Bell}>AI Notification Rules</SectionTitle>
          <div className="space-y-2">
            {[
              { trigger: 'Critical Incident Detected', channels: 'Email, Slack, SMS', frequency: 'Immediate', enabled: true },
              { trigger: 'Agent Score Below 60', channels: 'Email, Slack', frequency: 'Immediate', enabled: true },
              { trigger: 'Compliance Violation', channels: 'Email', frequency: 'Immediate', enabled: true },
              { trigger: 'Daily Summary', channels: 'Email', frequency: 'Daily 6 PM', enabled: true },
              { trigger: 'Escalation Threshold', channels: 'Email, Slack, SMS', frequency: 'Immediate', enabled: false },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between border border-[#E7E2D8] rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[#1D2433]">{r.trigger}</div>
                  <div className="text-xs text-[#6B7385]">{r.channels} - {r.frequency}</div>
                </div>
                <button className={`w-11 h-6 rounded-full relative transition ${r.enabled ? 'bg-[#1C9A6C]' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${r.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'prompts' && (
        <PromptBuilder />
      )}

      {activeTab === 'history' && (
        <Card>
          <SectionTitle icon={History}>Version History</SectionTitle>
          <div className="space-y-3">
            {[
              { v: 'v4', date: 'Aug 3, 2026', author: 'Rohan Mehta', changes: 'Updated escalation threshold. Added data privacy rule.' },
              { v: 'v3', date: 'Jul 28, 2026', author: 'Priya Sharma', changes: 'Reduced empathy weight. Added customer experience.' },
              { v: 'v2', date: 'Jul 15, 2026', author: 'Rohan Mehta', changes: 'Added dead air detection. Updated compliance rules.' },
              { v: 'v1', date: 'Jun 1, 2026', author: 'Admin', changes: 'Initial configuration.' },
            ].map((item, i) => (
              <div key={i} className="border border-[#E7E2D8] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-[#1D2433]">{item.v}</span>
                  <span className="text-[10px] text-[#6B7385]">{item.date}</span>
                </div>
                <div className="text-xs text-[#6B7385]">by {item.author}</div>
                <div className="text-sm text-[#1D2433] mt-1">{item.changes}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
