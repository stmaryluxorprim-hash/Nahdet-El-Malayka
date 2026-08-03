'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

const NAV = [
  { href: '/children', label: 'الأطفال', icon: '👼' },
  { href: '/classes', label: 'الفصول', icon: '🏫' },
  { href: '/scanner', label: 'المسح', icon: '📷' },
  { href: '/statistics', label: 'الإحصائيات', icon: '📊' },
  { href: '/settings', label: 'الإعدادات', icon: '⚙️' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (profile && profile.status !== 'approved') router.replace('/pending')
  }, [user, profile, loading, router])

  if (loading || !user || profile?.status !== 'approved') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-violet-600 text-lg font-bold animate-pulse">جاري التحميل...</div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="max-w-2xl mx-auto">{children}</main>
      <nav id="bottom-nav" className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-2xl mx-auto flex justify-around">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center py-2 px-3 text-xs font-semibold transition ${active ? 'text-violet-600' : 'text-gray-400'}`}>
                <span className="text-xl mb-0.5">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
