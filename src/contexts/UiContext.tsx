'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { cairoToday, syncServerClock } from '@/lib/serverClock'

type UiContextType = {
  date: string
  setDate: (d: string) => void
}

const UiContext = createContext<UiContextType>({ date: '', setDate: () => {} })

export function UiProvider({ children }: { children: React.ReactNode }) {
  // 📅 تاريخ اليوم بتوقيت القاهرة (وليس منطقة الجهاز الزمنية)
  const [initialDate] = useState(() => cairoToday())
  const [date, setDate] = useState(initialDate)

  // مزامنة ساعة السيرفر مبكراً + تصحيح التاريخ بعد المزامنة لو ساعة الجهاز خاطئة
  useEffect(() => {
    let alive = true
    syncServerClock().then(() => {
      if (!alive) return
      const corrected = cairoToday()
      // نصحّح فقط لو المستخدم لم يغيّر التاريخ يدوياً بعد
      setDate((d) => (d === initialDate ? corrected : d))
    })
    return () => { alive = false }
  }, [initialDate])

  return <UiContext.Provider value={{ date, setDate }}>{children}</UiContext.Provider>
}

export const useUi = () => useContext(UiContext)
