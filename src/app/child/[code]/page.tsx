'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'

interface Portal {
  name: string
  code: string
  gender: 'male' | 'female'
  photo_url: string | null
  birthday: string | null
  total_points: number
  class_name: string | null
  rank: number
  attendance_count: number
  attendance: { date: string; status: string }[]
  points: { points: number; reason: string | null; category: string; date: string; created_at: string }[]
}

export default function ChildPortalPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = decodeURIComponent(params.code || '').toUpperCase()
  const [data, setData] = useState<Portal | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'points' | 'attendance'>('points')

  const load = useCallback(async () => {
    if (!code) return
    const { data: d, error } = await getSupabase().rpc('get_child_portal', { p_code: code })
    if (error || !d) { setNotFound(true); return }
    setData(d as Portal)
    try { sessionStorage.setItem(`child-portal-${code}`, JSON.stringify(d)) } catch {}
  }, [code])

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`child-portal-${code}`)
      if (cached) setData(JSON.parse(cached))
    } catch {}
    load()
  }, [code, load])

  useRealtime(['children', 'attendance', 'point_transactions'], load)

  if (notFound) {
    return (
      <main className="min-h-screen auth-bg flex flex-col items-center justify-center p-6 text-center">
        <p className="text-6xl mb-3">🙈</p>
        <p className="font-extrabold text-gray-700 mb-4">لم يتم العثور على هذا الكارت</p>
        <button onClick={() => router.replace('/login')} className="btn-primary px-8">العودة لتسجيل الدخول</button>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-screen auth-bg flex items-center justify-center">
        <p className="text-violet-600 font-extrabold animate-pulse">جاري التحميل...</p>
      </main>
    )
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <main className="min-h-screen bg-[#f4f4fb] pb-8 animate-fadeIn">
      {/* hero */}
      <header id="portal-hero" className="hero-gradient text-white px-5 pt-10 pb-16 rounded-b-[2.5rem] text-center relative">
        <button onClick={() => { try { sessionStorage.removeItem(`child-portal-${code}`) } catch {}; router.replace('/login') }}
          className="absolute top-4 left-4 bg-white/20 backdrop-blur rounded-xl px-3 py-1.5 text-xs font-bold">
          🚪 خروج
        </button>
        <div className="w-24 h-24 mx-auto rounded-full bg-white/20 backdrop-blur overflow-hidden flex items-center justify-center text-5xl border-4 border-white/40 shadow-xl">
          {data.photo_url
            ? <img src={data.photo_url} alt={data.name} className="w-full h-full object-cover" />
            : (data.gender === 'female' ? '👧' : '👦')}
        </div>
        <h1 className="text-2xl font-extrabold mt-3">{data.name}</h1>
        <p className="text-white/75 text-sm font-bold mt-1">
          {data.class_name || 'بدون فصل'} · <span dir="ltr">{data.code}</span>
        </p>
        <p className="text-white/60 text-[11px] font-semibold mt-1">⚡ يتحدث لحظياً مع كل نقطة وحضور جديد</p>
      </header>

      {/* stats */}
      <section id="portal-stats" className="px-4 -mt-10 grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <div className="text-2xl">⭐</div>
          <div className="text-xl font-extrabold text-amber-500">{data.total_points}</div>
          <div className="text-[10px] text-gray-500 font-bold">النقاط</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl">🏆</div>
          <div className="text-xl font-extrabold text-violet-600">#{data.rank}</div>
          <div className="text-[10px] text-gray-500 font-bold">الترتيب</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl">✅</div>
          <div className="text-xl font-extrabold text-emerald-600">{data.attendance_count}</div>
          <div className="text-[10px] text-gray-500 font-bold">مرات الحضور</div>
        </div>
      </section>

      {/* tabs */}
      <section className="px-4 mt-5">
        <div className="grid grid-cols-2 gap-1.5 bg-violet-50 rounded-2xl p-1.5 mb-3">
          <button onClick={() => setTab('points')}
            className={`rounded-xl py-2.5 text-sm font-bold transition-all ${tab === 'points' ? 'bg-white text-violet-700 shadow' : 'text-gray-500'}`}>
            ⭐ سجل النقاط
          </button>
          <button onClick={() => setTab('attendance')}
            className={`rounded-xl py-2.5 text-sm font-bold transition-all ${tab === 'attendance' ? 'bg-white text-violet-700 shadow' : 'text-gray-500'}`}>
            ✅ سجل الحضور
          </button>
        </div>

        {tab === 'points' ? (
          <div id="portal-points" className="card divide-y divide-gray-50">
            {data.points.length === 0 && <p className="p-5 text-center text-sm text-gray-400 font-semibold">لا توجد نقاط بعد</p>}
            {data.points.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-700 truncate">{p.reason || (p.category === 'attendance' ? 'حضور' : 'نقاط')}</p>
                  <p className="text-[11px] text-gray-400 font-semibold">{fmtDate(p.date)}</p>
                </div>
                <span className={`font-extrabold text-sm shrink-0 ${p.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`} dir="ltr">
                  {p.points >= 0 ? `+${p.points}` : p.points}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div id="portal-attendance" className="card divide-y divide-gray-50">
            {data.attendance.length === 0 && <p className="p-5 text-center text-sm text-gray-400 font-semibold">لا يوجد حضور بعد</p>}
            {data.attendance.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <p className="font-bold text-sm text-gray-700">{fmtDate(a.date)}</p>
                <span className="text-xs font-extrabold text-emerald-600">✅ حاضر</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
