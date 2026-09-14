import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function Layout() {
  return (
    <div className="flex bg-[#F7F4EE] min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Topbar />
        <main className="p-6 max-w-[1500px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
