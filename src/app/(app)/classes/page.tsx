'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import ChildFormModal from '@/components/ChildFormModal'
import type { Child, ClassRow, AttendanceRow, AttendanceStatus } from '@/lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function ClassesPage() {
  const { hasPermission } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [activeClass, setActiveClass] = useState<string>('')
  const [date, setDate] = useState(todayStr())
  const [children, setChildren] = useState<Child[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceRow>>({})
  const [attendancePoints, setAttendancePoints] = useState<Record<string, number>>({ present: 10, late: 5, absent: 0 })
  const [selected, setSelected] = useState<Child | null>(null)
  const [editChild, setEditChild] = useState<Child | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    supabase.from('classes').select('*').order('sort_order').then(({ data }) => {
      const list = (data as ClassRow[]) || []
      setClasses(list)
      if (list.length && !activeClass) setActiveClass(list[0].id)
    })
    supabase.from('app_settings').select('value').eq('key', 'attendance_points').single()
      .then(({ data }) => { if (data?.value) setAttendancePoints(data.value) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    if (!activeClass) return
    setLoading(true)
    const supabase = getSupabase()
    const [{ data: kids }, { data: att }] = await Promise.all([
      supabase.from('children').select('*, classes(*)').eq('class_id', activeClass).eq('is_active', true).order('name'),
      supabase.from('attendance').select('*').eq('date', date),
    ])
    setChildren((kids as Child[]) || [])
    const map: Record<string, AttendanceRow> = {}
    ;(att as AttendanceRow[] | null)?.forEach(a => { map[a.child_id] = a })
    setAttendance(map)
    setLoading(false)
  }, [activeClass, date])

  useEffect(() => { load() }, [load])

  const setStatus = async (child: Child, status: AttendanceStatus) => {
    if (!hasPermission('attendance.record')) return
    const supabase = getSupabase()
    const { data: u } = await supabase.auth.getUser()
    const existing = attendance[child.id]

    if (existing && existing.status === status) {
      // toggle off -> remove attendance + its points
      await supabase.from('attendance').delete().eq('id', existing.id)
      await removeAttendancePoints(child.id)
      load()
      return
    }

    const { error } = await supabase.from('attendance').upsert(
      { child_id: child.id, date, status, recorded_by: u.user?.id },
      { onConflict: 'child_id,date' }
    )
    if (!error) {
      await removeAttendancePoints(child.id)
      const pts = attendancePoints[status] ?? 0
      if (pts > 0) {
        await supabase.from('point_transactions').insert({
          child_id: child.id, points: pts, reason: `حضور ${date}`,
          category: 'attendance', date, created_by: u.user?.id,
        })
      }
      load()
    }
  }

  const removeAttendancePoints = async (childId: string) => {
    const supabase = getSupabase()
    const { data } = await supabase.from('point_transactions')
      .select('id').eq('child_id', childId).eq('date', date).eq('category', 'attendance')
    if (data?.length) {
      await supabase.from('point_transactions').delete().in('id', data.map(d => d.id))
    }
  }

  const presentCount = Object.values(attendance).filter(a =>
    children.some(c => c.id === a.child_id) && a.status !== 'absent').length

  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold text-gray-800 mb-3">🏫 الفصول</h1>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          {classes.map(c => (
            <button key={c.id} onClick={() => setActiveClass(c.id)}
              className={`shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition ${activeClass === c.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'bg-white text-gray-500 border border-gray-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <input id="class-date" type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-200 bg-white rounded-xl px-3 py-2 font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500" />
          {date !== todayStr() && (
            <button onClick={() => setDate(todayStr())} className="text-sm font-bold text-violet-600">← اليوم</button>
          )}
          <span className="text-sm font-bold text-gray-400 mr-auto">حضور: {presentCount}/{children.length}</span>
        </div>
      </header>

      {loading ? (
        <p className="text-center text-gray-400 py-10 font-bold">جاري التحميل...</p>
      ) : children.length === 0 ? (
        <p className="text-center text-gray-400 py-14 font-bold">لا يوجد أطفال في هذا الفصل</p>
      ) : (
        <ul className="space-y-2">
          {children.map(c => {
            const att = attendance[c.id]
            return (
              <li key={c.id} className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelected(c)} className="flex items-center gap-3 flex-1 min-w-0 text-right">
                    <div className="w-11 h-11 rounded-xl bg-violet-100 overflow-hidden flex items-center justify-center text-xl shrink-0">
                      {c.photo_url ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" /> : (c.gender === 'male' ? '👦' : '👧')}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs font-bold text-amber-600">⭐ {c.total_points}</p>
                    </div>
                  </button>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setStatus(c, 'present')}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition ${att?.status === 'present' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                      title="حاضر">✓</button>
                    <button onClick={() => setStatus(c, 'late')}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition ${att?.status === 'late' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                      title="متأخر">◐</button>
                    <button onClick={() => setStatus(c, 'absent')}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition ${att?.status === 'absent' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                      title="غائب">✗</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ChildActionsSheet
        child={selected} date={date} open={!!selected}
        onClose={() => setSelected(null)} onChanged={load}
        onEdit={(c) => setEditChild(c)}
      />
      <ChildFormModal
        open={!!editChild} onClose={() => setEditChild(null)}
        onSaved={load} child={editChild}
      />
    </div>
  )
}
