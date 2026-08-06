'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import QRCode from 'qrcode'
import { getSupabase } from '@/lib/supabase'

// كارت واحد
type CardData = { code: string }

// المساحة المتاحة داخل صفحة A4 بعد الهوامش (210-8*2) × (297-10*2)
const PAGE_W = 194
const PAGE_H = 277

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ===== إعدادات التصميم القابلة للحفظ في البروفايل =====
type CardSettings = {
  pad: number
  title: string          // نص الهيدر (نفسه في النصفين)
  footerTitle: string    // نص الفوتر (نفسه في النصفين)
  iconUrl: string
  gapX: number
  gapY: number
  cardW: number        // عرض الكارت (مم)
  cardH: number        // ارتفاع الكارت (مم)
  cardBg: string
  // تدرج خلفية الكارت
  bgMode: 'solid' | 'gradient'
  cardBgTo: string
  bgAngle: number      // زاوية التدرج (درجات)
  // تدرج الهيدر
  headerFrom: string
  headerTo: string
  headerTextColor: string
  headerHeight: number   // ارتفاع الهيدر (مم)
  // تدرج الفوتر
  footerFrom: string
  footerTo: string
  footerTextColor: string
  footerHeight: number   // ارتفاع الفوتر (مم)
  // حواف الكارت
  borderWidth: number // بالنقاط (px)
  borderColor: string
  borderStyle: 'solid' | 'dashed'
  // موضع خط القص: عرض النصف الأول (كارت ولي الأمر) كنسبة مئوية
  cutPos: number
}

const DEFAULT_SETTINGS: CardSettings = {
  pad: 3,
  title: 'نهضة الملايكة 2026',
  footerTitle: 'كنيسة العذراء مريم — الأقصر',
  iconUrl: '',
  gapX: 4,
  gapY: 4,
  cardW: 95,
  cardH: 52,
  cardBg: '#ffffff',
  bgMode: 'solid',
  cardBgTo: '#f5f3ff',
  bgAngle: 135,
  headerFrom: '#7c3aed',
  headerTo: '#a855f7',
  headerTextColor: '#ffffff',
  headerHeight: 8,
  footerFrom: '#a855f7',
  footerTo: '#7c3aed',
  footerTextColor: '#ffffff',
  footerHeight: 6,
  borderWidth: 1.5,
  borderColor: '#7c3aed',
  borderStyle: 'solid',
  cutPos: 50,
}

type CardProfile = {
  id: string
  name: string
  prefix: string
  settings: Partial<CardSettings>
}

type PrintCounter = { prefix: string; last_printed_no: number; updated_at: string }

// مكوّن مساعد: منتقي لون (منتقي + حقل نصي) — خارج الصفحة حتى لا يفقد الحقل التركيز
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 shrink-0 rounded-xl border border-violet-100 cursor-pointer bg-white p-1" />
        <input className="input flex-1 min-w-0" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}

export default function PrintCardsPage() {
  const [prefix, setPrefix] = useState('NM-')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(20)
  const [s, setS] = useState<CardSettings>(DEFAULT_SETTINGS)
  const set = <K extends keyof CardSettings>(k: K, v: CardSettings[K]) => setS((p) => ({ ...p, [k]: v }))

  const [cards, setCards] = useState<CardData[]>([])
  const [qrMap, setQrMap] = useState<Record<string, string>>({}) // code -> dataURL
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // ===== البروفايلات والعدّادات =====
  const [profiles, setProfiles] = useState<CardProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileName, setProfileName] = useState('')
  const [counters, setCounters] = useState<PrintCounter[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [recording, setRecording] = useState(false)
  const [printedRange, setPrintedRange] = useState<{ prefix: string; to: number } | null>(null)

  const loadRemote = useCallback(async () => {
    try {
      const sb = getSupabase()
      const [{ data: profs }, { data: cnts }] = await Promise.all([
        sb.from('card_profiles').select('id, name, prefix, settings').order('name'),
        sb.from('card_print_counters').select('prefix, last_printed_no, updated_at').order('prefix'),
      ])
      if (profs) setProfiles(profs as CardProfile[])
      if (cnts) setCounters(cnts as PrintCounter[])
    } catch {
      /* بدون اتصال — نتجاهل */
    }
  }, [])

  useEffect(() => { loadRemote() }, [loadRemote])

  const counterFor = useCallback(
    (p: string) => counters.find((c) => c.prefix === p.trim())?.last_printed_no ?? null,
    [counters]
  )

  const applyProfile = (id: string) => {
    setSelectedProfileId(id)
    const p = profiles.find((x) => x.id === id)
    if (!p) return
    setPrefix(p.prefix)
    setProfileName(p.name)
    // توافق مع البروفايلات القديمة (headerText/footerText → headerTextColor/footerTextColor)
    const legacy = (p.settings || {}) as any
    const migrated: Partial<CardSettings> = { ...legacy }
    if (legacy.headerText && !legacy.headerTextColor) migrated.headerTextColor = legacy.headerText
    if (legacy.footerText && !legacy.footerTextColor) migrated.footerTextColor = legacy.footerText
    setS({ ...DEFAULT_SETTINGS, ...migrated })
    // اقتراح البداية بعد آخر رقم مطبوع لهذه البادئة
    const last = counters.find((c) => c.prefix === p.prefix.trim())?.last_printed_no
    if (last && last > 0) { setFrom(last + 1); setTo(last + 20) }
    setMsg(`تم تحميل بروفايل «${p.name}»`)
  }

  const saveProfile = async (asNew: boolean) => {
    setErr(''); setMsg('')
    const name = profileName.trim()
    if (!name) { setErr('اكتب اسماً للبروفايل'); return }
    if (!prefix.trim()) { setErr('اكتب البادئة (Prefix) المرتبطة بالبروفايل'); return }
    setSavingProfile(true)
    try {
      const sb = getSupabase()
      const payload = { name, prefix: prefix.trim(), settings: s as any }
      if (!asNew && selectedProfileId) {
        const { error } = await sb.from('card_profiles')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', selectedProfileId)
        if (error) throw error
        setMsg(`تم تحديث بروفايل «${name}»`)
      } else {
        const { data, error } = await sb.from('card_profiles').insert(payload).select('id').single()
        if (error) throw error
        if (data?.id) setSelectedProfileId(data.id)
        setMsg(`تم حفظ بروفايل «${name}»`)
      }
      await loadRemote()
    } catch (e: any) {
      setErr(e?.message?.includes('duplicate') ? 'يوجد بروفايل بنفس الاسم' : (e?.message || 'تعذّر حفظ البروفايل'))
    } finally { setSavingProfile(false) }
  }

  const deleteProfile = async () => {
    if (!selectedProfileId) return
    if (!confirm('حذف هذا البروفايل نهائياً؟')) return
    try {
      const sb = getSupabase()
      const { error } = await sb.from('card_profiles').delete().eq('id', selectedProfileId)
      if (error) throw error
      setSelectedProfileId(''); setProfileName('')
      setMsg('تم حذف البروفايل')
      await loadRemote()
    } catch (e: any) { setErr(e?.message || 'تعذّر الحذف') }
  }

  const totalRequested = useMemo(() => {
    const f = Number(from), t = Number(to)
    if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0
    return t - f + 1
  }, [from, to])

  const makeCode = useCallback((n: number) => {
    const num = s.pad > 0 ? String(n).padStart(s.pad, '0') : String(n)
    return `${prefix}${num}`
  }, [prefix, s.pad])

  // اختيار أيقونة من الجهاز → data URL
  const onPickIcon = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('iconUrl', String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const generate = async () => {
    setErr(''); setMsg('')
    const f = Number(from), t = Number(to)
    if (!prefix.trim() && s.pad === 0) { setErr('اكتب البادئة أو فعّل التعبئة بالأصفار'); return }
    if (!Number.isFinite(f) || !Number.isFinite(t)) { setErr('أدخل أرقاماً صحيحة للنطاق'); return }
    if (t < f) { setErr('نهاية النطاق يجب أن تكون أكبر من أو تساوي البداية'); return }
    if (t - f + 1 > 1000) { setErr('النطاق كبير جداً (الحد الأقصى 1000 كارت)'); return }

    setBusy(true)
    try {
      const list: CardData[] = []
      for (let n = f; n <= t; n++) list.push({ code: makeCode(n) })

      // توليد صور QR لكل كود
      const map: Record<string, string> = {}
      await Promise.all(
        list.map(async (c) => {
          map[c.code] = await QRCode.toDataURL(c.code, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 256,
            color: { dark: '#1e1b4b', light: '#ffffff' },
          })
        })
      )
      setQrMap(map)
      setCards(list)
      setPrintedRange({ prefix: prefix.trim(), to: t })
    } catch (e: any) {
      setErr(e?.message || 'حدث خطأ أثناء التوليد')
    } finally {
      setBusy(false)
    }
  }

  // تسجيل «تمت الطباعة حتى رقم …» لهذه البادئة
  const recordPrinted = async () => {
    if (!printedRange) return
    setRecording(true); setErr(''); setMsg('')
    try {
      const sb = getSupabase()
      const { data, error } = await sb.rpc('record_cards_printed', {
        p_prefix: printedRange.prefix,
        p_last_no: printedRange.to,
      })
      if (error) throw error
      setMsg(`✅ تم التسجيل: بادئة «${printedRange.prefix}» مطبوعة حتى رقم ${data ?? printedRange.to}`)
      await loadRemote()
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تسجيل الطباعة (تأكد من تنفيذ migration_v7)')
    } finally { setRecording(false) }
  }

  // حساب عدد الأعمدة/الصفوف حسب أبعاد الكارت والمسافات
  const layout = useMemo(() => {
    const cw = Math.max(30, Math.min(PAGE_W, s.cardW))
    const ch = Math.max(20, Math.min(PAGE_H, s.cardH))
    const cols = Math.max(1, Math.floor((PAGE_W + s.gapX) / (cw + s.gapX)))
    const rows = Math.max(1, Math.floor((PAGE_H + s.gapY) / (ch + s.gapY)))
    return { cw, ch, cols, rows, perPage: cols * rows }
  }, [s.cardW, s.cardH, s.gapX, s.gapY])

  const pages = useMemo(() => chunk(cards, layout.perPage), [cards, layout.perPage])

  const headerGrad = `linear-gradient(90deg, ${s.headerFrom}, ${s.headerTo})`
  const footerGrad = `linear-gradient(90deg, ${s.footerFrom}, ${s.footerTo})`
  const cardBgCss = s.bgMode === 'gradient'
    ? `linear-gradient(${s.bgAngle}deg, ${s.cardBg}, ${s.cardBgTo})`
    : s.cardBg
  const cardBorder = `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}`
  const lastForCurrent = counterFor(prefix)

  // نصف الكارت: هيدر متدرج → (pill أبيض للتسمية + QR أبيض + pill أبيض للكود) → فوتر متدرج
  const half = (code: string, label: string, widthPct: number) => (
    <div className="card-half" style={{ flexBasis: `${widthPct}%`, maxWidth: `${widthPct}%` }}>
      <div className="half-header" style={{ background: headerGrad, color: s.headerTextColor, height: `${s.headerHeight}mm` }}>
        {s.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.iconUrl} alt="" className="card-icon" />
        ) : null}
        <span className="card-title" style={{ color: s.headerTextColor }}>{s.title}</span>
      </div>
      <div className="half-body">
        <div className="card-pill">{label}</div>
        <div className="qr-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrMap[code]} alt={code} className="qr-img" />
        </div>
        <div className="card-pill" dir="ltr">{code}</div>
      </div>
      <div className="half-footer" style={{ background: footerGrad, color: s.footerTextColor, height: `${s.footerHeight}mm` }}>{s.footerTitle}</div>
    </div>
  )

  return (
    <div className="p-4 space-y-4 print-root">
      {/* ===== البروفايلات (لا تُطبع) ===== */}
      <div className="card p-5 space-y-3 no-print">
        <div>
          <h2 className="text-lg font-extrabold text-gray-800">البروفايلات</h2>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">
            احفظ إعدادات التصميم مع البادئة الخاصة بها، واسترجعها في أي وقت
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">تحميل بروفايل</label>
            <select className="input" value={selectedProfileId} onChange={(e) => applyProfile(e.target.value)}>
              <option value="">— اختر بروفايل —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.prefix})</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">اسم البروفايل</label>
            <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="مثال: كروت ابتدائي 2026" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => saveProfile(true)} disabled={savingProfile} className="btn-primary text-sm px-4">
            {savingProfile ? '...' : '＋ حفظ كبروفايل جديد'}
          </button>
          {selectedProfileId && (
            <>
              <button onClick={() => saveProfile(false)} disabled={savingProfile} className="btn-soft text-sm px-4">💾 تحديث البروفايل</button>
              <button onClick={deleteProfile} className="text-sm font-bold text-rose-500 px-3">🗑 حذف</button>
            </>
          )}
        </div>

        {/* عدّادات الطباعة لكل بادئة */}
        {counters.length > 0 && (
          <div className="pt-2 border-t border-violet-50">
            <p className="text-xs font-extrabold text-gray-600 mb-2">📊 آخر رقم مطبوع لكل بادئة:</p>
            <div className="flex flex-wrap gap-2">
              {counters.map((c) => (
                <button key={c.prefix}
                  onClick={() => { setPrefix(c.prefix); setFrom(c.last_printed_no + 1); setTo(c.last_printed_no + 20) }}
                  className="text-xs font-bold bg-violet-50 text-violet-700 rounded-xl px-3 py-2 hover:bg-violet-100"
                  title="اضغط لبدء الترقيم بعد آخر رقم مطبوع">
                  <span dir="ltr">{c.prefix}</span> → حتى رقم <b>{c.last_printed_no}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== لوحة الإعدادات (لا تُطبع) ===== */}
      <div className="card p-5 space-y-4 no-print">
        <div>
          <h2 className="text-lg font-extrabold text-gray-800">إعدادات الكروت</h2>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">
            كل كارت نصفان متطابقان (كارت ولي الأمر + كارت الطفل) يُقصّان رأسياً — التوزيع الحالي: {layout.cols}×{layout.rows} = {layout.perPage} كارت في صفحة A4
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">البادئة (Prefix)</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="مثال: NM-" />
            {lastForCurrent !== null && (
              <p className="text-[11px] font-bold text-violet-600 mt-1">
                آخر رقم مطبوع لهذه البادئة: {lastForCurrent} — الرقم التالي: {lastForCurrent + 1}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">من رقم</label>
            <input className="input" type="number" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">إلى رقم</label>
            <input className="input" type="number" value={to} onChange={(e) => setTo(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">خانات الرقم (أصفار)</label>
            <input className="input" type="number" min={0} max={8} value={s.pad} onChange={(e) => set('pad', Math.max(0, Math.min(8, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">مثال على الكود</label>
            <div className="input flex items-center !bg-violet-50 !border-violet-100 text-violet-700 font-extrabold" dir="ltr">
              {makeCode(Number(from) || 0)}
            </div>
          </div>
          {/* ===== أبعاد الكارت ===== */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">عرض الكارت (مم)</label>
            <input className="input" type="number" min={30} max={194} step={0.5} value={s.cardW} onChange={(e) => set('cardW', Math.max(30, Math.min(194, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">ارتفاع الكارت (مم)</label>
            <input className="input" type="number" min={20} max={277} step={0.5} value={s.cardH} onChange={(e) => set('cardH', Math.max(20, Math.min(277, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">المسافة الأفقية بين الكروت (مم)</label>
            <input className="input" type="number" min={0} max={20} step={0.5} value={s.gapX} onChange={(e) => set('gapX', Math.max(0, Math.min(20, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">المسافة الرأسية بين الكروت (مم)</label>
            <input className="input" type="number" min={0} max={20} step={0.5} value={s.gapY} onChange={(e) => set('gapY', Math.max(0, Math.min(20, Number(e.target.value))))} />
          </div>

          <div className="col-span-2">
            <p className="text-[11px] font-bold text-violet-600 bg-violet-50 rounded-xl px-3 py-2">
              📐 التوزيع: {layout.cols} عمود × {layout.rows} صف = <b>{layout.perPage}</b> كارت في الصفحة (مساحة A4 المتاحة: {PAGE_W}×{PAGE_H} مم)
            </p>
          </div>

          {/* ===== خلفية الكارت ===== */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">نوع الخلفية</label>
            <select className="input" value={s.bgMode} onChange={(e) => set('bgMode', e.target.value as 'solid' | 'gradient')}>
              <option value="solid">لون واحد</option>
              <option value="gradient">تدرج لونين</option>
            </select>
          </div>
          <ColorField label={s.bgMode === 'gradient' ? 'خلفية الكارت — بداية التدرج' : 'لون خلفية الكارت'} value={s.cardBg} onChange={(v) => set('cardBg', v)} />
          {s.bgMode === 'gradient' && (
            <>
              <ColorField label="خلفية الكارت — نهاية التدرج" value={s.cardBgTo} onChange={(v) => set('cardBgTo', v)} />
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">زاوية التدرج: <span className="text-violet-600">{s.bgAngle}°</span></label>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={360} step={5} value={s.bgAngle}
                    onChange={(e) => set('bgAngle', Number(e.target.value))} className="flex-1 accent-violet-600" />
                  <input className="input !w-20 text-center" type="number" min={0} max={360} value={s.bgAngle}
                    onChange={(e) => set('bgAngle', Math.max(0, Math.min(360, Number(e.target.value))))} />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">معاينة خلفية الكارت</label>
                <div className="rounded-xl h-10 border border-violet-100" style={{ background: cardBgCss }} />
              </div>
            </>
          )}

          {/* ===== حواف الكارت ===== */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">سمك الحواف (px)</label>
            <input className="input" type="number" min={0} max={10} step={0.5} value={s.borderWidth} onChange={(e) => set('borderWidth', Math.max(0, Math.min(10, Number(e.target.value))))} />
          </div>
          <ColorField label="لون الحواف" value={s.borderColor} onChange={(v) => set('borderColor', v)} />
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">نمط الحواف</label>
            <select className="input" value={s.borderStyle} onChange={(e) => set('borderStyle', e.target.value as 'solid' | 'dashed')}>
              <option value="solid">متصل</option>
              <option value="dashed">متقطع</option>
            </select>
          </div>

          {/* ===== موضع خط القص ===== */}
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              موضع خط القص — عرض كارت ولي الأمر: <span className="text-violet-600">{s.cutPos}%</span> · كارت الطفل: <span className="text-violet-600">{100 - s.cutPos}%</span>
            </label>
            <div className="flex items-center gap-3">
              <input type="range" min={20} max={80} step={1} value={s.cutPos}
                onChange={(e) => set('cutPos', Number(e.target.value))} className="flex-1 accent-violet-600" />
              <input className="input !w-20 text-center" type="number" min={20} max={80} value={s.cutPos}
                onChange={(e) => set('cutPos', Math.max(20, Math.min(80, Number(e.target.value))))} />
              <button onClick={() => set('cutPos', 50)} className="text-xs font-bold text-gray-400">منتصف</button>
            </div>
          </div>

          {/* ===== الهيدر ===== */}
          <div className="col-span-2 pt-1">
            <p className="text-xs font-extrabold text-gray-600">🎨 الهيدر (أعلى الكارت)</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">نص الهيدر (يظهر في النصفين)</label>
            <input className="input text-center font-extrabold" value={s.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <ColorField label="بداية التدرج" value={s.headerFrom} onChange={(v) => set('headerFrom', v)} />
          <ColorField label="نهاية التدرج" value={s.headerTo} onChange={(v) => set('headerTo', v)} />
          <ColorField label="لون نص الهيدر" value={s.headerTextColor} onChange={(v) => set('headerTextColor', v)} />
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">ارتفاع الهيدر (مم)</label>
            <input className="input" type="number" min={3} max={20} step={0.5} value={s.headerHeight}
              onChange={(e) => set('headerHeight', Math.max(3, Math.min(20, Number(e.target.value))))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">معاينة الهيدر</label>
            <div className="rounded-xl flex items-center justify-center text-xs font-extrabold"
              style={{ background: headerGrad, color: s.headerTextColor, height: `${Math.max(24, s.headerHeight * 4)}px` }}>{s.title || 'العنوان'}</div>
          </div>

          {/* ===== الفوتر ===== */}
          <div className="col-span-2 pt-1">
            <p className="text-xs font-extrabold text-gray-600">🎨 الفوتر (أسفل الكارت)</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">نص الفوتر (يظهر في النصفين)</label>
            <input className="input text-center font-extrabold" value={s.footerTitle} onChange={(e) => set('footerTitle', e.target.value)} />
          </div>
          <ColorField label="بداية التدرج" value={s.footerFrom} onChange={(v) => set('footerFrom', v)} />
          <ColorField label="نهاية التدرج" value={s.footerTo} onChange={(v) => set('footerTo', v)} />
          <ColorField label="لون نص الفوتر" value={s.footerTextColor} onChange={(v) => set('footerTextColor', v)} />
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">ارتفاع الفوتر (مم)</label>
            <input className="input" type="number" min={3} max={20} step={0.5} value={s.footerHeight}
              onChange={(e) => set('footerHeight', Math.max(3, Math.min(20, Number(e.target.value))))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">معاينة الفوتر</label>
            <div className="rounded-xl flex items-center justify-center text-xs font-extrabold"
              style={{ background: footerGrad, color: s.footerTextColor, height: `${Math.max(24, s.footerHeight * 4)}px` }}>{s.footerTitle || 'نص الفوتر'}</div>
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">الأيقونة (شعار الكارت)</label>
            <div className="flex items-center gap-3">
              <label className="btn-soft cursor-pointer text-sm">
                اختر صورة
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickIcon(e.target.files?.[0] || null)} />
              </label>
              {s.iconUrl ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.iconUrl} alt="icon" className="w-10 h-10 rounded-xl object-contain border border-violet-100 bg-white" />
                  <button onClick={() => set('iconUrl', '')} className="text-xs font-bold text-rose-500">إزالة</button>
                </div>
              ) : (
                <span className="text-xs text-gray-400 font-semibold">لم تُحدَّد أيقونة بعد</span>
              )}
            </div>
          </div>
        </div>

        {err && <p className="text-sm font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</p>}
        {msg && <p className="text-sm font-bold text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2">{msg}</p>}

        <div className="flex items-center gap-3">
          <button onClick={generate} disabled={busy} className="btn-primary flex-1">
            {busy ? 'جارٍ التوليد...' : `توليد ${totalRequested} كارت`}
          </button>
          {cards.length > 0 && (
            <button onClick={() => window.print()} className="btn-soft px-6">🖨️ طباعة</button>
          )}
        </div>

        {cards.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2 text-center">
              ✅ تم توليد {cards.length} كارت على {pages.length} صفحة A4 — اضغط «طباعة» ثم اختر A4 وهوامش صفرية
            </p>
            {printedRange && (
              <button onClick={recordPrinted} disabled={recording}
                className="w-full text-sm font-extrabold bg-violet-600 text-white rounded-xl px-3 py-2.5 hover:bg-violet-700 disabled:opacity-60">
                {recording ? '...' : `📌 تسجيل: بادئة «${printedRange.prefix}» طُبعت حتى رقم ${printedRange.to}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== منطقة الطباعة ===== */}
      {pages.length > 0 && (
        <div id="print-area" className="space-y-6">
          {pages.map((page, pi) => (
            <div key={pi} className="print-page bg-white mx-auto shadow-lg no-print:shadow-lg">
              <div
                className="cards-grid"
                style={{
                  columnGap: `${s.gapX}mm`,
                  rowGap: `${s.gapY}mm`,
                  gridTemplateColumns: `repeat(${layout.cols}, ${layout.cw}mm)`,
                  gridAutoRows: `${layout.ch}mm`,
                }}
              >
                {page.map((c) => (
                  <div key={c.code} className="print-card" style={{ background: cardBgCss, border: cardBorder }}>
                    {/* النصف الأول: كارت ولي الأمر (عرضه = موضع خط القص) */}
                    {half(c.code, 'كارت ولي الأمر', s.cutPos)}

                    {/* خط القص الرأسي */}
                    <div className="cut-line" aria-hidden="true">✂</div>

                    {/* النصف الثاني: كارت الطفل */}
                    {half(c.code, 'كارت الطفل', 100 - s.cutPos)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
