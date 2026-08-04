'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getSupabase } from '@/lib/supabase'
import { usernameToEmail } from '@/lib/username'

const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false })

type Mode = 'staff' | 'child'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('staff')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [childCode, setChildCode] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const staffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    const supabase = getSupabase()
    const { error: err } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setBusy(false)
    if (err) { setError('اسم المستخدم أو كلمة المرور غير صحيحة'); return }
    router.replace('/home')
  }

  const childLogin = async (code: string) => {
    const clean = code.trim().toUpperCase()
    if (!clean) return
    setError(''); setBusy(true)
    const supabase = getSupabase()
    const { data, error: err } = await supabase.rpc('get_child_portal', { p_code: clean })
    setBusy(false)
    if (err || !data) { setError('لم يتم العثور على طفل بهذا الكارت'); setShowScanner(false); return }
    try { sessionStorage.setItem(`child-portal-${clean}`, JSON.stringify(data)) } catch {}
    router.push(`/child/${encodeURIComponent(clean)}`)
  }

  return (
    <main className="min-h-screen auth-bg flex items-center justify-center p-4">
      <section id="login-card" className="glass rounded-[2rem] w-full max-w-md p-7 animate-pop">
        <header className="text-center mb-6">
          <div className="text-6xl mb-2">😇</div>
          <h1 className="text-2xl font-extrabold text-violet-800">نهضة الملائكة</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">أهلاً بك من جديد 💜</p>
        </header>

        {/* mode switch */}
        <div className="grid grid-cols-2 gap-1.5 bg-violet-50 rounded-2xl p-1.5 mb-6">
          <button type="button" onClick={() => { setMode('staff'); setError('') }}
            className={`rounded-xl py-2.5 text-sm font-bold transition-all ${mode === 'staff' ? 'bg-white text-violet-700 shadow' : 'text-gray-500'}`}>
            🙋 دخول الخدام
          </button>
          <button type="button" onClick={() => { setMode('child'); setError('') }}
            className={`rounded-xl py-2.5 text-sm font-bold transition-all ${mode === 'child' ? 'bg-white text-violet-700 shadow' : 'text-gray-500'}`}>
            🪪 كارت الطفل
          </button>
        </div>

        {error && (
          <p className="bg-red-50 text-red-600 text-sm font-bold rounded-2xl px-4 py-3 mb-4 animate-fadeIn">{error}</p>
        )}

        {mode === 'staff' ? (
          <form onSubmit={staffLogin} className="space-y-4">
            <input id="login-username" className="input" placeholder="اسم المستخدم" dir="ltr"
              value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
            <input id="login-password" className="input" type="password" placeholder="كلمة المرور" dir="ltr"
              value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
            <p className="text-center text-sm text-gray-500 font-semibold">
              ليس لديك حساب؟{' '}
              <Link href="/register" className="text-violet-600 font-extrabold">إنشاء حساب</Link>
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            {showScanner ? (
              <div className="animate-fadeIn">
                <QrScanner onScan={(code) => childLogin(code)} />
                <button type="button" onClick={() => setShowScanner(false)} className="btn-soft w-full mt-3">
                  إيقاف الكاميرا
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowScanner(true)} className="btn-primary w-full">
                📷 امسح كارت الطفل
              </button>
            )}
            <div className="flex items-center gap-3 text-gray-300 text-xs font-bold">
              <span className="h-px flex-1 bg-gray-200" /> أو أدخل الكود يدوياً <span className="h-px flex-1 bg-gray-200" />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); childLogin(childCode) }} className="flex gap-2">
              <input id="child-code-input" className="input flex-1" placeholder="اكتب كود الكارت" dir="ltr"
                value={childCode} onChange={(e) => setChildCode(e.target.value)} />
              <button type="submit" className="btn-primary px-5" disabled={busy || !childCode.trim()}>
                {busy ? '...' : 'دخول'}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}
