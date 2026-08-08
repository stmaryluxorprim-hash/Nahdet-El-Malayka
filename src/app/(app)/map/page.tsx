'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import Icon from '@/components/Icon'
import Modal from '@/components/Modal'
import type { CarnivalState, CarnivalTeam, CarnivalRoom, CarnivalAssignment } from '@/lib/types'

const TEAM_COLORS = ['#7c3aed', '#e11d48', '#0891b2', '#16a34a', '#ea580c', '#ca8a04', '#db2777', '#2563eb', '#059669', '#9333ea']
const ROOM_ICONS = ['🎪', '🎨', '⚽', '🎵', '📖', '🎯', '🧩', '🎭', '🏀', '🎲', '🪁', '🎳']

const fmt = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60)
  const sec = Math.max(0, s) % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function MapPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('map.manage')

  const [state, setState] = useState<CarnivalState | null>(null)
  const [teams, setTeams] = useState<CarnivalTeam[]>([])
  const [rooms, setRooms] = useState<CarnivalRoom[]>([])
  const [assignments, setAssignments] = useState<CarnivalAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [isFull, setIsFull] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [st, tm, rm, asg] = await Promise.all([
      supabase.from('carnival_state').select('*').eq('id', 1).maybeSingle(),
      supabase.from('carnival_teams').select('*').order('sort_order').order('created_at'),
      supabase.from('carnival_rooms').select('*').order('sort_order').order('created_at'),
      supabase.from('carnival_assignments').select('*'),
    ])
    setState((st.data as CarnivalState) || null)
    setTeams((tm.data as CarnivalTeam[]) || [])
    setRooms((rm.data as CarnivalRoom[]) || [])
    setAssignments((asg.data as CarnivalAssignment[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['carnival_state', 'carnival_teams', 'carnival_rooms', 'carnival_assignments'], load)

  // tick every second while running
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  // fullscreen
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (wrapRef.current) await wrapRef.current.requestFullscreen()
    } catch {}
  }

  // ---- timer math ----
  const roundSeconds = state?.round_seconds ?? 600
  const remaining = useMemo(() => {
    if (!state) return roundSeconds
    if (state.paused_remaining !== null && state.paused_remaining !== undefined) return state.paused_remaining
    if (!state.started_at) return roundSeconds
    const elapsed = Math.floor((now - new Date(state.started_at).getTime()) / 1000)
    return Math.max(0, roundSeconds - elapsed)
  }, [state, now, roundSeconds])

  const running = !!state?.started_at && state?.paused_remaining == null && remaining > 0
  const timeUp = !!state?.started_at && state?.paused_remaining == null && remaining <= 0
  const paused = state?.paused_remaining != null
  const progress = roundSeconds > 0 ? Math.min(1, remaining / roundSeconds) : 0

  // ---- alarm ringing (Web Audio) ----
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [ringing, setRinging] = useState(false)

  const beep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new AC()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      // رنّة ثنائية (مثل جرس المنبه)
      ;[0, 0.28].forEach((offset) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(880, ctx.currentTime + offset)
        osc.frequency.setValueAtTime(660, ctx.currentTime + offset + 0.12)
        gain.gain.setValueAtTime(0.001, ctx.currentTime + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.24)
        osc.connect(gain).connect(ctx.destination)
        osc.start(ctx.currentTime + offset)
        osc.stop(ctx.currentTime + offset + 0.26)
      })
    } catch {}
  }, [])

  const stopRinging = useCallback(() => {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null }
    setRinging(false)
  }, [])

  const startRinging = useCallback(() => {
    if (ringIntervalRef.current) return
    beep()
    ringIntervalRef.current = setInterval(beep, 1100)
    setRinging(true)
  }, [beep])

  // رنّ عند انتهاء الوقت — وتوقف عند تغيير الجولة/الإعادة/إضافة وقت
  useEffect(() => {
    if (timeUp) startRinging()
    else stopRinging()
    return stopRinging
  }, [timeUp, startRinging, stopRinging])

  // إيقاف تلقائي للرنين بعد 45 ثانية
  useEffect(() => {
    if (!ringing) return
    const t = setTimeout(stopRinging, 45000)
    return () => clearTimeout(t)
  }, [ringing, stopRinging])

  const roomOfTeam = useCallback((teamId: string) => {
    const a = assignments.find((x) => x.round === (state?.current_round ?? 1) && x.team_id === teamId)
    if (!a) return null
    return rooms.find((r) => r.id === a.room_id) || null
  }, [assignments, rooms, state?.current_round])

  // ---- manager actions ----
  const updState = async (patch: Partial<CarnivalState>) => {
    const supabase = getSupabase()
    await supabase.from('carnival_state').upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
    load()
  }

  const startTimer = () => updState({ started_at: new Date().toISOString(), paused_remaining: null })
  const pauseTimer = () => updState({ paused_remaining: remaining })
  const resumeTimer = () => {
    // restart started_at so that elapsed = roundSeconds - paused_remaining
    const startedAt = new Date(Date.now() - (roundSeconds - (state?.paused_remaining ?? roundSeconds)) * 1000)
    updState({ started_at: startedAt.toISOString(), paused_remaining: null })
  }
  const resetTimer = () => updState({ started_at: null, paused_remaining: null })
  const goRound = (r: number, autoStart = false) => {
    const total = state?.total_rounds ?? 1
    const round = Math.min(Math.max(1, r), total)
    updState({
      current_round: round,
      started_at: autoStart ? new Date().toISOString() : null,
      paused_remaining: null,
    })
  }

  // إضافة / خصم وقت أثناء الجولة (أو أثناء الإيقاف المؤقت / بعد انتهاء الوقت)
  const adjustTime = (deltaSec: number) => {
    if (!state) return
    if (state.paused_remaining != null) {
      updState({ paused_remaining: Math.max(0, state.paused_remaining + deltaSec) })
    } else if (state.started_at) {
      // تحريك بداية العدّ يزيد/ينقص المتبقي مباشرة
      const newStart = new Date(new Date(state.started_at).getTime() + deltaSec * 1000)
      updState({ started_at: newStart.toISOString() })
    }
  }

  // التغيير التلقائي للجولة: عند انتهاء الوقت والوضع تلقائي — جولة تالية + بدء فوري
  // (ينفّذها جهاز مسؤول فقط حتى لا يكتب أكثر من جهاز في نفس اللحظة)
  const advancedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!timeUp || !state?.auto_advance || !canManage) return
    const key = `${state.current_round}|${state.started_at}`
    if (advancedKeyRef.current === key) return
    advancedKeyRef.current = key
    if (state.current_round < state.total_rounds) {
      // رنّة قصيرة ثم انتقال تلقائي بعد 3 ثوانٍ
      const t = setTimeout(() => goRound(state.current_round + 1, true), 3000)
      return () => clearTimeout(t)
    }
    // آخر جولة: يظل الرنين حتى يوقفه المسؤول
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp, state?.auto_advance, state?.current_round, state?.started_at, state?.total_rounds, canManage])

  // ring
  const R = 118
  const CIRC = 2 * Math.PI * R
  const ringColor = timeUp ? '#ef4444' : remaining <= 60 && running ? '#f59e0b' : '#7c3aed'

  const dark = isFull

  return (
    <div ref={wrapRef} className={`animate-fadeIn ${dark ? 'bg-gray-950 min-h-screen overflow-y-auto' : ''}`}>
      <div className={`px-4 pt-4 pb-6 space-y-3 ${dark ? 'max-w-5xl mx-auto' : ''}`}>
        {/* header */}
        <section className={`card p-3 flex items-center justify-between gap-2 ${dark ? '!bg-gray-900 !border-gray-800' : ''}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex items-center justify-center w-10 h-10 rounded-2xl shrink-0 ${dark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
              <Icon name="map" size={22} />
            </span>
            <div className="min-w-0">
              <h1 className={`text-lg font-extrabold leading-tight ${dark ? 'text-white' : 'text-gray-800'}`}>{state?.title || 'الخريطة التفاعلية'}</h1>
              <p className={`text-[11px] font-bold ${dark ? 'text-gray-400' : 'text-gray-400'}`}>
                {teams.length} فرق · {rooms.length} غرف · {state?.total_rounds ?? 0} جولات
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canManage && (
              <button onClick={() => setShowSetup(true)}
                className={`flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-extrabold transition-all active:scale-95 ${
                  dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                <Icon name="settings" size={18} />
                <span className="hidden sm:inline">الإعدادات</span>
              </button>
            )}
            <button onClick={toggleFull}
              className={`flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-extrabold transition-all active:scale-95 ${
                dark ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
              <Icon name={dark ? 'shrink' : 'expand'} size={18} />
              {dark ? 'خروج' : 'ملء الشاشة'}
            </button>
          </div>
        </section>

        {loading ? (
          <p className={`text-center py-10 font-extrabold animate-pulse ${dark ? 'text-gray-400' : 'text-gray-400'}`}>جاري التحميل...</p>
        ) : !state || teams.length === 0 ? (
          <section className={`card p-10 text-center ${dark ? '!bg-gray-900 !border-gray-800' : ''}`}>
            <p className="text-5xl mb-3">🎪</p>
            <p className={`font-extrabold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>لم يتم تجهيز الخريطة بعد</p>
            {canManage ? (
              <button onClick={() => setShowSetup(true)} className="btn-primary mt-4">⚙️ ابدأ الإعداد: الفرق والغرف والجولات</button>
            ) : (
              <p className={`text-xs font-semibold mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>سيقوم المسؤول بتجهيز الفرق والغرف قريباً</p>
            )}
          </section>
        ) : (
          <>
            {/* ===== TIMER ===== */}
            <section className={`card p-6 flex flex-col items-center ${dark ? '!bg-gray-900 !border-gray-800' : ''}`}>
              <div className="relative" style={{ width: 260, height: 260 }}>
                <svg width="260" height="260" viewBox="0 0 260 260" className="-rotate-90">
                  <circle cx="130" cy="130" r={R} fill="none" strokeWidth="14"
                    className={dark ? 'stroke-gray-800' : 'stroke-violet-50'} />
                  <circle cx="130" cy="130" r={R} fill="none" strokeWidth="14" strokeLinecap="round"
                    stroke={ringColor}
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - progress)}
                    style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[11px] font-extrabold rounded-full px-3 py-1 mb-1 ${
                    dark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
                    الجولة {state.current_round} / {state.total_rounds}
                  </span>
                  <span dir="ltr" className={`text-6xl font-extrabold tabular-nums tracking-tight ${
                    timeUp ? 'text-red-500 animate-pulse' : dark ? 'text-white' : 'text-gray-800'}`}>
                    {fmt(remaining)}
                  </span>
                  <span className={`text-xs font-bold mt-1 ${
                    timeUp ? 'text-red-400' : running ? 'text-emerald-500' : dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {timeUp
                      ? (state.auto_advance && state.current_round < state.total_rounds ? '⏰ انتهت الجولة — انتقال تلقائي...' : '⏰ انتهت الجولة!')
                      : running ? '⏳ الجولة جارية' : paused ? '⏸️ متوقف مؤقتاً' : 'في الانتظار'}
                  </span>
                  <span className={`text-[10px] font-bold mt-0.5 ${dark ? 'text-gray-600' : 'text-gray-300'}`}>
                    {state.auto_advance ? '🔁 تغيير تلقائي للجولات' : '✋ تغيير يدوي للجولات'}
                  </span>
                </div>
              </div>

              {/* stop-ringing (visible to everyone while ringing) */}
              {ringing && (
                <button onClick={stopRinging}
                  className="mt-3 rounded-2xl px-5 py-2.5 text-sm font-extrabold bg-red-600 text-white active:scale-95 transition-all shadow-lg shadow-red-600/30 animate-pulse">
                  🔕 إيقاف الرنين
                </button>
              )}

              {/* ± time adjustment (managers, while timer active) */}
              {canManage && (running || paused || timeUp) && (
                <div className="flex items-center justify-center gap-1.5 mt-4">
                  {[-60, -30].map((d) => (
                    <button key={d} onClick={() => adjustTime(d)}
                      className={`rounded-2xl px-3 py-2 text-xs font-extrabold active:scale-95 transition-all ${
                        dark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-600'}`}>
                      −{Math.abs(d) === 60 ? '١ د' : '٣٠ ث'}
                    </button>
                  ))}
                  <span className={`text-[10px] font-extrabold px-1 ${dark ? 'text-gray-600' : 'text-gray-300'}`}>الوقت</span>
                  {[30, 60].map((d) => (
                    <button key={d} onClick={() => adjustTime(d)}
                      className={`rounded-2xl px-3 py-2 text-xs font-extrabold active:scale-95 transition-all ${
                        dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600'}`}>
                      +{d === 60 ? '١ د' : '٣٠ ث'}
                    </button>
                  ))}
                </div>
              )}

              {/* manager timer controls */}
              {canManage && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button onClick={() => goRound(state.current_round - 1)} disabled={state.current_round <= 1}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-extrabold active:scale-95 transition-all disabled:opacity-30 ${
                      dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'}`}>
                    الجولة السابقة
                  </button>
                  {!running && !paused && (
                    <button onClick={startTimer} className="rounded-2xl px-5 py-2.5 text-sm font-extrabold bg-emerald-600 text-white active:scale-95 transition-all shadow-lg shadow-emerald-600/25">
                      ▶️ ابدأ الجولة
                    </button>
                  )}
                  {running && (
                    <button onClick={pauseTimer} className="rounded-2xl px-5 py-2.5 text-sm font-extrabold bg-amber-500 text-white active:scale-95 transition-all">
                      ⏸️ إيقاف مؤقت
                    </button>
                  )}
                  {paused && (
                    <button onClick={resumeTimer} className="rounded-2xl px-5 py-2.5 text-sm font-extrabold bg-emerald-600 text-white active:scale-95 transition-all">
                      ▶️ استكمال
                    </button>
                  )}
                  {(running || paused || timeUp) && (
                    <button onClick={resetTimer} className={`rounded-2xl px-3 py-2.5 text-sm font-extrabold active:scale-95 transition-all ${
                      dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'}`}>
                      🔄 إعادة
                    </button>
                  )}
                  <button onClick={() => goRound(state.current_round + 1)} disabled={state.current_round >= state.total_rounds}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-extrabold active:scale-95 transition-all disabled:opacity-30 ${
                      timeUp ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30 animate-pulse' : dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'}`}>
                    الجولة التالية ⬅️
                  </button>
                </div>
              )}
            </section>

            {/* ===== TEAMS → ROOMS ===== */}
            <section className="grid gap-2 grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => {
                const room = roomOfTeam(t.id)
                return (
                  <div key={t.id}
                    className={`rounded-3xl border-2 overflow-hidden ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                    <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: t.color }}>
                      <span className="w-2.5 h-2.5 rounded-full bg-white/60 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white font-extrabold text-sm leading-tight truncate">{t.name}</p>
                        {t.leader && <p className="text-white/75 text-[10px] font-bold truncate">👤 {t.leader}</p>}
                      </div>
                    </div>
                    <div className="p-3 text-center">
                      {room ? (
                        <>
                          <p className="text-3xl mb-1">{room.icon}</p>
                          <p className={`font-extrabold text-base leading-tight ${dark ? 'text-white' : 'text-gray-800'}`}>{room.name}</p>
                        </>
                      ) : (
                        <p className={`text-xs font-bold py-3 ${dark ? 'text-gray-600' : 'text-gray-300'}`}>— لم تُحدَّد غرفة —</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          </>
        )}
      </div>

      {/* manager setup modal */}
      {canManage && (
        <SetupModal open={showSetup} onClose={() => setShowSetup(false)}
          state={state} teams={teams} rooms={rooms} assignments={assignments} reload={load} />
      )}
    </div>
  )
}

/* ================= Manager setup modal ================= */
function SetupModal({ open, onClose, state, teams, rooms, assignments, reload }: {
  open: boolean; onClose: () => void
  state: CarnivalState | null
  teams: CarnivalTeam[]; rooms: CarnivalRoom[]; assignments: CarnivalAssignment[]
  reload: () => void
}) {
  const [tab, setTab] = useState<'settings' | 'teams' | 'rooms' | 'plan'>('settings')

  // settings form
  const [title, setTitle] = useState('')
  const [roundMin, setRoundMin] = useState('10')
  const [roundSec, setRoundSec] = useState('0')
  const [totalRounds, setTotalRounds] = useState('3')
  const [autoAdvance, setAutoAdvance] = useState(false)
  useEffect(() => {
    if (!open) return
    setTitle(state?.title || 'الخريطة التفاعلية')
    const rs = state?.round_seconds ?? 600
    setRoundMin(String(Math.floor(rs / 60)))
    setRoundSec(String(rs % 60))
    setTotalRounds(String(state?.total_rounds ?? 3))
    setAutoAdvance(!!state?.auto_advance)
  }, [open, state])

  const saveSettings = async () => {
    const supabase = getSupabase()
    const secs = Math.max(10, (parseInt(roundMin) || 0) * 60 + (parseInt(roundSec) || 0))
    const total = Math.min(50, Math.max(1, parseInt(totalRounds) || 1))
    await supabase.from('carnival_state').upsert({
      id: 1, title: title.trim() || 'الخريطة التفاعلية',
      round_seconds: secs, total_rounds: total,
      auto_advance: autoAdvance,
      current_round: Math.min(state?.current_round ?? 1, total),
      updated_at: new Date().toISOString(),
    })
    reload()
  }

  // teams form
  const [teamName, setTeamName] = useState('')
  const [teamLeader, setTeamLeader] = useState('')
  const addTeam = async () => {
    if (!teamName.trim()) return
    const supabase = getSupabase()
    const color = TEAM_COLORS[teams.length % TEAM_COLORS.length]
    await supabase.from('carnival_teams').insert({
      name: teamName.trim(), leader: teamLeader.trim() || null,
      color, sort_order: teams.length,
    })
    setTeamName(''); setTeamLeader('')
    reload()
  }
  const delTeam = async (id: string) => {
    await getSupabase().from('carnival_teams').delete().eq('id', id)
    reload()
  }
  const setTeamColor = async (id: string, color: string) => {
    await getSupabase().from('carnival_teams').update({ color }).eq('id', id)
    reload()
  }

  // تعديل فريق (الاسم + القائد)
  const [editTeamId, setEditTeamId] = useState<string | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamLeader, setEditTeamLeader] = useState('')
  const beginEditTeam = (t: CarnivalTeam) => {
    setEditTeamId(t.id); setEditTeamName(t.name); setEditTeamLeader(t.leader || '')
  }
  const saveEditTeam = async () => {
    if (!editTeamId || !editTeamName.trim()) return
    await getSupabase().from('carnival_teams').update({
      name: editTeamName.trim(), leader: editTeamLeader.trim() || null,
    }).eq('id', editTeamId)
    setEditTeamId(null)
    reload()
  }

  // rooms form
  const [roomName, setRoomName] = useState('')
  const [roomIcon, setRoomIcon] = useState('🎪')
  const addRoom = async () => {
    if (!roomName.trim()) return
    await getSupabase().from('carnival_rooms').insert({
      name: roomName.trim(), icon: roomIcon, sort_order: rooms.length,
    })
    setRoomName('')
    reload()
  }
  const delRoom = async (id: string) => {
    await getSupabase().from('carnival_rooms').delete().eq('id', id)
    reload()
  }

  // تعديل غرفة (الاسم + الأيقونة)
  const [editRoomId, setEditRoomId] = useState<string | null>(null)
  const [editRoomName, setEditRoomName] = useState('')
  const [editRoomIcon, setEditRoomIcon] = useState('🎪')
  const beginEditRoom = (r: CarnivalRoom) => {
    setEditRoomId(r.id); setEditRoomName(r.name); setEditRoomIcon(r.icon)
  }
  const saveEditRoom = async () => {
    if (!editRoomId || !editRoomName.trim()) return
    await getSupabase().from('carnival_rooms').update({
      name: editRoomName.trim(), icon: editRoomIcon,
    }).eq('id', editRoomId)
    setEditRoomId(null)
    reload()
  }

  // plan (assignments)
  const [planRound, setPlanRound] = useState(1)
  useEffect(() => { if (open) setPlanRound(state?.current_round ?? 1) }, [open, state?.current_round])
  const total = state?.total_rounds ?? 1

  const assignmentOf = (teamId: string) =>
    assignments.find((a) => a.round === planRound && a.team_id === teamId)?.room_id || ''

  const setAssignment = async (teamId: string, roomId: string) => {
    const supabase = getSupabase()
    if (!roomId) {
      await supabase.from('carnival_assignments').delete().eq('round', planRound).eq('team_id', teamId)
    } else {
      await supabase.from('carnival_assignments').upsert(
        { round: planRound, team_id: teamId, room_id: roomId },
        { onConflict: 'round,team_id' })
    }
    reload()
  }

  // rotate: shift each team's room by one (based on round 1 order)
  const autoRotate = async () => {
    if (rooms.length === 0 || teams.length === 0) return
    const supabase = getSupabase()
    const base = assignments.filter((a) => a.round === 1)
    if (base.length === 0) return
    const roomOrder = rooms.map((r) => r.id)
    const rows: { round: number; team_id: string; room_id: string }[] = []
    for (let r = 2; r <= total; r++) {
      base.forEach((a) => {
        const idx = roomOrder.indexOf(a.room_id)
        if (idx === -1) return
        rows.push({ round: r, team_id: a.team_id, room_id: roomOrder[(idx + r - 1) % roomOrder.length] })
      })
    }
    if (rows.length) await supabase.from('carnival_assignments').upsert(rows, { onConflict: 'round,team_id' })
    reload()
  }

  const roomUsedBy = (roomId: string) =>
    assignments.filter((a) => a.round === planRound && a.room_id === roomId)
      .map((a) => teams.find((t) => t.id === a.team_id)?.name).filter(Boolean)

  return (
    <Modal open={open} onClose={onClose} title="⚙️ إعداد الخريطة التفاعلية">
      {/* tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {([
          ['settings', '⏱️ الإعدادات'],
          ['teams', `👥 الفرق (${teams.length})`],
          ['rooms', `🚪 الغرف (${rooms.length})`],
          ['plan', '🗺️ توزيع الجولات'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`chip ${tab === k ? 'chip-on' : 'chip-off'}`}>{label}</button>
        ))}
      </div>

      {/* ---- settings ---- */}
      {tab === 'settings' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-extrabold text-gray-500 mb-1 block">عنوان الخريطة</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-extrabold text-gray-500 mb-1 block">دقائق الجولة</label>
              <input className="input text-center" type="number" min={0} value={roundMin} onChange={(e) => setRoundMin(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-extrabold text-gray-500 mb-1 block">ثوانٍ</label>
              <input className="input text-center" type="number" min={0} max={59} value={roundSec} onChange={(e) => setRoundSec(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-extrabold text-gray-500 mb-1 block">عدد الجولات</label>
              <input className="input text-center" type="number" min={1} max={50} value={totalRounds} onChange={(e) => setTotalRounds(e.target.value)} />
            </div>
          </div>

          {/* وضع تغيير الجولة */}
          <div>
            <label className="text-xs font-extrabold text-gray-500 mb-1.5 block">تغيير الجولة عند انتهاء الوقت</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAutoAdvance(false)}
                className={`rounded-2xl border-2 p-3 text-right transition-all active:scale-[0.98] ${
                  !autoAdvance ? 'border-violet-600 bg-violet-50' : 'border-gray-100 bg-white'}`}>
                <p className={`font-extrabold text-sm ${!autoAdvance ? 'text-violet-700' : 'text-gray-600'}`}>✋ يدوي</p>
                <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-relaxed">يرنّ الجرس وينتظر حتى تضغط «الجولة التالية» بنفسك</p>
              </button>
              <button type="button" onClick={() => setAutoAdvance(true)}
                className={`rounded-2xl border-2 p-3 text-right transition-all active:scale-[0.98] ${
                  autoAdvance ? 'border-violet-600 bg-violet-50' : 'border-gray-100 bg-white'}`}>
                <p className={`font-extrabold text-sm ${autoAdvance ? 'text-violet-700' : 'text-gray-600'}`}>🔁 تلقائي</p>
                <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-relaxed">يرنّ الجرس ثم ينتقل للجولة التالية ويبدأ العدّ تلقائياً</p>
              </button>
            </div>
          </div>

          <button onClick={saveSettings} className="btn-primary w-full">💾 حفظ الإعدادات</button>
        </div>
      )}

      {/* ---- teams ---- */}
      {tab === 'teams' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="اسم الفريق *" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <input className="input" placeholder="قائد الفريق (اختياري)" value={teamLeader} onChange={(e) => setTeamLeader(e.target.value)} />
          </div>
          <button onClick={addTeam} disabled={!teamName.trim()} className="btn-primary w-full">➕ إضافة فريق</button>
          <div className="space-y-2">
            {teams.map((t) => (
              editTeamId === t.id ? (
                <div key={t.id} className="rounded-2xl border-2 border-violet-300 bg-violet-50/50 p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input !py-2" placeholder="اسم الفريق *" value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)} autoFocus />
                    <input className="input !py-2" placeholder="قائد الفريق" value={editTeamLeader}
                      onChange={(e) => setEditTeamLeader(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEditTeam} disabled={!editTeamName.trim()}
                      className="flex-1 rounded-xl bg-violet-600 text-white font-extrabold py-2 text-xs active:scale-95 transition-all disabled:opacity-50">✔️ حفظ</button>
                    <button onClick={() => setEditTeamId(null)}
                      className="flex-1 rounded-xl bg-gray-100 text-gray-500 font-extrabold py-2 text-xs active:scale-95 transition-all">إلغاء</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="flex items-center gap-2 rounded-2xl border-2 border-gray-100 p-2.5">
                  <input type="color" value={t.color} onChange={(e) => setTeamColor(t.id, e.target.value)}
                    className="w-8 h-8 rounded-xl border-0 cursor-pointer shrink-0" style={{ background: t.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm text-gray-800 truncate">{t.name}</p>
                    {t.leader && <p className="text-[11px] font-bold text-gray-400 truncate">👤 {t.leader}</p>}
                  </div>
                  <button onClick={() => beginEditTeam(t)} className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 shrink-0 active:scale-95 flex items-center justify-center" title="تعديل">
                    ✏️
                  </button>
                  <button onClick={() => delTeam(t.id)} className="w-8 h-8 rounded-xl bg-red-50 text-red-500 font-bold shrink-0 active:scale-95">✕</button>
                </div>
              )
            ))}
            {teams.length === 0 && <p className="text-center text-xs font-bold text-gray-300 py-3">لا توجد فرق بعد</p>}
          </div>
        </div>
      )}

      {/* ---- rooms ---- */}
      {tab === 'rooms' && (
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {ROOM_ICONS.map((ic) => (
              <button key={ic} onClick={() => setRoomIcon(ic)}
                className={`w-10 h-10 rounded-xl text-xl transition-all active:scale-90 ${roomIcon === ic ? 'bg-violet-600 shadow-lg shadow-violet-600/30 scale-110' : 'bg-gray-50'}`}>{ic}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="اسم الغرفة *" value={roomName} onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRoom()} />
            <button onClick={addRoom} disabled={!roomName.trim()} className="btn-primary shrink-0">➕</button>
          </div>
          <div className="space-y-2">
            {rooms.map((r) => (
              editRoomId === r.id ? (
                <div key={r.id} className="rounded-2xl border-2 border-violet-300 bg-violet-50/50 p-2.5 space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    {ROOM_ICONS.map((ic) => (
                      <button key={ic} onClick={() => setEditRoomIcon(ic)}
                        className={`w-8 h-8 rounded-lg text-base transition-all active:scale-90 ${editRoomIcon === ic ? 'bg-violet-600 scale-110' : 'bg-white'}`}>{ic}</button>
                    ))}
                  </div>
                  <input className="input !py-2" placeholder="اسم الغرفة *" value={editRoomName}
                    onChange={(e) => setEditRoomName(e.target.value)} autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveEditRoom()} />
                  <div className="flex gap-2">
                    <button onClick={saveEditRoom} disabled={!editRoomName.trim()}
                      className="flex-1 rounded-xl bg-violet-600 text-white font-extrabold py-2 text-xs active:scale-95 transition-all disabled:opacity-50">✔️ حفظ</button>
                    <button onClick={() => setEditRoomId(null)}
                      className="flex-1 rounded-xl bg-gray-100 text-gray-500 font-extrabold py-2 text-xs active:scale-95 transition-all">إلغاء</button>
                  </div>
                </div>
              ) : (
                <div key={r.id} className="flex items-center gap-2 rounded-2xl border-2 border-gray-100 p-2.5">
                  <span className="text-2xl shrink-0">{r.icon}</span>
                  <p className="flex-1 font-extrabold text-sm text-gray-800 truncate">{r.name}</p>
                  <button onClick={() => beginEditRoom(r)} className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 shrink-0 active:scale-95 flex items-center justify-center" title="تعديل">
                    ✏️
                  </button>
                  <button onClick={() => delRoom(r.id)} className="w-8 h-8 rounded-xl bg-red-50 text-red-500 font-bold shrink-0 active:scale-95">✕</button>
                </div>
              )
            ))}
            {rooms.length === 0 && <p className="text-center text-xs font-bold text-gray-300 py-3">لا توجد غرف بعد</p>}
          </div>
        </div>
      )}

      {/* ---- plan ---- */}
      {tab === 'plan' && (
        <div className="space-y-3">
          {teams.length === 0 || rooms.length === 0 ? (
            <p className="text-center text-xs font-bold text-gray-400 py-6">أضف الفرق والغرف أولاً ثم عُد هنا للتوزيع</p>
          ) : (
            <>
              {/* round selector */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {Array.from({ length: total }, (_, i) => i + 1).map((r) => (
                  <button key={r} onClick={() => setPlanRound(r)}
                    className={`chip ${planRound === r ? 'chip-on' : 'chip-off'}`}>جولة {r}</button>
                ))}
              </div>

              {/* team → room selects */}
              <div className="space-y-2">
                {teams.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                    <p className="w-24 font-extrabold text-xs text-gray-700 truncate shrink-0">{t.name}</p>
                    <select className="input !py-2.5 flex-1" value={assignmentOf(t.id)}
                      onChange={(e) => setAssignment(t.id, e.target.value)}>
                      <option value="">— اختر الغرفة —</option>
                      {rooms.map((r) => {
                        const used = roomUsedBy(r.id)
                        const takenByOther = used.length > 0 && assignmentOf(t.id) !== r.id
                        return (
                          <option key={r.id} value={r.id}>
                            {r.icon} {r.name}{takenByOther ? ` (محجوزة: ${used.join('، ')})` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                ))}
              </div>

              {total > 1 && (
                <button onClick={autoRotate}
                  className="w-full rounded-2xl bg-violet-50 text-violet-700 font-extrabold py-3 text-sm active:scale-95 transition-all">
                  🔁 توزيع تلقائي لباقي الجولات (تدوير حسب الجولة 1)
                </button>
              )}
              <p className="text-[10px] font-bold text-gray-400 text-center">
                التوزيع التلقائي: كل فريق ينتقل للغرفة التالية في كل جولة بناءً على توزيع الجولة الأولى
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
