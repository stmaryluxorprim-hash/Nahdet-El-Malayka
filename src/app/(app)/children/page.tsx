'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import QrScanner from '@/components/QrScanner'
import Modal from '@/components/Modal'
import ChildFormModal from '@/components/ChildFormModal'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import type { Child, ClassRow } from '@/lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

type Func = 'none' | 'attendance' | 'addPoints' | 'subPoints' | 'call' | 'whatsapp'

export default function ChildrenPage() {
  const { hasPermission, user } = useAuth()
  const [children, setChildren] = useState<Child[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set())
  const [classId, setClassId] = useState<string>('all')
  const [date, setDate] = useState(todayStr())
  const [func, setFunc] = useState<Func>('none')
  const [points, setPoints] = useState('5')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editChild, setEditChild] = useState<Child | null>(null)
  const [selected, setSelected] = useState<Child | null>(null)
  const [scanErr, setScanErr] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [cRes, clRes, aRes] = await Promise.all([
      supabase.from('children').select('*, classes(*)').eq('is_active', true).order('name'),
      supabase.from('classes').select('*').order('sort_order'),
      supabase.from('attendance').select('child_id').eq('date', date),
    ])
    setChildren((cRes.data as Child[]) || [])
    setClasses((clRes.data as ClassRow[]) || [])
    setPresentIds(new Set((aRes.data || []).map((r: any) => r.child_id)))
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])
  useRealtime(['children', 'attendance', 'point_transactions', 'classes'], load)

  const showFlash = (id: string, text: string) => {
    setFlash({ id, text })
    setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 1500)
  }

  const runFunc = async (c: Child) => {
    const supabase = getSupabase()
    const pts = Math.abs(parseInt(points) || 0)

    if (func === 'call') { window.location.href = `tel:${c.phone}`; return }
    if (func === 'whatsapp') { window.open(`https://wa.me/${c.phone.replace('+', '')}`, '_blank'); return }

    if (func === 'attendance') {
      if (presentIds.has(c.id)) {
        await supabase.from('attendance').delete().eq('child_id', c.id).eq('date', date)
        await supabase.from('point_transactions').delete()
          .eq('child_id', c.id).eq('date', date).eq('category', 'attendance')
        showFlash(c.id, '↩️ أُلغي الحضور')
      } else {
        const { error } = await supabase.from('attendance').insert({
          child_id: c.id, date, status: 'present', recorded_by: user?.id,
        })
        if (error) { showFlash(c.id, '⚠️ خطأ'); return }
        if (pts > 0) {
          await supabase.from('point_transactions').insert({
            child_id: c.id, points: pts, reason: 'حضور', category: 'attendance', date, created_by: user?.id,
          })
        }
        showFlash(c.id, `✅ حضر ${pts > 0 ? `+${pts}` : ''}`)
      }
      load()
      return
    }

    if (func === 'addPoints' || func === 'subPoints') {
      if (!pts) { showFlash(c.id, '⚠️ أدخل النقاط'); return }
      const value = func === 'addPoints' ? pts : -pts
      const { error } = await supabase.from('point_transactions').insert({
        child_id: c.id, points: value, reason: func === 'addPoints' ? 'نقاط' : 'خصم', category: 'general', date, created_by: user?.id,
      })
      if (error) { showFlash(c.id, '⚠️ خطأ'); return }
      showFlash(c.id, value > 0 ? `⭐ +${pts}` : `➖ -${pts}`)
      load()
    }
  }

  const handleScan = async (code: string) => {
    setScanErr('')
    const { data } = await getSupabase().from('children').select('id, name').eq('code', code).maybeSingle()
    if (data) { setScanErr(`⚠️ هذا الكود مسجل بالفعل للطفل: ${data.name}`); return }
    setScannedCode(code)
    setScanOpen(false)
    setEditChild(null)
    setFormOpen(true)
  }

  const FUNCS: { key: Func; label: string; icon: string; perm?: string }[] = [
    { key: 'none', label: 'بدون', icon: '👆' },
    { key: 'attendance', label: 'حضور', icon: '✅', perm: 'attendance.record' },
    { key: 'addPoints', label: 'إضافة نقاط', icon: '➕', perm: 'points.add' },
    { key: 'subPoints', label: 'خصم نقاط', icon: '➖', perm: 'points.subtract' },
    { key: 'call', label: 'اتصال', icon: '📞' },
    { key: 'whatsapp', label: 'واتساب', icon: '💬' },
  ]
  const funcs = FUNCS.filter((f) => !f.perm || hasPermission(f.perm))

  const filtered = children.filter((c) =>
    (classId === 'all' || c.class_id === classId) &&
    (c.name.includes(search) || c.phone.includes(search) || c.code.includes(search)))

  const funcBtn = (c: Child) => {
    if (func === 'none') return null
    if (flash?.id === c.id) {
      return <span className="text-xs font-extrabold text-violet-600 animate-pop shrink-0">{flash.text}</span>
    }
    const present = presentIds.has(c.id)
    const map: Record<Exclude<Func, 'none'>, { text: string; cls: string }> = {
      attendance: present
        ? { text: '✅ حاضر', cls: 'bg-emerald-500 text-white' }
        : { text: 'تسجيل حضور', cls: 'bg-emerald-50 text-emerald-700' },
      addPoints: { text: `➕ ${points || 0}`, cls: 'bg-amber-50 text-amber-700' },
      subPoints: { text: `➖ ${points || 0}`, cls: 'bg-red-50 text-red-600' },
      call: { text: '📞', cls: 'bg-blue-50 text-blue-600' },
      whatsapp: { text: '💬', cls: 'bg-green-50 text-green-600' },
    }
    const cfg = map[func]
    return (
      <button onClick={(e) => { e.stopPropagation(); runFunc(c) }}
        className={`shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold active:scale-90 transition-all ${cfg.cls}`}>
        {cfg.text}
      </button>
    )
  }

  return (
    <div className="animate-fadeIn">
      <header className="hero-gradient text-white px-5 pt-8 pb-12 rounded-b-[2.5rem] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">👼 الأطفال</h1>
          <p className="text-white/70 text-xs font-semibold mt-1">{filtered.length} طفل · تحديث لحظي ⚡</p>
        </div>
        {hasPermission('children.create') && (
          <button id="add-child-btn" onClick={() => { setScanErr(''); setScanOpen(true) }}
            className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur text-white text-2xl font-bold active:scale-90 transition">+</button>
        )}
      </header>

      <div className="px-4 -mt-6 space-y-3">
        {/* class select + date */}
        <div className="card p-3 grid grid-cols-2 gap-2">
          <select id="class-select" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="all">كل الفصول</option>
            {classes.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
          </select>
          <input id="date-input" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* function selector */}
        <div className="card p-3">
          <p className="text-[11px] font-extrabold text-gray-400 mb-2">اختر الوظيفة — سيظهر زرها بجوار كل طفل</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {funcs.map((f) => (
              <button key={f.key} onClick={() => setFunc(f.key)}
                className={`chip ${func === f.key ? 'chip-on' : 'chip-off'}`}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
          {(func === 'attendance' || func === 'addPoints' || func === 'subPoints') && (
            <div className="flex items-center gap-2 mt-2 animate-fadeIn">
              <label htmlFor="func-points" className="text-xs font-bold text-gray-500 shrink-0">النقاط:</label>
              <input id="func-points" type="number" min="0" className="input !py-2 w-24 text-center" dir="ltr"
                value={points} onChange={(e) => setPoints(e.target.value)} />
              {func === 'attendance' && <span className="text-[11px] text-gray-400 font-semibold">تُضاف مع كل تسجيل حضور</span>}
            </div>
          )}
        </div>

        <input id="children-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف أو الكود..." className="input" />

        {loading ? (
          <p className="text-center text-gray-400 py-10 font-bold">جاري التحميل...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-5xl mb-3">👼</p>
            <p className="text-gray-400 font-bold">لا يوجد أطفال</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-4">
            {filtered.map((c) => (
              <li key={c.id}>
                <div onClick={() => setSelected(c)}
                  className="card p-3 flex items-center gap-3 cursor-pointer active:scale-[.99] transition">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-violet-100 overflow-hidden flex items-center justify-center text-2xl">
                      {c.photo_url ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" /> : (c.gender === 'male' ? '👦' : '👧')}
                    </div>
                    {presentIds.has(c.id) && (
                      <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" title="حاضر" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-400 font-semibold">{c.classes?.name || 'بدون فصل'} · ⭐ {c.total_points}</p>
                  </div>
                  {funcBtn(c)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* QR scan modal for new child */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="امسح كود QR للطفل الجديد">
        <p className="text-sm text-gray-500 mb-3 text-center">وجّه الكاميرا نحو كود QR الخاص بالطفل</p>
        {scanOpen && <QrScanner onScan={handleScan} />}
        {scanErr && <p className="text-amber-700 bg-amber-50 rounded-lg p-3 mt-3 text-sm font-bold text-center">{scanErr}</p>}
      </Modal>

      <ChildFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditChild(null) }}
        onSaved={load}
        code={scannedCode || undefined}
        child={editChild}
      />

      <ChildActionsSheet
        child={selected} date={date} open={!!selected}
        onClose={() => setSelected(null)} onChanged={load}
        onEdit={(c) => { setEditChild(c); setFormOpen(true) }}
      />
    </div>
  )
}
