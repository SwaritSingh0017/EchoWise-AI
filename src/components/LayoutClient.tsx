'use client'

import { useState, useEffect } from "react"
import Header from "@/components/Header"
import Sidebar from "@/components/Sidebar"
import { Toaster } from 'react-hot-toast'
import { getAvailableRewards, getUserByEmail } from '@/utils/db/actions'
import ChatBot from '@/components/ChatBot'

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [totalEarnings, setTotalEarnings] = useState(0)

  useEffect(() => {
    const fetchTotalEarnings = async () => {
      try {
        const userEmail = localStorage.getItem('userEmail')
        if (userEmail) {
          const user = await getUserByEmail(userEmail)
          if (user) {
            const availableRewards = await getAvailableRewards(user.id) as any
            setTotalEarnings(availableRewards)
          }
        }
      } catch (error) {
        console.error('Error fetching total earnings:', error)
      }
    }

    fetchTotalEarnings()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} totalEarnings={totalEarnings} />
      <div className="flex flex-1">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 p-4 lg:p-8 ml-0 lg:ml-64 transition-all duration-300">
          {children}
        </main>
      </div>
      <Toaster />
      <ChatBot />
    </div>
  )
}
