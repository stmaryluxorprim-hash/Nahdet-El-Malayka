'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from './supabase'

/**
 * ⏱️ ساعة السيرفر الموحّدة (بدلاً من ساعة الجهاز)
 * ------------------------------------------------
 * نزامن فرق التوقيت (offset) بين ساعة الجهاز وساعة سيرفر قاعدة البيانات
 * عبر دالة `server_now()` — فتصبح كل الأجهزة على توقيت واحد حتى لو كانت
 * ساعة أي هاتف غير مضبوطة.
 *
 * كما نوفر دوال للتاريخ/الوقت بتوقيت القاهرة (Africa/Cairo) بغضّ النظر
 * عن المنطقة الزمنية المضبوطة على الجهاز.
 */

let offsetMs = 0            // serverTime - deviceTime
let synced = false
let syncPromise: Promise<void> | null = null

/** مزامنة الساعة مع السيرفر (أفضل قياس من 3 محاولات حسب زمن الذهاب والعودة) */
export async function syncServerClock(): Promise<void> {
  if (syncPromise) return syncPromise
  syncPromise = (async () => {
    try {
      const supabase = getSupabase()
      let best: { offset: number; rtt: number } | null = null
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now()
        const { data, error } = await supabase.rpc('server_now')
        const t1 = Date.now()
        if (error || !data) return // الدالة غير موجودة → نكمل بساعة الجهاز
        const rtt = t1 - t0
        const offset = new Date(data as string).getTime() + rtt / 2 - t1
        if (!best || rtt < best.rtt) best = { offset, rtt }
      }
      if (best) { offsetMs = best.offset; synced = true }
    } catch {
      /* نكمل بساعة الجهاز */
    } finally {
      syncPromise = null
    }
  })()
  return syncPromise
}

/** الوقت الحالي بتوقيت السيرفر (ms منذ epoch) */
export const serverNowMs = () => Date.now() + offsetMs

/** الوقت الحالي بتوقيت السيرفر ككائن Date */
export const serverNowDate = () => new Date(serverNowMs())

/** ISO string بتوقيت السيرفر — للكتابة في قاعدة البيانات */
export const serverNowIso = () => serverNowDate().toISOString()

/** فرق التوقيت الحالي (serverTime - deviceTime) بالمللي ثانية */
export const getClockOffset = () => offsetMs

/** هل تمت المزامنة بنجاح؟ */
export const isClockSynced = () => synced

/** تاريخ اليوم بتوقيت القاهرة (YYYY-MM-DD) — بغضّ النظر عن منطقة الجهاز الزمنية */
export function cairoToday(): string {
  // en-CA locale يعطي الصيغة YYYY-MM-DD مباشرة
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(serverNowDate())
}

/** تحويل أي Date إلى تاريخ (YYYY-MM-DD) بتوقيت القاهرة */
export function cairoDateOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** الوقت الحالي بتوقيت القاهرة (HH:MM) */
export function cairoTimeHM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(serverNowDate())
}

/**
 * Hook: يزامن الساعة عند التحميل ثم كل 5 دقائق، ويعيد offset الحالي.
 * أي مكوّن يستعمله يعاد رسمه عند تغيّر الـ offset (بعد المزامنة).
 */
export function useServerClock(resyncMs = 5 * 60 * 1000) {
  const [offset, setOffset] = useState(offsetMs)
  useEffect(() => {
    let alive = true
    const doSync = async () => {
      await syncServerClock()
      if (alive) setOffset(offsetMs)
    }
    doSync()
    const t = setInterval(doSync, resyncMs)
    return () => { alive = false; clearInterval(t) }
  }, [resyncMs])
  return offset
}
