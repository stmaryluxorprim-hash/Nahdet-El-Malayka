'use client'
import React from 'react'

/**
 * مجموعة أيقونات SVG احترافية (خطية / stroke) — بديل عصري للإيموجي.
 * كل الأيقونات ترث اللون من `currentColor` وتتحكم في المقاس عبر className / size.
 */

export type IconName =
  | 'home'
  | 'children'
  | 'scanner'
  | 'stats'
  | 'settings'
  | 'schedule'
  | 'print'
  | 'calendar'
  | 'menu'
  | 'angel'

type Props = {
  name: IconName
  className?: string
  size?: number
  strokeWidth?: number
}

const PATHS: Record<IconName, React.ReactNode> = {
  // الرئيسية — منزل
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  // الأطفال — مجموعة أشخاص
  children: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.4A5.5 5.5 0 0 1 21 20" />
    </>
  ),
  // الماسح — إطار QR مع خط مسح
  scanner: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  // الإحصائيات — أعمدة بيانية
  stats: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20H2" />
    </>
  ),
  // الإعدادات — ترس
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  // تنظيم اليوم — تقويم بمهام
  schedule: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 3v3M16 3v3" />
      <path d="M7.5 13l1.3 1.3 2.2-2.4" />
      <path d="M14 13h4M14 16.5h3" />
    </>
  ),
  // طباعة كروت — طابعة
  print: (
    <>
      <path d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" />
      <path d="M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
      <rect x="7" y="15" width="10" height="6" rx="1" />
      <circle cx="17.5" cy="12.5" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  // تقويم — للهيدر
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 3v3M16 3v3" />
    </>
  ),
  // قائمة — همبرجر
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  // ملاك — شعار التطبيق
  angel: (
    <>
      <circle cx="12" cy="6.5" r="2.5" />
      <path d="M8 4.5c1-1.4 2.4-2 4-2s3 .6 4 2" />
      <path d="M12 11c-2.8 0-5 2.2-5 5v3h10v-3c0-2.8-2.2-5-5-5Z" />
      <path d="M7 15c-2.5-.3-4.2-2-4.5-4.2 2 .2 3.6 1.2 4.5 2.6" />
      <path d="M17 15c2.5-.3 4.2-2 4.5-4.2-2 .2-3.6 1.2-4.5 2.6" />
    </>
  ),
}

export default function Icon({ name, className, size = 24, strokeWidth = 1.8 }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
