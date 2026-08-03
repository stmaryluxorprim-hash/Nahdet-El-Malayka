'use client'
import { useState, useRef, useCallback } from 'react'
import Cropper, { Area } from 'react-easy-crop'
import imageCompression from 'browser-image-compression'

async function cropToWebP(imageSrc: string, area: Area): Promise<Blob> {
  const img = document.createElement('img')
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = imageSrc })
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/webp', 0.85))
  // compress to tiny webp (max 400px, ~100KB)
  const file = new File([blob], 'photo.webp', { type: 'image/webp' })
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 400,
    fileType: 'image/webp',
    useWebWorker: true,
  })
  return compressed
}

export default function PhotoPicker({ onPhoto, preview }: {
  onPhoto: (blob: Blob, previewUrl: string) => void
  preview: string | null
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [showChoice, setShowChoice] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setSrc(reader.result as string)
    reader.readAsDataURL(f)
    e.target.value = ''
    setShowChoice(false)
  }

  const confirmCrop = useCallback(async () => {
    if (!src || !area) return
    setBusy(true)
    try {
      const blob = await cropToWebP(src, area)
      onPhoto(blob, URL.createObjectURL(blob))
      setSrc(null); setZoom(1); setCrop({ x: 0, y: 0 })
    } finally { setBusy(false) }
  }, [src, area, onPhoto])

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {!src && (
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setShowChoice(true)}
            className="w-24 h-24 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 flex items-center justify-center overflow-hidden">
            {preview
              ? <img src={preview} alt="صورة الطفل" className="w-full h-full object-cover" />
              : <span className="text-3xl text-violet-400">+</span>}
          </button>
          <p className="text-sm text-gray-500">اضغط لإضافة صورة الطفل<br /><span className="text-xs">(كاميرا أو معرض الصور - تُضغط تلقائياً WebP)</span></p>
        </div>
      )}

      {showChoice && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowChoice(false)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl p-5 space-y-3 animate-fadeIn">
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold">📷 التقاط صورة بالكاميرا</button>
            <button type="button" onClick={() => galleryRef.current?.click()}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold">🖼️ اختيار من المعرض</button>
            <button type="button" onClick={() => setShowChoice(false)}
              className="w-full py-3 rounded-xl text-gray-400 font-bold">إلغاء</button>
          </div>
        </div>
      )}

      {src && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="relative flex-1">
            <Cropper
              image={src} crop={crop} zoom={zoom} aspect={1} cropShape="round"
              onCropChange={setCrop} onZoomChange={setZoom}
              onCropComplete={(_, px) => setArea(px)}
            />
          </div>
          <div className="p-4 bg-black space-y-3">
            <input type="range" min={1} max={3} step={0.05} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-violet-500" />
            <div className="flex gap-3">
              <button type="button" onClick={confirmCrop} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-bold disabled:opacity-50">
                {busy ? 'جاري الضغط...' : '✓ تأكيد'}
              </button>
              <button type="button" onClick={() => setSrc(null)}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
