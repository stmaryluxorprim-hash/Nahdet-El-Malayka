'use client'
import { createContext, useContext, useState } from 'react'

const todayStr = () => new Date().toISOString().slice(0, 10)

type UiContextType = {
  date: string
  setDate: (d: string) => void
}

const UiContext = createContext<UiContextType>({ date: todayStr(), setDate: () => {} })

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [date, setDate] = useState(todayStr())
  return <UiContext.Provider value={{ date, setDate }}>{children}</UiContext.Provider>
}

export const useUi = () => useContext(UiContext)
