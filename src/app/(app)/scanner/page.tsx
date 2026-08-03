'use client'
import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import QrScanner from '@/components/QrScanner'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import type { Child } from '@/lib/types'

const todayStr = () => new Date().toISOString().slice(0, 10)

type ScanResult = { child: Child; status: 'ok' | 'already' | 'notfound'; code: string }

export default function ScannerPage() {
  const { hasPermission } = useAuth()
  const [date, setDate] = useState(todayStr())
  const [scanPoints, setScanPoints] = useState(10)
  const [autoAttendance, setAutoAttendance] = useState(true)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [notFoundCode, setNotFoundCode] = useState('')
  const [sheetChild, setSheetChild] = useState<Child | null>(null)
  const [history, setHistory] = useState<{ name: string; time: string }[]>([])
  const beepRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    getSupabase().from('app_settings').select('value').eq('key', 'attendance_points').single()
      .then(({ data }) => { if (data?.value?.present != null) setScanPoints(data.value.present) })
  }, [])

  const beep = (ok: boolean) => {
    try {
      if (!beepRef.current) beepRef.current = new AudioContext()
      const ctx = beepRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = ok ? 880 : 220
      gain.gain.value = 0.1
      osc.start(); osc.stop(ctx.currentTime + 0.15)
    } catch {}
  }

  const handleScan = async (code: string) => {
    setNotFoundCode('')
    const supabase = getSupabase()
    const { data: child } = await supabase
      .from('children').select('*, classes(*)').eq('code', code).maybeSingle()

    if (!child) { beep(false); setResult(null); setNotFoundCode(code); return }

    let status: ScanResult['status'] = 'ok'
    if (autoAttendance && hasPermission('attendance.record')) {
      const { data: existing } = await supabase.from('attendance')
        .select('id').eq('child_id', child.id).eq('date', date).maybeSingle()
      if (existing) {
        status = 'already'
      } else {
        const { data: u } = await supabase.auth.getUser()
        await supabase.from('attendance').insert({
          child_id: child.id, date, status: 'present', recorded_by: u.user?.id,
        })
        if (scanPoints > 0 && hasPermission('points.add')) {
          await supabase.from('point_transactions').insert({
            child_id: child.id, points: scanPoints, reason: `حضور ${date}`,
            category: 'attendance', date, created_by: u.user?.id,
          })
        }
      }
    }
    beep(true)
    // refresh child points
    const { data: fresh } = await supabase.from('children').select('*, classes(*)').eq('id', child.id).single()
    setResult({ child: (fresh || child) as Child, status, code })
    if (status === 'ok') {
      setHistory(h => [{ name: child.name, time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 20))
    }
  }

  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold text-gray-800 mb-3">📷 المسح الضوئي</h1>
        <div className="bg-white rounded-2xl p-3 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-gray-600">التاريخ:</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 font-bold text-gray-700 outline-none flex-1" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-gray-600">نقاط الحضور:</label>
            <input type="number" inputMode="numeric" value={scanPoints}
              onChange={e => setScanPoints(Number(e.target.value) || 0)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 font-bold text-gray-700 outline-none w-24" />
            <label className="flex items-center gap-2 mr-auto text-sm font-bold text-gray-600">
              <input type="checkbox" checked={autoAttendance} onChange={e => setAutoAttendance(e.target.checked)}
                className="w-4 h-4 accent-violet-600" />
              تسجيل حضور تلقائي
            </label>
          </div>
        </div>
      </header>

      <QrScanner onScan={handleScan} paused={!!sheetChild} />

      {notFoundCode && (
        <div className="mt-3 bg-red-50 rounded-2xl p-4 text-center animate-fadeIn">
          <p className="font-bold text-red-600">❌ لا يوجد طفل مسجل بهذا الكود</p>
          <p className="text-xs text-red-400 mt-1" dir="ltr">{notFoundCode}</p>
        </div>
      )}

      {result && (
        <div className={`mt-3 rounded-2xl p-4 animate-fadeIn ${result.status === 'already' ? 'bg-amber-50' : 'bg-green-50'}`}>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white overflow-hidden flex items-center justify-center text-3xl shrink-0">
              {result.child.photo_url ? <img src={result.child.photo_url} alt={result.child.name} className="w-full h-full object-cover" /> : (result.child.gender === 'male' ? '👦' : '👧')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-800">{result.child.name}</p>
              <p className="text-xs text-gray-500">{result.child.classes?.name} · ⭐ {result.child.total_points} نقطة</p>
              <p className={`text-sm font-bold mt-0.5 ${result.status === 'already' ? 'text-amber-600' : 'text-green-600'}`}>
                {result.status === 'already' ? '⚠️ الحضور مسجل مسبقاً لهذا اليوم' : `✅ تم تسجيل الحضور +${scanPoints} نقطة`}
              </p>
            </div>
            <button onClick={() => setSheetChild(result.child)}
              className="shrink-0 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold">إجراءات</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-bold text-gray-500 mb-2">آخر عمليات المسح ({history.length})</h2>
          <ul className="space-y-1.5">
            {history.map((h, i) => (
              <li key={i} className="bg-white rounded-xl px-4 py-2 flex justify-between text-sm shadow-sm">
                <span className="font-bold text-gray-700">{h.name}</span>
                <span className="text-gray-400" dir="ltr">{h.time}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChildActionsSheet
        child={sheetChild} date={date} open={!!sheetChild}
        onClose={() => setSheetChild(null)}
        onChanged={() => {
          if (sheetChild) {
            getSupabase().from('children').select('*, classes(*)').eq('id', sheetChild.id).single()
              .then(({ data }) => { if (data && result?.child.id === data.id) setResult(r => r ? { ...r, child: data as Child } : r) })
          }
        }}
      />
    </div>
  )
}
