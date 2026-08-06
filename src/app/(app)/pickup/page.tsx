'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import Icon from '@/components/Icon'
import type { Child } from '@/lib/types'

export interface PickupCall {
  id: string
  child_id: string
  date: string
  position: number
  status: 'waiting' | 'delivered'
  delivered_at: string | null
  created_at: string
  children?: Child | null
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function PickupPage() {
  const { user, hasPermission } = useAuth()
  const [calls, setCalls] = useState<PickupCall[]>([])
  const [delivered, setDelivered] = useState<PickupCall[]>([])
  const [loading, setLoading] = useState(true)
  const [isFull, setIsFull] = useState(false)
  const [confirm, setConfirm] = useState<PickupCall | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canManage = hasPermission('pickup.manage')

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const today = todayStr()
    const { data } = await supabase
      .from('pickup_calls')
      .select('*, children(*, classes(*))')
      .eq('date', today)
      .order('position', { ascending: true })
    const rows = (data || []) as PickupCall[]
    setCalls(rows.filter((r) => r.status === 'waiting'))
    setDelivered(rows.filter((r) => r.status === 'delivered').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 10))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['pickup_calls'], load)

  // fullscreen handling
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (wrapRef.current) {
        await wrapRef.current.requestFullscreen()
      }
    } catch {}
  }

  const markDelivered = async (call: PickupCall) => {
    const supabase = getSupabase()
    await supabase.from('pickup_calls').update({
      status: 'delivered', delivered_by: user?.id, delivered_at: new Date().toISOString(),
    }).eq('id', call.id)
    setConfirm(null)
    load()
  }

  const moveToTop = async (call: PickupCall) => {
    const supabase = getSupabase()
    const minPos = calls.length ? Math.min(...calls.map((c) => c.position)) : 0
    await supabase.from('pickup_calls').update({ position: minPos - 1 }).eq('id', call.id)
    setConfirm(null)
    load()
  }

  const removeCall = async (call: PickupCall) => {
    const supabase = getSupabase()
    await supabase.from('pickup_calls').delete().eq('id', call.id)
    setConfirm(null)
    load()
  }

  return (
    <div ref={wrapRef} className={`animate-fadeIn ${isFull ? 'bg-gray-950 min-h-screen overflow-y-auto' : ''}`}>
      <div className={`px-4 pt-4 pb-6 space-y-3 ${isFull ? 'max-w-5xl mx-auto' : ''}`}>
        {/* header bar */}
        <section className={`card p-3 flex items-center justify-between gap-2 ${isFull ? '!bg-gray-900 !border-gray-800' : ''}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex items-center justify-center w-10 h-10 rounded-2xl shrink-0 ${isFull ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
              <Icon name="megaphone" size={22} />
            </span>
            <div className="min-w-0">
              <h1 className={`text-lg font-extrabold leading-tight ${isFull ? 'text-white' : 'text-gray-800'}`}>استدعاء الأطفال</h1>
              <p className={`text-[11px] font-bold ${isFull ? 'text-gray-400' : 'text-gray-400'}`}>📅 {todayStr()} · في الانتظار: {calls.length}</p>
            </div>
          </div>
          <button onClick={toggleFull}
            className={`flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-extrabold transition-all active:scale-95 shrink-0 ${
              isFull ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'
            }`}>
            <Icon name={isFull ? 'shrink' : 'expand'} size={18} />
            {isFull ? 'خروج' : 'ملء الشاشة'}
          </button>
        </section>

        {/* waiting list */}
        {loading ? (
          <p className={`text-center py-10 font-extrabold animate-pulse ${isFull ? 'text-gray-400' : 'text-gray-400'}`}>جاري التحميل...</p>
        ) : calls.length === 0 ? (
          <section className={`card p-10 text-center ${isFull ? '!bg-gray-900 !border-gray-800' : ''}`}>
            <p className="text-5xl mb-3">😴</p>
            <p className={`font-extrabold ${isFull ? 'text-gray-300' : 'text-gray-500'}`}>لا يوجد أطفال في قائمة الاستدعاء</p>
            <p className={`text-xs font-semibold mt-1 ${isFull ? 'text-gray-500' : 'text-gray-400'}`}>امسح كارت الطفل من الماسح (وضع الاستدعاء) لإضافته هنا</p>
          </section>
        ) : (
          <section className="grid gap-2 landscape:grid-cols-2 lg:grid-cols-2">
            {calls.map((c, i) => (
              <button key={c.id} disabled={!canManage}
                onClick={() => canManage && setConfirm(c)}
                className={`text-right rounded-3xl border-2 p-4 flex items-center gap-3 transition-all animate-pop ${
                  i === 0
                    ? (isFull ? 'bg-violet-600 border-violet-500 shadow-lg shadow-violet-600/30' : 'bg-violet-600 border-violet-600 shadow-lg shadow-violet-600/30')
                    : (isFull ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100')
                } ${canManage ? 'active:scale-[0.98]' : ''}`}>
                <span className={`flex items-center justify-center w-9 h-9 rounded-2xl text-sm font-extrabold shrink-0 ${
                  i === 0 ? 'bg-white/20 text-white' : (isFull ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600')
                }`}>{i + 1}</span>
                <div className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center text-2xl shrink-0 ${
                  i === 0 ? 'bg-white/20' : (isFull ? 'bg-gray-800' : 'bg-violet-100')
                }`}>
                  {c.children?.photo_url
                    ? <img src={c.children.photo_url} alt={c.children?.name || ''} className="w-full h-full object-cover" />
                    : (c.children?.gender === 'male' ? '👦' : '👧')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xl sm:text-2xl font-extrabold leading-tight truncate ${
                    i === 0 ? 'text-white' : (isFull ? 'text-gray-100' : 'text-gray-800')
                  }`}>{c.children?.name || '—'}</p>
                  <p className={`text-xs font-bold mt-0.5 ${
                    i === 0 ? 'text-white/70' : (isFull ? 'text-gray-500' : 'text-gray-400')
                  }`}>{c.children?.classes?.name || 'بدون فصل'} · {new Date(c.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                {i === 0 && <span className="text-2xl animate-pulse shrink-0">📣</span>}
              </button>
            ))}
          </section>
        )}

        {/* delivered today */}
        {delivered.length > 0 && (
          <section className={`card divide-y ${isFull ? '!bg-gray-900 !border-gray-800 divide-gray-800' : 'divide-gray-50'}`}>
            <p className={`p-3 text-[11px] font-extrabold ${isFull ? 'text-gray-500' : 'text-gray-400'}`}>✅ تم تسليمهم اليوم ({delivered.length})</p>
            {delivered.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 text-sm">
                <p className={`font-bold truncate ${isFull ? 'text-gray-300' : 'text-gray-600'}`}>{c.children?.name || '—'}</p>
                <span className={`text-[11px] font-semibold shrink-0 ${isFull ? 'text-gray-500' : 'text-gray-400'}`}>
                  {c.delivered_at ? new Date(c.delivered_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* confirm sheet (works also inside fullscreen since it's within wrapRef) */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirm(null)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 overflow-hidden flex items-center justify-center text-2xl shrink-0">
                {confirm.children?.photo_url
                  ? <img src={confirm.children.photo_url} alt="" className="w-full h-full object-cover" />
                  : (confirm.children?.gender === 'male' ? '👦' : '👧')}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-gray-800 truncate">{confirm.children?.name}</p>
                <p className="text-xs font-bold text-gray-400">{confirm.children?.classes?.name || 'بدون فصل'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => markDelivered(confirm)} className="w-full rounded-2xl bg-emerald-600 text-white font-extrabold py-3.5 active:scale-95 transition-all">
                ✅ تم التسليم
              </button>
              <button onClick={() => moveToTop(confirm)} className="w-full rounded-2xl bg-violet-600 text-white font-extrabold py-3.5 active:scale-95 transition-all">
                ⬆️ إرسال إلى أول القائمة
              </button>
              <button onClick={() => removeCall(confirm)} className="w-full rounded-2xl bg-red-50 text-red-600 font-extrabold py-3 active:scale-95 transition-all">
                🗑️ إزالة من القائمة
              </button>
              <button onClick={() => setConfirm(null)} className="w-full rounded-2xl bg-gray-100 text-gray-500 font-extrabold py-3 active:scale-95 transition-all">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
