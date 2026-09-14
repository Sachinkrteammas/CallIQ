import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle } from '../components/shared.jsx'
import { ANALYTICS, TREND_DATA } from '../data/mock.js'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#3457D5', '#1C9A6C', '#C9862B', '#D14343', '#7C3AED', '#EC4899', '#06B6D4', '#F59E0B']

export default function Analytics() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">Analytics</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Score Trend */}
        <Card>
          <SectionTitle>Quality Score Trend</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TREND_DATA}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} domain={[50, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="avg_score" name="Avg Score" stroke="#3457D5" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="compliance" name="Compliance" stroke="#1C9A6C" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="sentiment" name="Sentiment" stroke="#C9862B" strokeWidth={2.5} dot={false} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Hourly Call Volume */}
        <Card>
          <SectionTitle>Hourly Call Volume</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ANALYTICS.hourly_volume}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Bar dataKey="calls" fill="#3457D5" radius={[2, 2, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sentiment Stacked Area */}
        <Card>
          <SectionTitle>Sentiment Distribution</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ANALYTICS.sentiment_trend}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Area type="monotone" dataKey="positive" name="Positive" stackId="1" stroke="#1C9A6C" fill="#1C9A6C" fillOpacity={0.3} />
                <Area type="monotone" dataKey="neutral" name="Neutral" stackId="1" stroke="#C9862B" fill="#C9862B" fillOpacity={0.3} />
                <Area type="monotone" dataKey="negative" name="Negative" stackId="1" stroke="#D14343" fill="#D14343" fillOpacity={0.3} />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Compliance vs Target */}
        <Card>
          <SectionTitle>Compliance vs Target (95%)</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ANALYTICS.queue_performance}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="queue" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="compliance" name="Compliance %" fill="#1C9A6C" radius={[2, 2, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Queue Performance */}
        <Card>
          <SectionTitle>Queue Performance</SectionTitle>
          <div className="space-y-2">
            {ANALYTICS.queue_performance.map((q) => (
              <div key={q.queue} onClick={() => navigate(`/calls?queue=${encodeURIComponent(q.queue)}`)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F7F4EE] cursor-pointer transition">
                <span className="text-xs font-medium text-[#1D2433] w-32 truncate">{q.queue}</span>
                <div className="flex-1 h-2 bg-[#F0EDE4] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#3457D5]" style={{ width: `${q.score}%` }} />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{q.score}%</span>
                <span className="text-[10px] text-[#6B7385] w-16 text-right">{q.calls} calls</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Parameter Horizontal Bars */}
        <Card>
          <SectionTitle>Parameter Scores</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ANALYTICS.parameter_scores} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#EFEAE0" />
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis type="category" dataKey="param" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={14}>
                  {ANALYTICS.parameter_scores.map((entry, i) => (
                    <Cell key={i} fill={entry.score >= 80 ? '#1C9A6C' : entry.score >= 60 ? '#C9862B' : '#D14343'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Agent Comparison + Call Volume Pie */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <SectionTitle>Agent Comparison</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Priya', score: 88, compliance: 94, sentiment: 82 },
                { name: 'Divya', score: 84, compliance: 90, sentiment: 79 },
                { name: 'Meena', score: 79, compliance: 85, sentiment: 74 },
                { name: 'Suresh', score: 72, compliance: 78, sentiment: 67 },
                { name: 'Amit', score: 54, compliance: 58, sentiment: 45 },
                { name: 'Ravi', score: 48, compliance: 52, sentiment: 38 },
              ]}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Bar dataKey="score" name="Score" fill="#3457D5" radius={[2, 2, 0, 0]} barSize={16} />
                <Bar dataKey="compliance" name="Compliance" fill="#1C9A6C" radius={[2, 2, 0, 0]} barSize={16} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>Call Volume by Disposition</SectionTitle>
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[
                  { name: 'Resolved', value: 520 },
                  { name: 'Escalated', value: 180 },
                  { name: 'Follow-up', value: 145 },
                  { name: 'Transferred', value: 98 },
                  { name: 'Dropped', value: 54 },
                ]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {[0,1,2,3,4].map((i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
