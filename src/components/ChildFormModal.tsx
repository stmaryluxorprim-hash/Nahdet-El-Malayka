'use client'
import { useState, useEffect } from 'react'
import Modal from './Modal'
import PhotoPicker from './PhotoPicker'
import { getSupabase } from '@/lib/supabase'
import type { Child, ClassRow } from '@/lib/types'

export default function ChildFormModal({ open, onClose, onSaved, code, child }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  code?: string          // QR code for new child
  child?: Child | null   // existing child for edit
}) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [name, setName] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')  // 10 digits after +20
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [classId, setClassId] = useState('')
  const [birthday, setBirthday] = useState('')
  const [notes, setNotes] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    getSupabase().from('classes').select('*').order('sort_order').then(({ data }) => {
      setClasses((data as ClassRow[]) || [])
      if (!child && data?.length && !classId) setClassId(data[0].id)
    })
    if (child) {
      setName(child.name)
      setPhoneDigits(child.phone.replace('+20', ''))
      setGender(child.gender)
      setClassId(child.class_id || '')
      setBirthday(child.birthday || '')
      setNotes(child.notes || '')
      setPhotoPreview(child.photo_url)
      setPhotoBlob(null)
    } else {
      setName(''); setPhoneDigits(''); setGender('male'); setBirthday(''); setNotes('')
      setPhotoBlob(null); setPhotoPreview(null)
    }
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, child])

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('يرجى إدخال اسم الطفل'); return }
    if (!/^[0-9]{10}$/.test(phoneDigits)) { setError('رقم الهاتف يجب أن يكون 10 أرقام بالضبط بعد +20'); return }
    if (!classId) { setError('يرجى اختيار الفصل'); return }
    setSaving(true)
    const supabase = getSupabase()
    try {
      let photo_url = child?.photo_url || null
      if (photoBlob) {
        const path = `${code || child?.code}-${Date.now()}.webp`
        const { error: upErr } = await supabase.storage.from('children-photos')
          .upload(path, photoBlob, { contentType: 'image/webp', upsert: true })
        if (upErr) throw new Error('فشل رفع الصورة: ' + upErr.message)
        photo_url = supabase.storage.from('children-photos').getPublicUrl(path).data.publicUrl
      }
      const payload = {
        name: name.trim(),
        phone: `+20${phoneDigits}`,
        gender,
        class_id: classId,
        birthday: birthday || null,
        notes: notes.trim() || null,
        photo_url,
      }
      if (child) {
        const { error: err } = await supabase.from('children').update(payload).eq('id', child.id)
        if (err) throw new Error(err.message)
      } else {
        const { data: u } = await supabase.auth.getUser()
        const { error: err } = await supabase.from('children').insert({ ...payload, code, created_by: u.user?.id })
        if (err) throw new Error(err.code === '23505' ? 'هذا الكود مسجل بالفعل لطفل آخر' : err.message)
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || 'حدث خطأ أثناء الحفظ')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={child ? 'تعديل بيانات الطفل' : 'إضافة طفل جديد'}>
      <div className="space-y-4">
        {!child && (
          <div className="bg-violet-50 rounded-xl p-3 text-sm font-bold text-violet-700 text-center" dir="ltr">
            🔖 {code}
          </div>
        )}

        <PhotoPicker preview={photoPreview} onPhoto={(b, url) => { setPhotoBlob(b); setPhotoPreview(url) }} />

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الطفل *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none" placeholder="الاسم الكامل" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الهاتف *</label>
          <div className="flex gap-2" dir="ltr">
            <span className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-3 font-bold text-gray-600">+20</span>
            <input type="tel" inputMode="numeric" maxLength={10} value={phoneDigits}
              onChange={e => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none text-left tracking-wider"
              placeholder="1XXXXXXXXX" />
          </div>
          <p className={`text-xs mt-1 ${phoneDigits.length === 10 ? 'text-green-600' : 'text-gray-400'}`}>
            {phoneDigits.length}/10 أرقام
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">النوع *</label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setGender('male')}
              className={`py-3 rounded-xl font-bold border-2 transition ${gender === 'male' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>👦 ولد</button>
            <button type="button" onClick={() => setGender('female')}
              className={`py-3 rounded-xl font-bold border-2 transition ${gender === 'female' ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-500'}`}>👧 بنت</button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الفصل *</label>
          <select value={classId} onChange={e => setClassId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none bg-white">
            <option value="">اختر الفصل</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الميلاد</label>
          <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none" placeholder="ملاحظات إضافية..." />
        </div>

        {error && <p className="text-red-600 text-sm font-semibold bg-red-50 rounded-lg p-3">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : child ? 'حفظ التعديلات' : '✓ إضافة الطفل'}
        </button>
      </div>
    </Modal>
  )
}
