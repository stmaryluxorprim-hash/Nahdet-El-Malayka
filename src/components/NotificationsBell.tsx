'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import { serverNowMs } from '@/lib/serverClock'
import Icon from '@/components/Icon'
import type { AppNotification } from '@/lib/types'

const LAST_SEEN_KEY = 'notif_last_seen'
const RING_WINDOW_MS = 2 * 60 * 1000 // نرنّ فقط للإشعارات الأحدث من دقيقتين (بتوقيت السيرفر)
const RING_DURATION_MS = 30 * 1000   // مدة الرنين القصوى

/** تنسيق الوقت بتوقيت القاهرة */
const fmtCairo = (iso: string) =>
  new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric', minute: '2-digit',
    day: 'numeric', month: 'short',
  }).format(new Date(iso))

export default function NotificationsBell() {
  const { user, hasPermission } = useAuth()
  const canSend = hasPermission('notifications.send')

  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem(LAST_SEEN_KEY) || 0)
  })

  // ---- تحميل الإشعارات ----
  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from('notifications')
      .select('*, profiles:created_by(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems((data as AppNotification[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  // ---- 🔔 الرنين (نغمة مختلفة عن جرس الخريطة: نغمة صاعدة sine دو-مي-صول) ----
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ringingNotif, setRingingNotif] = useState<AppNotification | null>(null)

  // تجهيز AudioContext عند أول تفاعل من المستخدم (قيود autoplay على الموبايل)
  useEffect(() => {
    const prime = () => {
      try {
        if (!audioCtxRef.current) {
          const AC = window.AudioContext || (window as any).webkitAudioContext
          audioCtxRef.current = new AC()
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
      } catch {}
    }
    window.addEventListener('pointerdown', prime, { passive: true })
    return () => window.removeEventListener('pointerdown', prime)
  }, [])

  const chime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new AC()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      // نغمة صاعدة ثلاثية (دو-مي-صول) مرتين — مميزة عن جرس المؤقّت (square 880/660)
      const notes = [523.25, 659.25, 783.99, 523.25, 659.25, 783.99]
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.16
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.16)
      })
      // اهتزاز (لو مدعوم)
      if (navigator.vibrate) navigator.vibrate([250, 120, 250])
    } catch {}
  }, [])

  const stopRinging = useCallback(() => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null }
    if (ringStopTimeoutRef.current) { clearTimeout(ringStopTimeoutRef.current); ringStopTimeoutRef.current = null }
    setRingingNotif(null)
  }, [])

  const startRinging = useCallback((n: AppNotification) => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null }
    if (ringStopTimeoutRef.current) { clearTimeout(ringStopTimeoutRef.current); ringStopTimeoutRef.current = null }
    setRingingNotif(n)
    chime()
    ringTimerRef.current = setInterval(chime, 1400)
    ringStopTimeoutRef.current = setTimeout(() => {
      if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null }
      // نُبقي البانر ظاهراً بعد توقف الصوت حتى يغلقه المستخدم
    }, RING_DURATION_MS)
  }, [chime])

  useEffect(() => () => stopRinging(), [stopRinging])

  // ---- Realtime: إشعار جديد → تحديث القائمة + رنين إن كان مطلوباً ----
  const handledRef = useRef<Set<string>>(new Set())
  useRealtime(['notifications'], load, 150)
  useEffect(() => {
    const supabase = getSupabase()
    const ch = supabase.channel(`notif-ring-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new as AppNotification
        if (!n?.id || handledRef.current.has(n.id)) return
        handledRef.current.add(n.id)
        // لا نرنّ على جهاز المرسل نفسه
        if (n.created_by && n.created_by === user?.id) return
        // نرنّ فقط للإشعارات الحديثة فعلاً (مقارنة بساعة السيرفر وليس ساعة الجهاز)
        const age = serverNowMs() - new Date(n.created_at).getTime()
        if (n.ring && age < RING_WINDOW_MS) startRinging(n)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.id, startRinging])

  // ---- عدد غير المقروء ----
  const unread = useMemo(
    () => items.filter((n) => new Date(n.created_at).getTime() > lastSeen).length,
    [items, lastSeen])

  const markSeen = useCallback(() => {
    const now = serverNowMs()
    setLastSeen(now)
    try { localStorage.setItem(LAST_SEEN_KEY, String(now)) } catch {}
  }, [])

  const openPanel = () => { setOpen(true); markSeen() }

  // ---- إرسال إشعار (للمسؤولين) ----
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [withRing, setWithRing] = useState(true)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title.trim() || sending) return
    setSending(true)
    await getSupabase().from('notifications').insert({
      title: title.trim(),
      body: body.trim() || null,
      ring: withRing,
      created_by: user?.id,
    })
    setTitle(''); setBody('')
    setSending(false)
    load()
  }

  const remove = async (id: string) => {
    await getSupabase().from('notifications').delete().eq('id', id)
    load()
  }

  return (
    <>
      {/* زر الجرس في الهيدر */}
      <button onClick={openPanel} aria-label="الإشعارات"
        className="relative w-11 h-11 rounded-2xl bg-white/20 backdrop-blur text-white active:scale-90 transition flex items-center justify-center">
        <Icon name="bell" size={22} />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow">
            {unread > 9 ? '+9' : unread}
          </span>
        )}
      </button>

      {/* 🚨 بانر الرنين الجماعي — يظهر فوق كل شيء */}
      {ringingNotif && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden ring-anim">
            <div className="bg-gradient-to-l from-red-500 to-rose-600 text-white px-5 py-4 flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 animate-bounce">
                <Icon name="bell" size={24} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white/80">🔔 تنبيه من المسؤول</p>
                <p className="font-extrabold text-lg leading-tight truncate">{ringingNotif.title}</p>
              </div>
            </div>
            <div className="p-5">
              {ringingNotif.body && (
                <p className="text-sm font-bold text-gray-600 leading-relaxed whitespace-pre-wrap mb-4">{ringingNotif.body}</p>
              )}
              <button onClick={() => { stopRinging(); markSeen() }}
                className="w-full rounded-2xl bg-red-600 text-white font-extrabold py-3.5 text-sm active:scale-95 transition-all shadow-lg shadow-red-600/30">
                🔕 حسناً — إيقاف الرنين
              </button>
            </div>
          </div>
        </div>
      )}

      {/* لوحة الإشعارات */}
      {open && (
        <div className="fixed inset-0 z-[80]" aria-modal>
          <div onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" />
          <div className="absolute top-0 inset-x-0 max-w-2xl mx-auto p-3">
            <div className="rounded-3xl bg-white shadow-2xl overflow-hidden animate-fadeIn max-h-[85vh] flex flex-col">
              {/* header */}
              <div className="hero-gradient text-white px-5 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <Icon name="bell" size={22} />
                  </span>
                  <div>
                    <p className="font-extrabold text-lg leading-tight">الإشعارات</p>
                    <p className="text-white/70 text-[10px] font-bold">تصل لكل الخدام لحظياً ⚡</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-xl bg-white/20 text-white font-bold active:scale-90 transition">✕</button>
              </div>

              {/* composer (للمسؤولين فقط) */}
              {canSend && (
                <div className="p-4 border-b border-gray-100 space-y-2 shrink-0">
                  <input className="input !py-2.5" placeholder="عنوان الإشعار *" value={title}
                    onChange={(e) => setTitle(e.target.value)} maxLength={100} />
                  <textarea className="input !py-2.5 resize-none" rows={2} placeholder="نص الإشعار (اختياري)"
                    value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setWithRing(!withRing)}
                      className={`flex-1 rounded-2xl border-2 px-3 py-2.5 text-xs font-extrabold text-right transition-all active:scale-[0.98] ${
                        withRing ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-400'}`}>
                      {withRing ? '🔔 سيرنّ على كل الأجهزة' : '🔕 بدون رنين (إشعار صامت)'}
                    </button>
                    <button onClick={send} disabled={!title.trim() || sending}
                      className="rounded-2xl bg-violet-600 text-white font-extrabold px-5 py-2.5 text-sm active:scale-95 transition-all disabled:opacity-40 shadow-lg shadow-violet-600/25">
                      {sending ? '...' : '📣 إرسال'}
                    </button>
                  </div>
                </div>
              )}

              {/* list */}
              <div className="overflow-y-auto p-3 space-y-2">
                {items.length === 0 ? (
                  <p className="text-center text-xs font-bold text-gray-300 py-8">لا توجد إشعارات بعد</p>
                ) : items.map((n) => (
                  <div key={n.id} className={`rounded-2xl border-2 p-3 ${
                    new Date(n.created_at).getTime() > lastSeen ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100 bg-white'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${
                        n.ring ? 'bg-red-50' : 'bg-gray-50'}`}>
                        {n.ring ? '🔔' : '💬'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-sm text-gray-800 leading-tight">{n.title}</p>
                        {n.body && <p className="text-xs font-bold text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">{n.body}</p>}
                        <p className="text-[10px] font-bold text-gray-300 mt-1.5">
                          {n.profiles?.full_name ? `${n.profiles.full_name} · ` : ''}{fmtCairo(n.created_at)} <span className="text-gray-200">(بتوقيت القاهرة)</span>
                        </p>
                      </div>
                      {canSend && (
                        <button onClick={() => remove(n.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 text-xs font-bold shrink-0 active:scale-90 transition">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
