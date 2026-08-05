'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { UiProvider } from '@/contexts/UiContext'
import AppHeader from '@/components/AppHeader'
import Icon, { IconName } from '@/components/Icon'

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/home', label: 'الرئيسية', icon: 'home' },
  { href: '/children', label: 'الأطفال', icon: 'children' },
  { href: '/scanner', label: 'الماسح', icon: 'scanner' },
  { href: '/statistics', label: 'الإحصائيات', icon: 'stats' },
  { href: '/settings', label: 'الإعدادات', icon: 'settings' },
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
      <main className="min-h-screen flex items-center justify-center auth-bg">
        <div className="text-violet-600 text-lg font-extrabold animate-pulse">جاري التحميل...</div>
      </main>
    )
  }

  return (
    <UiProvider>
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="max-w-2xl mx-auto">{children}</main>
        <nav id="bottom-nav" className="fixed bottom-0 inset-x-0 z-40 glass border-t border-white/40 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto px-2 py-1.5 flex justify-around">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[10px] font-bold transition-all ${
                    active ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30 scale-105' : 'text-gray-400'
                  }`}>
                  <Icon name={item.icon} size={22} strokeWidth={active ? 2.1 : 1.8} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </UiProvider>
  )
}
