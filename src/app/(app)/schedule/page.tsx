'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import Modal from '@/components/Modal'
import type { Profile, DayTask, DayAssignment } from '@/lib/types'

// ===== الأيام: من الجمعة 2026/08/07 حتى الجمعة 2026/08/21 =====
const START = '2026-08-07'
const END = '2026-08-21'

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function buildDays(): { date: string; label: string; short: string }[] {
  const days: { date: string; label: string; short: string }[] = []
  const d = new Date(START + 'T00:00:00')
  const end = new Date(END + 'T00:00:00')
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10)
    const dayName = AR_DAYS[d.getDay()]
    const label = `${dayName} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`
    days.push({ date: iso, label, short: `${dayName} ${d.getDate()}/${d.getMonth() + 1}` })
    d.setDate(d.getDate() + 1)
  }
  return days
}
const DAYS = buildDays()

function todayOrFirst(): string {
  const t = new Date()
  const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  return iso >= START && iso <= END ? iso : START
}

// ألوان متدرجة للكروت (تتكرر بالتناوب)
const CARD_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-violet-600',
  'from-cyan-500 to-sky-600',
]

export default function SchedulePage() {
  const { user, isAdmin } = useAuth()
  const [date, setDate] = useState<string>(todayOrFirst())
  const [tasks, setTasks] = useState<DayTask[]>([])
  const [assignments, setAssignments] = useState<DayAssignment[]>([])
  const [servants, setServants] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // modal: إضافة خادم لوظيفة
  const [addTask, setAddTask] = useState<DayTask | null>(null)
  const [pickUserId, setPickUserId] = useState('')
  const [busy, setBusy] = useState(false)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [{ data: t }, { data: a }, { data: s }] = await Promise.all([
      supabase.from('day_tasks').select('*').order('sort_order'),
      supabase.from('day_assignments')
        .select('*, profiles!day_assignments_user_id_fkey(id, full_name, phone, avatar_url)')
        .eq('date', date),
      supabase.from('profiles').select('*').eq('status', 'approved').order('full_name'),
    ])
    setTasks((t as DayTask[]) || [])
    setAssignments((a as DayAssignment[]) || [])
    setServants((s as Profile[]) || [])
    setLoading(false)
  }, [date])

  useEffect(() => { setLoading(true); load() }, [load])
  useRealtime(['day_tasks', 'day_assignments'], load)

  const byTask = useMemo(() => {
    const m = new Map<string, DayAssignment[]>()
    assignments.forEach((a) => {
      const arr = m.get(a.task_id) || []
      arr.push(a)
      m.set(a.task_id, arr)
    })
    return m
  }, [assignments])

  const openAdd = (task: DayTask) => { setAddTask(task); setPickUserId('') }

  const addAssignment = async () => {
    if (!addTask || !pickUserId) return
    setBusy(true)
    const { error } = await getSupabase().from('day_assignments').insert({
      date, task_id: addTask.id, user_id: pickUserId, created_by: user?.id,
    })
    setBusy(false)
    if (error) flash(error.code === '23505' ? '⚠️ الخادم مضاف بالفعل لهذه الوظيفة' : '❌ حدث خطأ — تأكد من الصلاحية')
    else { flash('✅ تمت الإضافة'); setAddTask(null); load() }
  }

  const removeAssignment = async (a: DayAssignment) => {
    if (!confirm(`إزالة ${a.profiles?.full_name || 'الخادم'} من هذه الوظيفة؟`)) return
    const { error } = await getSupabase().from('day_assignments').delete().eq('id', a.id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تمت الإزالة'); load() }
  }

  const selectedDay = DAYS.find((d) => d.date === date)
  const totalAssigned = assignments.length

  return (
    <div className="animate-fadeIn px-4 pt-4 pb-6 space-y-4">
      {msg && <p className="card p-3 text-center text-sm font-bold text-violet-700 animate-pop">{msg}</p>}

      {/* ===== رأس الصفحة + اختيار اليوم ===== */}
      <section className="hero-gradient rounded-3xl p-5 text-white shadow-xl shadow-violet-600/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold">🗓️ تنظيم اليوم</h1>
            <p className="text-white/70 text-[11px] font-semibold mt-0.5">
              من الجمعة 7 أغسطس حتى الجمعة 21 أغسطس 2026
            </p>
          </div>
          <div className="text-center bg-white/15 rounded-2xl px-3 py-2 backdrop-blur">
            <p className="text-2xl font-extrabold leading-none">{totalAssigned}</p>
            <p className="text-[10px] font-bold text-white/80 mt-1">تكليف</p>
          </div>
        </div>

        {/* اختيار اليوم */}
        <div className="mt-4">
          <label className="text-[11px] font-bold text-white/80 block mb-1.5">📅 اختر اليوم</label>
          <select
            className="w-full rounded-2xl bg-white text-gray-800 font-extrabold text-sm px-4 py-3 outline-none border-0"
            value={date}
            onChange={(e) => setDate(e.target.value)}>
            {DAYS.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label} {d.date === todayOrFirst() && d.date !== START ? '· اليوم' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* شريط أيام سريع */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {DAYS.map((d) => (
            <button key={d.date} onClick={() => setDate(d.date)}
              className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold transition-all ${
                d.date === date ? 'bg-white text-violet-700 shadow-md scale-105' : 'bg-white/15 text-white/85'
              }`}>
              {d.short}
            </button>
          ))}
        </div>
      </section>

      {/* ===== كروت الوظائف ===== */}
      {loading ? (
        <p className="text-center text-violet-500 font-extrabold py-10 animate-pulse">جاري التحميل...</p>
      ) : tasks.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <p className="text-4xl">🗂️</p>
          <p className="font-extrabold text-gray-700">لا توجد وظائف بعد</p>
          <p className="text-xs text-gray-400 font-semibold">
            {isAdmin ? 'أضِف الوظائف من الإعدادات ← تبويب «الوظائف»' : 'المدير العام سيضيف الوظائف قريباً'}
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <p className="text-xs font-extrabold text-gray-400 px-1">وظائف {selectedDay?.label}</p>
          {tasks.map((task, i) => {
            const list = byTask.get(task.id) || []
            const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
            return (
              <div key={task.id} className="card overflow-hidden">
                {/* رأس الكارت */}
                <div className={`bg-gradient-to-l ${grad} px-4 py-3 flex items-center justify-between gap-2`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl leading-none drop-shadow">{task.icon}</span>
                    <div className="min-w-0">
                      <p className="text-white font-extrabold text-sm truncate">{task.name}</p>
                      {task.description && (
                        <p className="text-white/75 text-[10px] font-semibold truncate">{task.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 bg-white/20 text-white text-[10px] font-extrabold rounded-full px-2.5 py-1 backdrop-blur">
                    {list.length === 0 ? 'بدون خدام' : `${list.length} ${list.length === 1 ? 'خادم' : 'خدام'}`}
                  </span>
                </div>

                {/* الخدام المكلّفون */}
                <div className="p-3 space-y-2">
                  {list.length === 0 && (
                    <p className="text-center text-[11px] text-gray-300 font-bold py-2">
                      لم يُكلَّف أحد بهذه الوظيفة بعد
                    </p>
                  )}
                  {list.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-3 py-2.5">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-extrabold text-sm shrink-0`}>
                        {(a.profiles?.full_name || '؟').trim().charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-sm text-gray-800 truncate">{a.profiles?.full_name || 'خادم'}</p>
                        {a.profiles?.phone && (
                          <p className="text-[10px] text-gray-400 font-semibold" dir="ltr">{a.profiles.phone}</p>
                        )}
                      </div>
                      {a.profiles?.phone ? (
                        <a href={`tel:${a.profiles.phone}`}
                          className="shrink-0 rounded-xl bg-emerald-500 text-white text-xs font-extrabold px-3 py-2 active:scale-95 transition shadow-md shadow-emerald-500/25">
                          📞 اتصال
                        </a>
                      ) : (
                        <span className="shrink-0 text-[10px] text-gray-300 font-bold">بدون رقم</span>
                      )}
                      {isAdmin && (
                        <button onClick={() => removeAssignment(a)}
                          className="shrink-0 rounded-xl bg-red-50 text-red-500 text-xs font-extrabold px-2.5 py-2 active:scale-95 transition">
                          ✖️
                        </button>
                      )}
                    </div>
                  ))}

                  {isAdmin && (
                    <button onClick={() => openAdd(task)}
                      className="w-full rounded-2xl border-2 border-dashed border-violet-200 text-violet-600 text-xs font-extrabold py-2.5 active:scale-95 transition bg-violet-50/50">
                      ➕ إضافة خادم
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ===== مودال إضافة خادم ===== */}
      <Modal open={!!addTask} onClose={() => setAddTask(null)}
        title={`${addTask?.icon || ''} إضافة خادم — ${addTask?.name || ''}`}>
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-gray-400">اليوم: {selectedDay?.label}</p>
          <select className="input w-full" value={pickUserId} onChange={(e) => setPickUserId(e.target.value)}>
            <option value="">— اختر الخادم —</option>
            {servants
              .filter((s) => !(byTask.get(addTask?.id || '') || []).some((a) => a.user_id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
          </select>
          <button onClick={addAssignment} disabled={!pickUserId || busy}
            className="btn-primary w-full disabled:opacity-50">
            {busy ? 'جاري الإضافة...' : '✅ تكليف الخادم'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
