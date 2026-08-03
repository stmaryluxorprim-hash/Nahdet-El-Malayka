'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile, Role, ClassRow } from '@/lib/types'

export default function SettingsPage() {
  const { profile, isAdmin, hasPermission, signOut } = useAuth()
  const [tab, setTab] = useState<'users' | 'classes' | 'points' | 'about'>(isAdmin ? 'users' : 'about')
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [newClass, setNewClass] = useState('')
  const [attPts, setAttPts] = useState({ present: 10, late: 5, absent: 0 })
  const [msg, setMsg] = useState('')

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const loadUsers = useCallback(async () => {
    const supabase = getSupabase()
    const [{ data: u }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*, roles(*)').order('created_at', { ascending: false }),
      supabase.from('roles').select('*'),
    ])
    setUsers((u as Profile[]) || [])
    setRoles((r as Role[]) || [])
  }, [])

  const loadClasses = useCallback(async () => {
    const { data } = await getSupabase().from('classes').select('*').order('sort_order')
    setClasses((data as ClassRow[]) || [])
  }, [])

  useEffect(() => {
    if (isAdmin) loadUsers()
    loadClasses()
    getSupabase().from('app_settings').select('value').eq('key', 'attendance_points').single()
      .then(({ data }) => { if (data?.value) setAttPts(data.value) })
  }, [isAdmin, loadUsers, loadClasses])

  const updateUser = async (id: string, patch: Partial<Profile>) => {
    const { error } = await getSupabase().from('profiles').update(patch).eq('id', id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تم الحفظ'); loadUsers() }
  }

  const addClass = async () => {
    if (!newClass.trim()) return
    const { error } = await getSupabase().from('classes').insert({ name: newClass.trim(), sort_order: classes.length + 1 })
    if (error) flash('❌ ليس لديك صلاحية')
    else { setNewClass(''); flash('✅ تمت الإضافة'); loadClasses() }
  }

  const deleteClass = async (id: string) => {
    if (!confirm('حذف هذا الفصل؟ (الأطفال المرتبطون به سيصبحون بدون فصل)')) return
    const { error } = await getSupabase().from('classes').delete().eq('id', id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تم الحذف'); loadClasses() }
  }

  const savePoints = async () => {
    const { error } = await getSupabase().from('app_settings')
      .update({ value: attPts, updated_at: new Date().toISOString() }).eq('key', 'attendance_points')
    if (error) flash('❌ ليس لديك صلاحية')
    else flash('✅ تم حفظ نقاط الحضور')
  }

  const statusBadge = (s: string) =>
    s === 'approved' ? 'bg-green-100 text-green-700' : s === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  const statusLabel = (s: string) => (s === 'approved' ? 'معتمد' : s === 'pending' ? 'قيد المراجعة' : 'مرفوض')

  const TABS = [
    ...(isAdmin ? [{ key: 'users' as const, label: '👥 المستخدمون' }] : []),
    ...(hasPermission('classes.manage') ? [{ key: 'classes' as const, label: '🏫 الفصول' }] : []),
    ...(hasPermission('settings.manage') ? [{ key: 'points' as const, label: '⭐ النقاط' }] : []),
    { key: 'about' as const, label: '👤 حسابي' },
  ]

  return (
    <div className="p-4">
      <h1 className="text-2xl font-extrabold text-gray-800 mb-4">⚙️ الإعدادات</h1>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2 rounded-xl font-bold text-sm ${tab === t.key ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 text-center font-bold bg-white rounded-xl p-2.5 shadow-sm animate-fadeIn">{msg}</p>}

      {tab === 'users' && isAdmin && (
        <ul className="space-y-2">
          {users.map(u => (
            <li key={u.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-800">{u.full_name || 'بدون اسم'}</p>
                  {u.phone && <p className="text-xs text-gray-400" dir="ltr">{u.phone}</p>}
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusBadge(u.status)}`}>{statusLabel(u.status)}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {u.status === 'pending' && (
                  <>
                    <button onClick={() => updateUser(u.id, { status: 'approved', role_id: roles.find(r => r.key === 'servant')?.id })}
                      className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold">✓ موافقة</button>
                    <button onClick={() => updateUser(u.id, { status: 'rejected' })}
                      className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold">✗ رفض</button>
                  </>
                )}
                {u.status === 'approved' && u.id !== profile?.id && (
                  <>
                    <select value={u.role_id ?? ''} onChange={e => updateUser(u.id, { role_id: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold bg-white">
                      <option value="">بدون دور</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
                    </select>
                    <button onClick={() => updateUser(u.id, { status: 'rejected' })}
                      className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold">تعطيل</button>
                  </>
                )}
                {u.status === 'rejected' && (
                  <button onClick={() => updateUser(u.id, { status: 'approved' })}
                    className="px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-sm font-bold">إعادة تفعيل</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'classes' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={newClass} onChange={e => setNewClass(e.target.value)} placeholder="اسم الفصل الجديد"
              className="flex-1 border border-gray-200 bg-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-violet-500" />
            <button onClick={addClass} className="px-4 rounded-xl bg-violet-600 text-white font-bold">إضافة</button>
          </div>
          <ul className="space-y-2">
            {classes.map(c => (
              <li key={c.id} className="bg-white rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
                <span className="font-bold text-gray-700">{c.name}</span>
                <button onClick={() => deleteClass(c.id)} className="text-red-400 text-sm font-bold">حذف</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'points' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-gray-700">نقاط الحضور التلقائية</h2>
          {([['present', '✅ حاضر'], ['late', '◐ متأخر'], ['absent', '✗ غائب']] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="font-bold text-gray-600">{label}</span>
              <input type="number" inputMode="numeric" value={attPts[k]}
                onChange={e => setAttPts(p => ({ ...p, [k]: Number(e.target.value) || 0 }))}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 font-bold text-center outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          ))}
          <button onClick={savePoints} className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold">حفظ</button>
        </div>
      )}

      {tab === 'about' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <div className="text-center">
            <p className="text-4xl mb-2">🙋</p>
            <p className="font-extrabold text-gray-800 text-lg">{profile?.full_name}</p>
            <p className="text-sm text-gray-400">{profile?.roles?.name_ar || 'بدون دور'}</p>
          </div>
          <button onClick={signOut} className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-bold">تسجيل الخروج</button>
          <p className="text-center text-xs text-gray-300 font-bold">نهضة الملائكة · v1.0</p>
        </div>
      )}
    </div>
  )
}
