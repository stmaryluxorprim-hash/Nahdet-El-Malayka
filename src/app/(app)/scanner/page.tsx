'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import QrScanner from '@/components/QrScanner'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import { useUi } from '@/contexts/UiContext'
import { useRealtime } from '@/lib/useRealtime'
import type { Child } from '@/lib/types'

type Mode = 'attendance' | 'addPoints' | 'subPoints' | 'view' | 'pickup' | 'redeem'

interface PickupPrompt { child: Child; callId: string }

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
  const { date } = useUi()
  const [mode, setMode] = useState<Mode>('attendance')
  const [points, setPoints] = useState('5')
  const [active, setActive] = useState(false)
  const [result, setResult] = useState<{ child: Child; text: string; ok: boolean } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selected, setSelected] = useState<Child | null>(null)
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null)
  const [redeemChild, setRedeemChild] = useState<Child | null>(null)
  const busyRef = useRef(false)

  const MODES: { key: Mode; label: string; icon: string; cls: string; perm?: string }[] = [
    { key: 'attendance', label: 'تسجيل حضور', icon: '✅', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700', perm: 'attendance.record' },
    { key: 'addPoints', label: 'إضافة نقاط', icon: '➕', cls: 'border-amber-500 bg-amber-50 text-amber-700', perm: 'points.add' },
    { key: 'subPoints', label: 'خصم نقاط', icon: '➖', cls: 'border-red-500 bg-red-50 text-red-600', perm: 'points.subtract' },
    { key: 'view', label: 'إظهار البيانات', icon: '👁️', cls: 'border-blue-500 bg-blue-50 text-blue-600', perm: 'children.view' },
    { key: 'pickup', label: 'استدعاء', icon: '📣', cls: 'border-violet-500 bg-violet-50 text-violet-700', perm: 'pickup.manage' },
    { key: 'redeem', label: 'استبدال', icon: '🎁', cls: 'border-pink-500 bg-pink-50 text-pink-600', perm: 'points.subtract' },
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

      if (mode === 'pickup') {
        const today = new Date().toISOString().slice(0, 10)
        const { data: existing } = await supabase
          .from('pickup_calls').select('id')
          .eq('child_id', c.id).eq('date', today).eq('status', 'waiting')
          .maybeSingle()

        if (existing) {
          // موجود بالفعل في القائمة → اسأل: تم التسليم أم إرسال لأول القائمة؟
          beep(true)
          setPickupPrompt({ child: c, callId: existing.id })
          setResult({ child: c, text: '📣 موجود في قائمة الاستدعاء بالفعل', ok: true })
          return
        }

        const { data: maxRow } = await supabase
          .from('pickup_calls').select('position')
          .eq('date', today).order('position', { ascending: false }).limit(1).maybeSingle()
        const nextPos = (maxRow?.position ?? 0) + 1

        const { error } = await supabase.from('pickup_calls').insert({
          child_id: c.id, date: today, position: nextPos, called_by: user?.id,
        })
        if (error) { beep(false); setResult({ child: c, text: '❌ خطأ أو لا توجد صلاحية', ok: false }); return }
        beep(true)
        setResult({ child: c, text: '📣 تمت الإضافة لقائمة الاستدعاء', ok: true })
        pushHistory(c.name, '📣 استدعاء', true)
        return
      }

      if (mode === 'redeem') {
        beep(true)
        setResult({ child: c, text: '🎁 استبدال نقاط', ok: true })
        setRedeemChild(c)
        return
      }

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

  const resolvePickup = async (action: 'delivered' | 'toTop') => {
    if (!pickupPrompt) return
    const supabase = getSupabase()
    const today = new Date().toISOString().slice(0, 10)
    if (action === 'delivered') {
      await supabase.from('pickup_calls').update({
        status: 'delivered', delivered_by: user?.id, delivered_at: new Date().toISOString(),
      }).eq('id', pickupPrompt.callId)
      pushHistory(pickupPrompt.child.name, '✅ تم التسليم', true)
      setResult({ child: pickupPrompt.child, text: '✅ تم التسليم', ok: true })
    } else {
      const { data: minRow } = await supabase
        .from('pickup_calls').select('position')
        .eq('date', today).eq('status', 'waiting')
        .order('position', { ascending: true }).limit(1).maybeSingle()
      const topPos = (minRow?.position ?? 0) - 1
      await supabase.from('pickup_calls').update({ position: topPos }).eq('id', pickupPrompt.callId)
      pushHistory(pickupPrompt.child.name, '⬆️ أرسل لأول القائمة', true)
      setResult({ child: pickupPrompt.child, text: '⬆️ تم الإرسال لأول القائمة', ok: true })
    }
    setPickupPrompt(null)
  }

  const showPoints = mode === 'attendance' || mode === 'addPoints' || mode === 'subPoints'

  return (
    <div className="animate-fadeIn">
      <div className="px-4 pt-4 space-y-3 pb-4">
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
            <p className="text-[11px] text-gray-400 font-bold shrink-0">📅 {date}</p>
          </div>
          {mode === 'attendance' && (
            <p className="text-[11px] text-gray-400 font-semibold mt-2">كل مسح = تسجيل حضور {parseInt(points) > 0 ? `+ ${parseInt(points)} نقطة تلقائياً` : 'بدون نقاط'}</p>
          )}
          {mode === 'pickup' && (
            <p className="text-[11px] text-gray-400 font-semibold mt-2">📣 كل مسح = إضافة الطفل لصفحة الاستدعاء — ولو موجود بالفعل هيسألك: تم التسليم؟ أم إرسال لأول القائمة؟</p>
          )}
          {mode === 'redeem' && (
            <p className="text-[11px] text-gray-400 font-semibold mt-2">🎁 امسح الكارت → تظهر نافذة باسم الطفل ونقاطه لحظياً → اكتب عدد النقاط واضغط «خصم» — وتقدر تتراجع عن آخر عملية</p>
          )}
        </section>

        {/* scanner */}
        <section id="scan-area" className="card p-3">
          {active ? (
            <div className="animate-fadeIn">
              <QrScanner onScan={handleScan} paused={!!pickupPrompt || !!redeemChild} />
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

      {/* 🎁 استبدال النقاط */}
      {redeemChild && (
        <RedeemSheet
          child={redeemChild} date={date} userId={user?.id}
          onClose={() => setRedeemChild(null)}
          onDone={(name, text, ok) => pushHistory(name, text, ok)}
        />
      )}

      {/* طفل موجود بالفعل في قائمة الاستدعاء — اختر الإجراء */}
      {pickupPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPickupPrompt(null)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 animate-fadeIn">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 overflow-hidden flex items-center justify-center text-2xl shrink-0">
                {pickupPrompt.child.photo_url
                  ? <img src={pickupPrompt.child.photo_url} alt="" className="w-full h-full object-cover" />
                  : (pickupPrompt.child.gender === 'male' ? '👦' : '👧')}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-gray-800 truncate">{pickupPrompt.child.name}</p>
                <p className="text-xs font-bold text-violet-600">📣 موجود في قائمة الاستدعاء بالفعل</p>
              </div>
            </div>
            <p className="text-sm font-bold text-gray-500 mb-4">ماذا تريد أن تفعل؟</p>
            <div className="space-y-2">
              <button onClick={() => resolvePickup('delivered')} className="w-full rounded-2xl bg-emerald-600 text-white font-extrabold py-3.5 active:scale-95 transition-all">
                ✅ تم التسليم
              </button>
              <button onClick={() => resolvePickup('toTop')} className="w-full rounded-2xl bg-violet-600 text-white font-extrabold py-3.5 active:scale-95 transition-all">
                ⬆️ إرسال إلى أول القائمة
              </button>
              <button onClick={() => setPickupPrompt(null)} className="w-full rounded-2xl bg-gray-100 text-gray-500 font-extrabold py-3 active:scale-95 transition-all">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= 🎁 نافذة استبدال النقاط ================= */
function RedeemSheet({ child, date, userId, onClose, onDone }: {
  child: Child
  date: string
  userId?: string
  onClose: () => void
  onDone: (name: string, text: string, ok: boolean) => void
}) {
  const [livePoints, setLivePoints] = useState<number>(child.total_points)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [lastTx, setLastTx] = useState<{ id: string; points: number } | null>(null)

  // تحديث لحظي لنقاط الطفل
  const refreshPoints = useCallback(async () => {
    const { data } = await getSupabase()
      .from('children').select('total_points').eq('id', child.id).maybeSingle()
    if (data) setLivePoints(data.total_points)
  }, [child.id])

  useEffect(() => { refreshPoints() }, [refreshPoints])
  useRealtime(['children', 'point_transactions'], refreshPoints)

  const doRedeem = async () => {
    const pts = Math.abs(parseInt(amount) || 0)
    if (!pts) { setMsg({ text: '⚠️ أدخل عدد النقاط أولاً', ok: false }); return }
    if (pts > livePoints) { setMsg({ text: `⚠️ النقاط غير كافية — رصيده ${livePoints} فقط`, ok: false }); return }
    setBusy(true)
    const { data, error } = await getSupabase().from('point_transactions').insert({
      child_id: child.id, points: -pts, reason: 'استبدال نقاط',
      category: 'redeem', date, created_by: userId,
    }).select('id, points').maybeSingle()
    setBusy(false)
    if (error || !data) { setMsg({ text: '❌ خطأ أو لا توجد صلاحية', ok: false }); return }
    beep(true)
    setLastTx({ id: data.id, points: pts })
    setMsg({ text: `✅ تم خصم ${pts} نقطة`, ok: true })
    setAmount('')
    onDone(child.name, `🎁 استبدال −${pts} نقطة`, true)
    refreshPoints()
  }

  const undo = async () => {
    if (!lastTx || busy) return
    setBusy(true)
    const { data: deleted, error } = await getSupabase()
      .from('point_transactions').delete().eq('id', lastTx.id).select('id')
    if (error || !deleted || deleted.length === 0) {
      // لو الحذف مرفوض (للأدمن فقط) — نعوّض بمعاملة عكسية
      const { error: e2 } = await getSupabase().from('point_transactions').insert({
        child_id: child.id, points: lastTx.points, reason: 'تراجع عن استبدال',
        category: 'redeem', date, created_by: userId,
      })
      if (e2) { setBusy(false); setMsg({ text: '❌ تعذر التراجع', ok: false }); return }
    }
    setBusy(false)
    beep(true)
    setMsg({ text: `↩️ تم التراجع — رجعت ${lastTx.points} نقطة`, ok: true })
    onDone(child.name, `↩️ تراجع عن استبدال +${lastTx.points}`, true)
    setLastTx(null)
    refreshPoints()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 animate-fadeIn">
        {/* X close */}
        <button onClick={onClose} aria-label="إغلاق"
          className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-gray-100 text-gray-500 font-extrabold text-lg active:scale-90 transition-all">
          ✕
        </button>

        {/* child info */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-pink-100 overflow-hidden flex items-center justify-center text-3xl shrink-0">
            {child.photo_url
              ? <img src={child.photo_url} alt="" className="w-full h-full object-cover" />
              : (child.gender === 'male' ? '👦' : '👧')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-gray-800 truncate text-lg">{child.name}</p>
            <p className="text-[11px] text-gray-400 font-bold">{child.classes?.name || 'بدون فصل'} · 🎁 استبدال نقاط</p>
          </div>
        </div>

        {/* live points */}
        <div className="rounded-2xl bg-gradient-to-l from-pink-50 to-violet-50 border-2 border-pink-100 p-4 text-center mb-4">
          <p className="text-[11px] font-extrabold text-gray-400 mb-0.5">الرصيد الحالي (لحظي)</p>
          <p className="text-4xl font-extrabold text-pink-600 tabular-nums">⭐ {livePoints}</p>
        </div>

        {/* amount input */}
        <label htmlFor="redeem-amount" className="text-xs font-extrabold text-gray-500 mb-1 block">عدد النقاط المراد خصمها</label>
        <input id="redeem-amount" type="number" min="1" inputMode="numeric" dir="ltr" autoFocus
          className="input text-center text-2xl font-extrabold !py-3 mb-3" placeholder="0"
          value={amount} onChange={(e) => { setAmount(e.target.value); setMsg(null) }}
          onKeyDown={(e) => e.key === 'Enter' && !busy && doRedeem()} />

        {msg && (
          <p className={`text-sm font-extrabold text-center mb-3 animate-pop ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</p>
        )}

        {/* خصم */}
        <button onClick={doRedeem} disabled={busy || !(parseInt(amount) > 0)}
          className="w-full rounded-2xl bg-pink-600 text-white font-extrabold py-4 text-base active:scale-95 transition-all shadow-lg shadow-pink-600/25 disabled:opacity-40">
          {busy ? 'جاري...' : '🎁 خصم'}
        </button>

        {/* undo */}
        {lastTx && (
          <button onClick={undo} disabled={busy}
            className="w-full mt-2 rounded-xl bg-gray-100 text-gray-500 font-extrabold py-2 text-xs active:scale-95 transition-all disabled:opacity-40">
            ↩️ تراجع عن آخر خصم ({lastTx.points} نقطة)
          </button>
        )}
      </div>
    </div>
  )
}
