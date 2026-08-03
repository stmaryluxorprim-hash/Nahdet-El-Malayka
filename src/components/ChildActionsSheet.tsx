'use client'
import { useState } from 'react'
import Modal from './Modal'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Child } from '@/lib/types'

export default function ChildActionsSheet({ child, date, open, onClose, onChanged, onEdit }: {
  child: Child | null
  date: string
  open: boolean
  onClose: () => void
  onChanged: () => void
  onEdit?: (c: Child) => void
}) {
  const { hasPermission } = useAuth()
  const [ptsInput, setPtsInput] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (!child) return null

  const addPoints = async (points: number) => {
    if (!points) return
    setBusy(true); setMsg('')
    const supabase = getSupabase()
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('point_transactions').insert({
      child_id: child.id, points, reason: reason.trim() || null,
      category: 'general', date, created_by: u.user?.id,
    })
    setBusy(false)
    if (error) setMsg('❌ ليس لديك صلاحية أو حدث خطأ')
    else { setMsg(points > 0 ? `✅ تم إضافة ${points} نقطة` : `✅ تم خصم ${Math.abs(points)} نقطة`); setPtsInput(''); setReason(''); onChanged() }
  }

  const deleteChild = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${child.name}؟ سيتم حذف كل بياناته نهائياً.`)) return
    setBusy(true)
    const { error } = await getSupabase().from('children').delete().eq('id', child.id)
    setBusy(false)
    if (error) setMsg('❌ ليس لديك صلاحية الحذف')
    else { onChanged(); onClose() }
  }

  const phone = child.phone
  const waPhone = phone.replace('+', '')

  return (
    <Modal open={open} onClose={onClose} title={child.name}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 overflow-hidden flex items-center justify-center text-3xl">
            {child.photo_url ? <img src={child.photo_url} alt={child.name} className="w-full h-full object-cover" /> : (child.gender === 'male' ? '👦' : '👧')}
          </div>
          <div>
            <p className="font-bold text-gray-800">{child.name}</p>
            <p className="text-sm text-gray-500" dir="ltr">{child.phone}</p>
            <p className="text-sm font-bold text-amber-600">⭐ {child.total_points} نقطة</p>
          </div>
        </div>

        {/* Communication */}
        <section>
          <h3 className="text-sm font-bold text-gray-600 mb-2">التواصل</h3>
          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${phone}`} className="py-3 rounded-xl bg-green-50 text-green-700 font-bold text-center text-sm">📞 اتصال</a>
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="py-3 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-center text-sm">💬 واتساب</a>
            <a href={`sms:${phone}`} className="py-3 rounded-xl bg-blue-50 text-blue-700 font-bold text-center text-sm">✉️ SMS</a>
          </div>
        </section>

        {/* Points */}
        {(hasPermission('points.add') || hasPermission('points.subtract')) && (
          <section>
            <h3 className="text-sm font-bold text-gray-600 mb-2">النقاط (بتاريخ {date})</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[5, 10, 20].map(p => (
                <button key={p} onClick={() => addPoints(p)} disabled={busy || !hasPermission('points.add')}
                  className="py-2.5 rounded-xl bg-amber-50 text-amber-700 font-bold disabled:opacity-40">+{p}</button>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <input type="number" inputMode="numeric" value={ptsInput} onChange={e => setPtsInput(e.target.value)}
                placeholder="عدد النقاط" className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500" />
              <button onClick={() => addPoints(Math.abs(Number(ptsInput)))} disabled={busy || !ptsInput || !hasPermission('points.add')}
                className="px-4 rounded-xl bg-green-600 text-white font-bold disabled:opacity-40">+</button>
              <button onClick={() => addPoints(-Math.abs(Number(ptsInput)))} disabled={busy || !ptsInput || !hasPermission('points.subtract')}
                className="px-4 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40">−</button>
            </div>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="السبب (اختياري)"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
          </section>
        )}

        {msg && <p className="text-sm font-bold text-center bg-gray-50 rounded-lg p-2">{msg}</p>}

        {/* Manage */}
        <section className="grid grid-cols-2 gap-2">
          {hasPermission('children.edit') && onEdit && (
            <button onClick={() => { onEdit(child); onClose() }}
              className="py-3 rounded-xl bg-gray-100 text-gray-700 font-bold">✏️ تعديل</button>
          )}
          {hasPermission('children.delete') && (
            <button onClick={deleteChild} disabled={busy}
              className="py-3 rounded-xl bg-red-50 text-red-600 font-bold disabled:opacity-40">🗑️ حذف</button>
          )}
        </section>
      </div>
    </Modal>
  )
}
