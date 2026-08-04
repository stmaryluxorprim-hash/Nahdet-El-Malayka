'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MAIN_TABS = [
  { href: '/home', label: 'الرئيسية', icon: '🏠' },
  { href: '/children', label: 'الأطفال', icon: '👼' },
  { href: '/scanner', label: 'الماسح', icon: '📷' },
  { href: '/statistics', label: 'الإحصائيات', icon: '📊' },
  { href: '/settings', label: 'الإعدادات', icon: '⚙️' },
]

// 👇 الصفحات الإضافية — أضِف هنا أي صفحة/موديول جديد لاحقاً
const EXTRA_PAGES: { href: string; label: string; icon: string }[] = [
  { href: '/schedule', label: 'تنظيم اليوم', icon: '🗓️' },
]

export default function SideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  const item = (t: { href: string; label: string; icon: string }) => {
    const active = pathname.startsWith(t.href)
    return (
      <Link key={t.href} href={t.href} onClick={onClose}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-extrabold text-sm transition-all ${
          active ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30' : 'text-gray-600 active:bg-violet-50'
        }`}>
        <span className="text-xl leading-none">{t.icon}</span>
        {t.label}
      </Link>
    )
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      {/* overlay */}
      <div onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      {/* drawer (RTL: slides from the right) */}
      <aside
        className={`absolute top-0 bottom-0 right-0 w-72 max-w-[80vw] bg-white shadow-2xl rounded-l-3xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}>
        <div className="hero-gradient text-white px-5 pt-8 pb-6 rounded-bl-3xl">
          <p className="text-2xl font-extrabold">😇 نهضة الملائكة</p>
          <p className="text-white/70 text-xs font-semibold mt-1">القائمة الرئيسية</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {MAIN_TABS.map(item)}

          {/* الفاصل */}
          <hr className="my-3 border-gray-100" />

          {EXTRA_PAGES.length === 0 ? (
            <p className="text-center text-[11px] text-gray-300 font-bold py-2">— صفحات إضافية قريباً —</p>
          ) : (
            EXTRA_PAGES.map(item)
          )}
        </nav>
      </aside>
    </div>
  )
}
