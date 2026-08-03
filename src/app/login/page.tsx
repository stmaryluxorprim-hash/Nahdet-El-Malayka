'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const supabase = getSupabase()
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
      return
    }
    const { data: prof } = await supabase.from('profiles').select('status').eq('id', data.user.id).single()
    if (prof?.status !== 'approved') router.replace('/pending')
    else router.replace('/children')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-800 p-4">
      <section className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md animate-fadeIn">
        <header className="text-center mb-8">
          <Image src="/icons/icon-192.png" alt="نهضة الملائكة" width={90} height={90} className="mx-auto rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-extrabold text-gray-800 mt-4">نهضة الملائكة</h1>
          <p className="text-gray-500 mt-1">تسجيل الدخول إلى حسابك</p>
        </header>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input id="login-email" type="email" required dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-left" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور</label>
            <input id="login-password" type="password" required dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-left" placeholder="••••••••" />
          </div>
          {error && <p className="text-red-600 text-sm font-semibold bg-red-50 rounded-lg p-3">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
        <p className="text-center text-gray-600 mt-6">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="text-violet-600 font-bold hover:underline">إنشاء حساب جديد</Link>
        </p>
      </section>
    </main>
  )
}
