'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getSupabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setLoading(true)
    const supabase = getSupabase()
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, phone } },
    })
    if (err) {
      setError(err.message.includes('already') ? 'هذا البريد الإلكتروني مسجل بالفعل' : 'حدث خطأ أثناء إنشاء الحساب')
      setLoading(false)
      return
    }
    router.replace('/pending')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-800 p-4">
      <section className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md animate-fadeIn">
        <header className="text-center mb-6">
          <Image src="/icons/icon-192.png" alt="نهضة الملائكة" width={72} height={72} className="mx-auto rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-extrabold text-gray-800 mt-3">إنشاء حساب جديد</h1>
          <p className="text-gray-500 mt-1 text-sm">سيتم مراجعة حسابك من قبل المدير قبل التفعيل</p>
        </header>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الاسم الكامل</label>
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none" placeholder="الاسم الكامل" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الهاتف</label>
            <input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none text-left" placeholder="+201XXXXXXXXX" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input type="email" required dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none text-left" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور</label>
            <input type="password" required dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none text-left" placeholder="••••••••" />
          </div>
          {error && <p className="text-red-600 text-sm font-semibold bg-red-50 rounded-lg p-3">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
          </button>
        </form>
        <p className="text-center text-gray-600 mt-6">
          لديك حساب بالفعل؟{' '}
          <Link href="/login" className="text-violet-600 font-bold hover:underline">تسجيل الدخول</Link>
        </p>
      </section>
    </main>
  )
}
