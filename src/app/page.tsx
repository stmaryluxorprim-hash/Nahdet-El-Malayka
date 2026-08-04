'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (profile?.status !== 'approved') router.replace('/pending')
    else router.replace('/home')
  }, [user, profile, loading, router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-800">
      <div className="text-white text-xl font-bold animate-pulse">نهضة الملائكة ...</div>
    </main>
  )
}
