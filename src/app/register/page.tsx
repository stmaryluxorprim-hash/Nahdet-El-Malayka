'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { usernameToEmail, isValidUsername } from '@/lib/username'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const uname = username.trim().toLowerCase()
    if (!isValidUsername(uname)) {
      setError('اسم المستخدم: من 3 إلى 30 حرفاً (حروف إنجليزية وأرقام و _ و . فقط)')
      return
    }
    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^01\d{9}$/.test(cleanPhone)) {
      setError('رقم التليفون يجب أن يبدأ بـ 01 ويتكون من 11 رقماً (مثال: 01202405044)')
      return
    }
    const fullPhone = `+2${cleanPhone}`
    if (password.length < 6) { setError('كلمة المرور 6 أحرف على الأقل'); return }
    setBusy(true)
    const supabase = getSupabase()

    // pre-check username availability
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', uname).maybeSingle()
    if (existing) { setBusy(false); setError('اسم المستخدم محجوز، اختر اسماً آخر'); return }

    // pre-check phone uniqueness (public RPC — works before login)
    const { data: phoneTaken, error: phoneErr } = await supabase.rpc('phone_exists', { p_phone: fullPhone })
    if (phoneErr) { setBusy(false); setError('تعذر التحقق من الرقم — هل نُفّذ migration_v4؟'); return }
    if (phoneTaken) { setBusy(false); setError('رقم التليفون مسجّل بالفعل لخادم آخر'); return }

    const { error: err } = await supabase.auth.signUp({
      email: usernameToEmail(uname),
      password,
      options: { data: { full_name: fullName.trim(), username: uname, phone: fullPhone } },
    })
    setBusy(false)
    if (err) {
      setError(err.message.includes('already registered') ? 'اسم المستخدم محجوز بالفعل' : 'حدث خطأ، حاول مرة أخرى')
      return
    }
    router.replace('/pending')
  }

  return (
    <main className="min-h-screen auth-bg flex items-center justify-center p-4">
      <section id="register-card" className="glass rounded-[2rem] w-full max-w-md p-7 animate-pop">
        <header className="text-center mb-6">
          <div className="text-6xl mb-2">✨</div>
          <h1 className="text-2xl font-extrabold text-violet-800">إنشاء حساب خادم</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">سيتم تفعيل حسابك بعد موافقة المسؤول</p>
        </header>

        {error && (
          <p className="bg-red-50 text-red-600 text-sm font-bold rounded-2xl px-4 py-3 mb-4 animate-fadeIn">{error}</p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <input id="reg-fullname" className="input" placeholder="الاسم الكامل"
            value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <input id="reg-username" className="input" placeholder="اسم المستخدم (إنجليزي)" dir="ltr"
            value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
          <div className="flex items-stretch gap-2" dir="ltr">
            <span className="flex items-center rounded-2xl bg-violet-100 text-violet-700 font-extrabold px-4 select-none">+2</span>
            <input id="reg-phone" className="input flex-1" type="tel" inputMode="numeric"
              placeholder="01202405044" dir="ltr" maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              required autoComplete="tel" />
          </div>
          <input id="reg-password" className="input" type="password" placeholder="كلمة المرور (6+ أحرف)" dir="ltr"
            value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
          </button>
          <p className="text-center text-sm text-gray-500 font-semibold">
            لديك حساب بالفعل؟{' '}
            <Link href="/login" className="text-violet-600 font-extrabold">تسجيل الدخول</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
