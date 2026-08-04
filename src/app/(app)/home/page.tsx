'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import type { Child } from '@/lib/types'

export default function HomePage() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState({ children: 0, presentToday: 0, pointsToday: 0, pendingUsers: 0 })
  const [top, setTop] = useState<Child[]>([])
  const [newest, setNewest] = useState<Child[]>([])

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const today = new Date().toISOString().slice(0, 10)

    const [cRes, aRes, pRes, topRes, newRes] = await Promise.all([
      supabase.from('children').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('date', today),
      supabase.from('point_transactions').select('points').eq('date', today),
      supabase.from('children').select('*, classes(*)').eq('is_active', true).order('total_points', { ascending: false }).limit(3),
      supabase.from('children').select('*, classes(*)').eq('is_active', true).order('created_at', { ascending: false }).limit(5),
    ])

    let pendingUsers = 0
    if (isAdmin) {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      pendingUsers = count || 0
    }

    setStats({
      children: cRes.count || 0,
      presentToday: aRes.count || 0,
      pointsToday: (pRes.data || []).reduce((s: number, r: any) => s + (r.points > 0 ? r.points : 0), 0),
      pendingUsers,
    })
    setTop((topRes.data as Child[]) || [])
    setNewest((newRes.data as Child[]) || [])
  }, [isAdmin])

  useEffect(() => { load() }, [load])
  useRealtime(['children', 'attendance', 'point_transactions', 'profiles'], load)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="animate-fadeIn">
      {/* greeting */}
      <div className="px-5 pt-4">
        <p className="text-gray-400 text-sm font-bold">أهلاً بك 👋</p>
        <h2 className="text-2xl font-extrabold text-violet-700 mt-0.5">{profile?.full_name || '...'}</h2>
      </div>

      {/* stat cards */}
      <section id="home-stats" className="px-4 mt-3 grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <div className="text-3xl">👼</div>
          <div className="text-2xl font-extrabold text-violet-700">{stats.children}</div>
          <div className="text-xs text-gray-500 font-bold">إجمالي الأطفال</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl">✅</div>
          <div className="text-2xl font-extrabold text-emerald-600">{stats.presentToday}</div>
          <div className="text-xs text-gray-500 font-bold">حضور اليوم</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl">⭐</div>
          <div className="text-2xl font-extrabold text-amber-500">{stats.pointsToday}</div>
          <div className="text-xs text-gray-500 font-bold">نقاط اليوم</div>
        </div>
        {isAdmin ? (
          <Link href="/settings" className="card p-4 text-center block">
            <div className="text-3xl">⏳</div>
            <div className="text-2xl font-extrabold text-rose-500">{stats.pendingUsers}</div>
            <div className="text-xs text-gray-500 font-bold">حسابات بانتظار الموافقة</div>
          </Link>
        ) : (
          <div className="card p-4 text-center">
            <div className="text-3xl">😇</div>
            <div className="text-2xl font-extrabold text-fuchsia-600">💜</div>
            <div className="text-xs text-gray-500 font-bold">خدمة مباركة</div>
          </div>
        )}
      </section>

      {/* quick actions */}
      <section id="home-actions" className="px-4 mt-5">
        <h2 className="font-extrabold text-gray-800 mb-2">إجراءات سريعة</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link href="/scanner" className="card p-3 text-center">
            <div className="text-2xl">📷</div>
            <div className="text-xs font-bold text-gray-600 mt-1">الماسح</div>
          </Link>
          <Link href="/children" className="card p-3 text-center">
            <div className="text-2xl">👼</div>
            <div className="text-xs font-bold text-gray-600 mt-1">الأطفال</div>
          </Link>
          <Link href="/statistics" className="card p-3 text-center">
            <div className="text-2xl">📊</div>
            <div className="text-xs font-bold text-gray-600 mt-1">الإحصائيات</div>
          </Link>
        </div>
      </section>

      {/* top 3 */}
      <section id="home-top" className="px-4 mt-5">
        <h2 className="font-extrabold text-gray-800 mb-2">🏆 أعلى النقاط</h2>
        <div className="card divide-y divide-gray-50">
          {top.length === 0 && <p className="p-4 text-sm text-gray-400 font-semibold text-center">لا يوجد أطفال بعد</p>}
          {top.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <span className="text-2xl">{medals[i]}</span>
              {c.photo_url
                ? <img src={c.photo_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                : <span className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-lg">{c.gender === 'female' ? '👧' : '👦'}</span>}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 font-semibold">{c.classes?.name || 'بدون فصل'}</p>
              </div>
              <span className="text-amber-500 font-extrabold text-sm">⭐ {c.total_points}</span>
            </div>
          ))}
        </div>
      </section>

      {/* newest */}
      <section id="home-newest" className="px-4 mt-5 mb-4">
        <h2 className="font-extrabold text-gray-800 mb-2">🆕 أحدث الأطفال</h2>
        <div className="card divide-y divide-gray-50">
          {newest.length === 0 && <p className="p-4 text-sm text-gray-400 font-semibold text-center">لا يوجد أطفال بعد</p>}
          {newest.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              {c.photo_url
                ? <img src={c.photo_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                : <span className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-lg">{c.gender === 'female' ? '👧' : '👦'}</span>}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 font-semibold">{c.classes?.name || 'بدون فصل'} · {c.code}</p>
              </div>
              <span className="text-amber-500 font-extrabold text-sm">⭐ {c.total_points}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
