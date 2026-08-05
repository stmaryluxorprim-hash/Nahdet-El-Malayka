'use client'
import { useState, useMemo, useCallback } from 'react'
import QRCode from 'qrcode'

// كارت واحد
type CardData = { code: string }

// كل صفحة A4 تحتوي على 10 كروت (شبكة 2×5)
const CARDS_PER_PAGE = 10

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function PrintCardsPage() {
  const [prefix, setPrefix] = useState('NM-')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(20)
  const [pad, setPad] = useState(3) // عدد الخانات (تعبئة بالأصفار)
  const [title, setTitle] = useState('نهضة الملايكة 2026')
  const [iconUrl, setIconUrl] = useState<string>('') // أيقونة يحددها المستخدم (data URL)
  const [gapX, setGapX] = useState(4)   // المسافة الأفقية بين الكروت (مم)
  const [gapY, setGapY] = useState(4)   // المسافة الرأسية بين الكروت (مم)
  const [cardBg, setCardBg] = useState('#ffffff') // لون خلفية الكارت
  const [cards, setCards] = useState<CardData[]>([])
  const [qrMap, setQrMap] = useState<Record<string, string>>({}) // code -> dataURL
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const totalRequested = useMemo(() => {
    const f = Number(from), t = Number(to)
    if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0
    return t - f + 1
  }, [from, to])

  const makeCode = useCallback((n: number) => {
    const num = pad > 0 ? String(n).padStart(pad, '0') : String(n)
    return `${prefix}${num}`
  }, [prefix, pad])

  // اختيار أيقونة من الجهاز → data URL
  const onPickIcon = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setIconUrl(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const generate = async () => {
    setErr('')
    const f = Number(from), t = Number(to)
    if (!prefix.trim() && pad === 0) { setErr('اكتب البادئة أو فعّل التعبئة بالأصفار'); return }
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
    } catch (e: any) {
      setErr(e?.message || 'حدث خطأ أثناء التوليد')
    } finally {
      setBusy(false)
    }
  }

  const pages = useMemo(() => chunk(cards, CARDS_PER_PAGE), [cards])

  return (
    <div className="p-4 space-y-4">
      {/* ===== لوحة الإعدادات (لا تُطبع) ===== */}
      <div className="card p-5 space-y-4 no-print">
        <div>
          <h2 className="text-lg font-extrabold text-gray-800">إعدادات الكروت</h2>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">
            كل كارت نصفان متطابقان (كارت الأهل + كارت الطفل) يُقصّان رأسياً — صفحة A4 بها 10 كروت (2×5)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">البادئة (Prefix)</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="مثال: NM-" />
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
            <input className="input" type="number" min={0} max={8} value={pad} onChange={(e) => setPad(Math.max(0, Math.min(8, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">مثال على الكود</label>
            <div className="input flex items-center !bg-violet-50 !border-violet-100 text-violet-700 font-extrabold" dir="ltr">
              {makeCode(Number(from) || 0)}
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">الاسم أعلى الكارت</label>
            <input className="input text-center font-extrabold" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">المسافة الأفقية بين الكروت (مم)</label>
            <input className="input" type="number" min={0} max={20} step={0.5} value={gapX} onChange={(e) => setGapX(Math.max(0, Math.min(20, Number(e.target.value))))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">المسافة الرأسية بين الكروت (مم)</label>
            <input className="input" type="number" min={0} max={20} step={0.5} value={gapY} onChange={(e) => setGapY(Math.max(0, Math.min(20, Number(e.target.value))))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">لون خلفية الكارت</label>
            <div className="flex items-center gap-3">
              <input type="color" value={cardBg} onChange={(e) => setCardBg(e.target.value)} className="w-12 h-10 rounded-xl border border-violet-100 cursor-pointer bg-white p-1" />
              <input className="input flex-1" dir="ltr" value={cardBg} onChange={(e) => setCardBg(e.target.value)} placeholder="#ffffff" />
              <button onClick={() => setCardBg('#ffffff')} className="text-xs font-bold text-gray-400">إعادة</button>
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">الأيقونة (شعار الكارت)</label>
            <div className="flex items-center gap-3">
              <label className="btn-soft cursor-pointer text-sm">
                اختر صورة
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickIcon(e.target.files?.[0] || null)} />
              </label>
              {iconUrl ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrl} alt="icon" className="w-10 h-10 rounded-xl object-contain border border-violet-100 bg-white" />
                  <button onClick={() => setIconUrl('')} className="text-xs font-bold text-rose-500">إزالة</button>
                </div>
              ) : (
                <span className="text-xs text-gray-400 font-semibold">لم تُحدَّد أيقونة بعد</span>
              )}
            </div>
          </div>
        </div>

        {err && <p className="text-sm font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</p>}

        <div className="flex items-center gap-3">
          <button onClick={generate} disabled={busy} className="btn-primary flex-1">
            {busy ? 'جارٍ التوليد...' : `توليد ${totalRequested} كارت`}
          </button>
          {cards.length > 0 && (
            <button onClick={() => window.print()} className="btn-soft px-6">🖨️ طباعة</button>
          )}
        </div>

        {cards.length > 0 && (
          <p className="text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2 text-center">
            ✅ تم توليد {cards.length} كارت على {pages.length} صفحة A4 — اضغط «طباعة» ثم اختر A4 وهوامش صفرية
          </p>
        )}
      </div>

      {/* ===== منطقة الطباعة ===== */}
      {pages.length > 0 && (
        <div id="print-area" className="space-y-6">
          {pages.map((page, pi) => (
            <div key={pi} className="print-page bg-white mx-auto shadow-lg no-print:shadow-lg">
              <div
                className="cards-grid"
                style={{ columnGap: `${gapX}mm`, rowGap: `${gapY}mm` }}
              >
                {page.map((c) => (
                  <div key={c.code} className="print-card" style={{ background: cardBg }}>
                    {/* النصف الأول: كارت الأهل */}
                    <div className="card-half">
                      <div className="card-head">
                        {iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={iconUrl} alt="" className="card-icon" />
                        ) : null}
                        <span className="card-title">{title}</span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrMap[c.code]} alt={c.code} className="qr-img" />
                      <div className="card-code" dir="ltr">{c.code}</div>
                      <div className="half-label">كارت الأهل</div>
                    </div>

                    {/* خط القص الرأسي */}
                    <div className="cut-line" aria-hidden="true">✂</div>

                    {/* النصف الثاني: كارت الطفل */}
                    <div className="card-half">
                      <div className="card-head">
                        {iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={iconUrl} alt="" className="card-icon" />
                        ) : null}
                        <span className="card-title">{title}</span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrMap[c.code]} alt={c.code} className="qr-img" />
                      <div className="card-code" dir="ltr">{c.code}</div>
                      <div className="half-label">كارت الطفل</div>
                    </div>
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
