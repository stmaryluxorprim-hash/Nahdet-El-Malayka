'use client'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import type { ClassRow } from '@/lib/types'

const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function StatisticsPage() {
  const [totals, setTotals] = useState({ children: 0, todayPresent: 0, weekPoints: 0, users: 0 })
  const [classStats, setClassStats] = useState<{ name: string; count: number; present: number }[]>([])
  const [trend, setTrend] = useState<{ day: string; حضور: number }[]>([])
  const [top, setTop] = useState<{ name: string; total_points: number; photo_url: string | null; gender: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabase()
      const today = daysAgo(0)
      const weekStart = daysAgo(6)

      const [kids, att, classes, attWeek, points, users, topKids] = await Promise.all([
        supabase.from('children').select('id, class_id', { count: 'exact' }).eq('is_active', true),
        supabase.from('attendance').select('child_id, status').eq('date', today),
        supabase.from('classes').select('*').order('sort_order'),
        supabase.from('attendance').select('date, status').gte('date', weekStart),
        supabase.from('point_transactions').select('points').gte('date', weekStart),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('children').select('name, total_points, photo_url, gender').eq('is_active', true).order('total_points', { ascending: false }).limit(10),
      ])

      const kidRows = kids.data || []
      const attRows = (att.data || []).filter(a => a.status !== 'absent')
      setTotals({
        children: kids.count || 0,
        todayPresent: attRows.length,
        weekPoints: (points.data || []).reduce((s, p) => s + (p.points > 0 ? p.points : 0), 0),
        users: users.count || 0,
      })

      const presentIds = new Set(attRows.map(a => a.child_id))
      setClassStats(((classes.data as ClassRow[]) || []).map(c => ({
        name: c.name,
        count: kidRows.filter(k => k.class_id === c.id).length,
        present: kidRows.filter(k => k.class_id === c.id && presentIds.has(k.id)).length,
      })))

      const days: { day: string; حضور: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = daysAgo(i)
        const label = new Date(d).toLocaleDateString('ar-EG', { weekday: 'short' })
        days.push({ day: label, حضور: (attWeek.data || []).filter(a => a.date === d && a.status !== 'absent').length })
      }
      setTrend(days)
      setTop(topKids.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-center text-gray-400 py-16 font-bold">جاري التحميل...</p>

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-2xl font-extrabold text-gray-800">📊 الإحصائيات</h1>

      <section className="grid grid-cols-2 gap-3">
        {[
          { label: 'إجمالي الأطفال', value: totals.children, icon: '👼', bg: 'bg-violet-50 text-violet-700' },
          { label: 'حضور اليوم', value: totals.todayPresent, icon: '✅', bg: 'bg-green-50 text-green-700' },
          { label: 'نقاط هذا الأسبوع', value: totals.weekPoints, icon: '⭐', bg: 'bg-amber-50 text-amber-700' },
          { label: 'الخدام المعتمدون', value: totals.users, icon: '🙋', bg: 'bg-blue-50 text-blue-700' },
        ].map(card => (
          <div key={card.label} className={`rounded-2xl p-4 ${card.bg}`}>
            <p className="text-2xl">{card.icon}</p>
            <p className="text-3xl font-extrabold mt-1">{card.value}</p>
            <p className="text-xs font-bold opacity-70">{card.label}</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-3">حضور آخر 7 أيام</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="حضور" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-3">حضور اليوم حسب الفصل</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={classStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
            <Tooltip />
            <Bar dataKey="count" name="الإجمالي" fill="#ddd6fe" radius={[6, 6, 0, 0]} />
            <Bar dataKey="present" name="الحضور" fill="#7c3aed" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-3">🏆 أعلى 10 أطفال بالنقاط</h2>
        <ul className="space-y-2">
          {top.map((c, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
              <div className="w-9 h-9 rounded-lg bg-violet-100 overflow-hidden flex items-center justify-center text-lg shrink-0">
                {c.photo_url ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" /> : (c.gender === 'male' ? '👦' : '👧')}
              </div>
              <span className="font-bold text-gray-700 flex-1 truncate">{c.name}</span>
              <span className="font-extrabold text-amber-600">⭐ {c.total_points}</span>
            </li>
          ))}
          {top.length === 0 && <p className="text-gray-400 text-sm text-center py-4">لا توجد بيانات بعد</p>}
        </ul>
      </section>
    </div>
  )
}
