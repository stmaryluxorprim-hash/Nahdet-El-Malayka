'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import QrScanner from '@/components/QrScanner'
import Modal from '@/components/Modal'
import ChildFormModal from '@/components/ChildFormModal'
import ChildActionsSheet from '@/components/ChildActionsSheet'
import type { Child } from '@/lib/types'

const today = () => new Date().toISOString().slice(0, 10)

export default function ChildrenPage() {
  const { hasPermission } = useAuth()
  const [children, setChildren] = useState<Child[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanOpen, setScanOpen] = useState(false)
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editChild, setEditChild] = useState<Child | null>(null)
  const [selected, setSelected] = useState<Child | null>(null)
  const [scanErr, setScanErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from('children').select('*, classes(*)').eq('is_active', true).order('name')
    setChildren((data as Child[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleScan = async (code: string) => {
    setScanErr('')
    const { data } = await getSupabase().from('children').select('id, name').eq('code', code).maybeSingle()
    if (data) { setScanErr(`⚠️ هذا الكود مسجل بالفعل للطفل: ${data.name}`); return }
    setScannedCode(code)
    setScanOpen(false)
    setEditChild(null)
    setFormOpen(true)
  }

  const filtered = children.filter(c =>
    c.name.includes(search) || c.phone.includes(search) || c.code.includes(search))

  return (
    <div className="p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-gray-800">👼 الأطفال <span className="text-sm font-bold text-gray-400">({children.length})</span></h1>
        {hasPermission('children.create') && (
          <button id="add-child-btn" onClick={() => { setScanErr(''); setScanOpen(true) }}
            className="w-12 h-12 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-2xl font-bold shadow-lg shadow-violet-300 transition">+</button>
        )}
      </header>

      <input id="children-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الهاتف أو الكود..."
        className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 mb-4 outline-none focus:ring-2 focus:ring-violet-500" />

      {loading ? (
        <p className="text-center text-gray-400 py-10 font-bold">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14">
          <p className="text-5xl mb-3">👼</p>
          <p className="text-gray-400 font-bold">لا يوجد أطفال بعد</p>
          <p className="text-gray-400 text-sm mt-1">اضغط + لمسح كود QR وإضافة أول طفل</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(c => (
            <li key={c.id}>
              <button onClick={() => setSelected(c)}
                className="w-full bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition text-right">
                <div className="w-12 h-12 rounded-xl bg-violet-100 overflow-hidden flex items-center justify-center text-2xl shrink-0">
                  {c.photo_url ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" /> : (c.gender === 'male' ? '👦' : '👧')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.classes?.name || 'بدون فصل'}</p>
                </div>
                <span className="text-sm font-bold text-amber-600 shrink-0">⭐ {c.total_points}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* QR scan modal for new child */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="امسح كود QR للطفل الجديد">
        <p className="text-sm text-gray-500 mb-3 text-center">وجّه الكاميرا نحو كود QR الخاص بالطفل</p>
        {scanOpen && <QrScanner onScan={handleScan} />}
        {scanErr && <p className="text-amber-700 bg-amber-50 rounded-lg p-3 mt-3 text-sm font-bold text-center">{scanErr}</p>}
      </Modal>

      <ChildFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditChild(null) }}
        onSaved={load}
        code={scannedCode || undefined}
        child={editChild}
      />

      <ChildActionsSheet
        child={selected} date={today()} open={!!selected}
        onClose={() => setSelected(null)} onChanged={load}
        onEdit={(c) => { setEditChild(c); setFormOpen(true) }}
      />
    </div>
  )
}
