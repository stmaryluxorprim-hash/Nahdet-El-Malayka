'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'

export default function PendingPage() {
  const router = useRouter()
  const { profile, loading, signOut, refreshProfile } = useAuth()

  useEffect(() => {
    if (!loading && profile?.status === 'approved') router.replace('/children')
  }, [loading, profile, router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-800 p-4">
      <section className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center animate-fadeIn">
        <Image src="/icons/icon-192.png" alt="نهضة الملائكة" width={80} height={80} className="mx-auto rounded-2xl shadow-lg" />
        <div className="text-5xl mt-6 mb-4">⏳</div>
        <h1 className="text-2xl font-extrabold text-gray-800">حسابك قيد المراجعة</h1>
        <p className="text-gray-500 mt-3 leading-relaxed">
          تم إنشاء حسابك بنجاح. سيقوم المدير بمراجعة طلبك والموافقة عليه قريباً.
        </p>
        <div className="mt-6 space-y-3">
          <button onClick={refreshProfile}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition">
            تحديث الحالة
          </button>
          <button onClick={signOut}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition">
            تسجيل الخروج
          </button>
        </div>
      </section>
    </main>
  )
}
