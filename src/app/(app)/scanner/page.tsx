'use client'
import { useState, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import QrScanner from '@/components/QrScanner'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import type { Child } from '@/lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

type Mode = 'attendance' | 'addPoints' | 'subPoints' | 'view'

interface HistoryItem { name: string; text: string; ok: boolean; time: string }

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 880 : 220
    gain.gain.value = 0.15
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
  } catch {}
}

export default function ScannerPage() {
  const { hasPermission, user } = useAuth()
  const [mode, setMode] = useState<Mode>('attendance')
  const [points, setPoints] = useState('5')
  const [date, setDate] = useState(todayStr())
  const [active, setActive] = useState(false)
  const [result, setResult] = useState<{ child: Child; text: string; ok: boolean } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selected, setSelected] = useState<Child | null>(null)
  const busyRef = useRef(false)

  const MODES: { key: Mode; label: string; icon: string; cls: string; perm?: string }[] = [
    { key: 'attendance', label: 'تسجيل حضور', icon: '✅', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700', perm: 'attendance.record' },
    { key: 'addPoints', label: 'إضافة نقاط', icon: '➕', cls: 'border-amber-500 bg-amber-50 text-amber-700', perm: 'points.add' },
    { key: 'subPoints', label: 'خصم نقاط', icon: '➖', cls: 'border-red-500 bg-red-50 text-red-600', perm: 'points.subtract' },
    { key: 'view', label: 'إظهار البيانات', icon: '👁️', cls: 'border-blue-500 bg-blue-50 text-blue-600', perm: 'children.view' },
  ]
  const modes = MODES.filter((m) => !m.perm || hasPermission(m.perm))

  const pushHistory = (name: string, text: string, ok: boolean) => {
    setHistory((h) => [{ name, text, ok, time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 20))
  }

  const handleScan = useCallback(async (code: string) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const supabase = getSupabase()
      const { data: child } = await supabase
        .from('children').select('*, classes(*)').eq('code', code).eq('is_active', true).maybeSingle()

      if (!child) {
        beep(false)
        setResult(null)
        pushHistory(code, '❌ كود غير مسجل', false)
        return
      }
      const c = child as Child
      const pts = Math.abs(parseInt(points) || 0)

      if (mode === 'view') {
        beep(true)
        setResult({ child: c, text: '👁️ عرض البيانات', ok: true })
        setSelected(c)
        pushHistory(c.name, '👁️ عرض البيانات', true)
        return
      }

      if (mode === 'attendance') {
        const { data: existing } = await supabase
          .from('attendance').select('id').eq('child_id', c.id).eq('date', date).maybeSingle()
        if (existing) {
          beep(false)
          setResult({ child: c, text: '⚠️ الحضور مسجل بالفعل اليوم', ok: false })
          pushHistory(c.name, '⚠️ مسجل بالفعل', false)
          return
        }
        const { error } = await supabase.from('attendance').insert({
          child_id: c.id, date, status: 'present', recorded_by: user?.id,
        })
        if (error) { beep(false); setResult({ child: c, text: '❌ خطأ أو لا توجد صلاحية', ok: false }); return }
        if (pts > 0) {
          await supabase.from('point_transactions').insert({
            child_id: c.id, points: pts, reason: 'حضور', category: 'attendance', date, created_by: user?.id,
          })
        }
        beep(true)
        const txt = pts > 0 ? `✅ تم تسجيل الحضور +${pts} نقطة` : '✅ تم تسجيل الحضور'
        setResult({ child: c, text: txt, ok: true })
        pushHistory(c.name, txt, true)
        return
      }

      // addPoints / subPoints
      if (!pts) {
        beep(false)
        setResult({ child: c, text: '⚠️ أدخل عدد النقاط أولاً', ok: false })
        return
      }
      const value = mode === 'addPoints' ? pts : -pts
      const { error } = await supabase.from('point_transactions').insert({
        child_id: c.id, points: value, reason: mode === 'addPoints' ? 'نقاط بالماسح' : 'خصم بالماسح',
        category: 'general', date, created_by: user?.id,
      })
      if (error) { beep(false); setResult({ child: c, text: '❌ خطأ أو لا توجد صلاحية', ok: false }); return }
      beep(true)
      const txt = value > 0 ? `⭐ تم إضافة ${pts} نقطة` : `➖ تم خصم ${pts} نقطة`
      setResult({ child: c, text: txt, ok: true })
      pushHistory(c.name, txt, true)
    } finally {
      busyRef.current = false
    }
  }, [mode, points, date, user])

  const showPoints = mode === 'attendance' || mode === 'addPoints' || mode === 'subPoints'

  return (
    <div className="animate-fadeIn">
      <header className="hero-gradient text-white px-5 pt-8 pb-12 rounded-b-[2.5rem]">
        <h1 className="text-2xl font-extrabold">📷 الماسح الضوئي</h1>
        <p className="text-white/70 text-xs font-semibold mt-1">اختر الوظيفة ثم امسح الكروت بشكل متتالي ⚡</p>
      </header>

      <div className="px-4 -mt-6 space-y-3 pb-4">
        {/* mode selector */}
        <section id="scan-modes" className="card p-3">
          <p className="text-[11px] font-extrabold text-gray-400 mb-2">وظيفة المسح</p>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`rounded-2xl border-2 px-3 py-3 text-sm font-extrabold transition-all active:scale-95 ${
                  mode === m.key ? m.cls + ' shadow-md' : 'border-gray-100 bg-white text-gray-400'
                }`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            {showPoints && (
              <div className="flex items-center gap-2 flex-1 animate-fadeIn">
                <label htmlFor="scan-points" className="text-xs font-bold text-gray-500 shrink-0">النقاط:</label>
                <input id="scan-points" type="number" min="0" className="input !py-2 text-center" dir="ltr"
                  value={points} onChange={(e) => setPoints(e.target.value)} />
              </div>
            )}
            <input id="scan-date" type="date" className="input !py-2 flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {mode === 'attendance' && (
            <p className="text-[11px] text-gray-400 font-semibold mt-2">كل مسح = تسجيل حضور {parseInt(points) > 0 ? `+ ${parseInt(points)} نقطة تلقائياً` : 'بدون نقاط'}</p>
          )}
        </section>

        {/* scanner */}
        <section id="scan-area" className="card p-3">
          {active ? (
            <div className="animate-fadeIn">
              <QrScanner onScan={handleScan} />
              <button onClick={() => setActive(false)} className="btn-soft w-full mt-3">⏹️ إيقاف الكاميرا</button>
            </div>
          ) : (
            <button onClick={() => setActive(true)} className="btn-primary w-full py-4 text-base">
              📷 تشغيل الكاميرا وبدء المسح
            </button>
          )}
        </section>

        {/* last result */}
        {result && (
          <section id="scan-result" className={`card p-4 flex items-center gap-3 animate-pop ${result.ok ? '' : 'border-red-100'}`}>
            <div className="w-14 h-14 rounded-2xl bg-violet-100 overflow-hidden flex items-center justify-center text-3xl shrink-0">
              {result.child.photo_url
                ? <img src={result.child.photo_url} alt={result.child.name} className="w-full h-full object-cover" />
                : (result.child.gender === 'male' ? '👦' : '👧')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-800 truncate">{result.child.name}</p>
              <p className={`text-sm font-bold ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>{result.text}</p>
              <p className="text-[11px] text-gray-400 font-semibold">{result.child.classes?.name || 'بدون فصل'} · ⭐ {result.child.total_points}</p>
            </div>
          </section>
        )}

        {/* history */}
        {history.length > 0 && (
          <section id="scan-history" className="card divide-y divide-gray-50">
            <p className="p-3 text-[11px] font-extrabold text-gray-400">آخر العمليات ({history.length})</p>
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-gray-700 truncate">{h.name}</p>
                  <p className={`text-xs font-semibold ${h.ok ? 'text-emerald-600' : 'text-red-500'}`}>{h.text}</p>
                </div>
                <span className="text-[11px] text-gray-400 font-semibold shrink-0">{h.time}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      <ChildActionsSheet
        child={selected} date={date} open={!!selected}
        onClose={() => setSelected(null)} onChanged={() => {}}
      />
    </div>
  )
}
