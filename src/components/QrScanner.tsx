'use client'
import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function QrScanner({ onScan, paused = false }: {
  onScan: (code: string) => void
  paused?: boolean
}) {
  const ref = useRef<Html5Qrcode | null>(null)
  const lastRef = useRef<{ code: string; t: number }>({ code: '', t: 0 })
  const onScanRef = useRef(onScan)
  const pausedRef = useRef(paused)
  onScanRef.current = onScan
  pausedRef.current = paused

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    ref.current = scanner
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      (text) => {
        if (pausedRef.current) return
        const now = Date.now()
        if (text === lastRef.current.code && now - lastRef.current.t < 3000) return
        lastRef.current = { code: text, t: now }
        onScanRef.current(text)
      },
      () => {}
    ).catch(() => {})

    return () => {
      if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {})
      else try { scanner.clear() } catch {}
    }
  }, [])

  return <div id="qr-reader" className="w-full rounded-2xl overflow-hidden bg-black" />
}
