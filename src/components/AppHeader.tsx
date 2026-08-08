'use client'
import { useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useUi } from '@/contexts/UiContext'
import SideDrawer from '@/components/SideDrawer'
import NotificationsBell from '@/components/NotificationsBell'
import Icon, { IconName } from '@/components/Icon'

const TITLES: Record<string, { title: string; sub: string; icon: IconName }> = {
  '/home': { title: 'الرئيسية', sub: '⚡ كل البيانات محدثة لحظياً', icon: 'home' },
  '/children': { title: 'الأطفال', sub: 'تحديث لحظي ⚡', icon: 'children' },
  '/scanner': { title: 'الماسح الضوئي', sub: 'اختر الوظيفة ثم امسح الكروت تباعاً ⚡', icon: 'scanner' },
  '/statistics': { title: 'الإحصائيات', sub: 'تحديث لحظي مباشر ⚡', icon: 'stats' },
  '/settings': { title: 'الإعدادات', sub: 'إدارة المستخدمين والصلاحيات والفصول ⚡', icon: 'settings' },
  '/schedule': { title: 'تنظيم اليوم', sub: 'توزيع الخدام على الوظائف ⚡', icon: 'schedule' },
  '/print-cards': { title: 'طباعة كروت', sub: 'توليد صفحات كروت QR جاهزة للطباعة', icon: 'print' },
}

export default function AppHeader() {
  const pathname = usePathname()
  const { date, setDate } = useUi()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  const key = Object.keys(TITLES).find((k) => pathname.startsWith(k))
  const t = key ? TITLES[key] : { title: 'نهضة الملائكة', sub: '', icon: 'angel' as IconName }

  const openDatePicker = () => {
    const el = dateRef.current
    if (!el) return
    // @ts-ignore - showPicker مدعوم في المتصفحات الحديثة
    if (el.showPicker) el.showPicker()
    else { el.focus(); el.click() }
  }

  return (
    <>
      <header id="app-header" className="hero-gradient text-white w-full sticky top-0 z-40 shadow-lg shadow-violet-900/10">
        <div className="max-w-2xl mx-auto px-5 pt-6 pb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white/20 backdrop-blur shrink-0">
              <Icon name={t.icon} size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold truncate">{t.title}</h1>
              {t.sub && <p className="text-white/70 text-[11px] font-semibold mt-0.5 truncate">{t.sub}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* 🔔 الإشعارات */}
            <NotificationsBell />
            {/* زر اختيار التاريخ */}
            <div className="relative">
              <button id="date-btn" onClick={openDatePicker} title={date}
                className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur text-white active:scale-90 transition flex items-center justify-center">
                <Icon name="calendar" size={22} />
              </button>
              <input ref={dateRef} id="date-input" type="date" value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" tabIndex={-1} />
            </div>
            {/* زر القائمة الجانبية */}
            <button id="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="القائمة"
              className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur text-white active:scale-90 transition flex items-center justify-center">
              <Icon name="menu" size={24} />
            </button>
          </div>
        </div>
      </header>

      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
