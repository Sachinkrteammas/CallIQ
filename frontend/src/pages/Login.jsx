import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AudioWaveform, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../components/AuthContext.jsx'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#16213E] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#3457D5] flex items-center justify-center">
              <AudioWaveform size={24} className="text-white" />
            </div>
            <div className="text-left">
              <div className="text-xl font-bold text-white tracking-tight">CallIQ</div>
              <div className="text-xs text-white/40">Call Quality Intelligence</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-lg font-bold text-[#1D2433] mb-1">Sign in to your account</h2>
          <p className="text-sm text-[#6B7385] mb-6">Enter your credentials to continue</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1D2433] mb-1.5">Email</label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] text-[#1D2433] placeholder-[#6B7385] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 focus:border-[#3457D5] transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1D2433] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] text-[#1D2433] placeholder-[#6B7385] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 focus:border-[#3457D5] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7385] hover:text-[#1D2433] transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#3457D5] text-white text-sm font-semibold hover:bg-[#2A45B0] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#E7E2D8]">
            <p className="text-xs text-[#6B7385] text-center">
              Default admin: <span className="font-semibold text-[#1D2433]">admin@callaudit.local</span>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          CallIQ v2.0 — Powered by AI Quality Intelligence
        </p>
      </div>
    </div>
  )
}
