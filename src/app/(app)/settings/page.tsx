'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/lib/useRealtime'
import Modal from '@/components/Modal'
import type { Profile, Role, ClassRow, Permission, DayTask } from '@/lib/types'

export default function SettingsPage() {
  const { profile, user, isAdmin, hasPermission, signOut } = useAuth()
  const [tab, setTab] = useState<'users' | 'classes' | 'tasks' | 'points' | 'about'>(isAdmin ? 'users' : 'about')
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [allPerms, setAllPerms] = useState<Permission[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [newClass, setNewClass] = useState('')
  const [dayTasks, setDayTasks] = useState<DayTask[]>([])
  const [newTask, setNewTask] = useState({ name: '', icon: '🛠️' })
  const [editTask, setEditTask] = useState<DayTask | null>(null)
  const [attPts, setAttPts] = useState({ present: 10, late: 5, absent: 0 })
  const [msg, setMsg] = useState('')

  // permissions modal state
  const [permUser, setPermUser] = useState<Profile | null>(null)
  const [rolePermIds, setRolePermIds] = useState<Set<number>>(new Set())
  const [userPermIds, setUserPermIds] = useState<Set<number>>(new Set())
  const [permBusy, setPermBusy] = useState(false)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const loadUsers = useCallback(async () => {
    const supabase = getSupabase()
    const [{ data: u }, { data: r }, { data: p }] = await Promise.all([
      supabase.from('profiles').select('*, roles(*)').order('created_at', { ascending: false }),
      supabase.from('roles').select('*'),
      supabase.from('permissions').select('*').order('id'),
    ])
    setUsers((u as Profile[]) || [])
    setRoles((r as Role[]) || [])
    setAllPerms((p as Permission[]) || [])
  }, [])

  const loadClasses = useCallback(async () => {
    const { data } = await getSupabase().from('classes').select('*').order('sort_order')
    setClasses((data as ClassRow[]) || [])
  }, [])

  const loadTasks = useCallback(async () => {
    const { data } = await getSupabase().from('day_tasks').select('*').order('sort_order')
    setDayTasks((data as DayTask[]) || [])
  }, [])

  const loadAll = useCallback(() => {
    if (isAdmin) { loadUsers(); loadTasks() }
    loadClasses()
  }, [isAdmin, loadUsers, loadClasses, loadTasks])

  useEffect(() => {
    loadAll()
    getSupabase().from('app_settings').select('value').eq('key', 'attendance_points').single()
      .then(({ data }) => { if (data?.value) setAttPts(data.value) })
  }, [loadAll])

  useRealtime(['profiles', 'classes', 'user_permissions', 'day_tasks'], loadAll)

  const updateUser = async (id: string, patch: Partial<Profile>) => {
    const { error } = await getSupabase().from('profiles').update(patch).eq('id', id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تم الحفظ'); loadUsers() }
  }

  const approveUser = async (u: Profile) => {
    const servant = roles.find((r) => r.key === 'servant')
    await updateUser(u.id, { status: 'approved', role_id: u.role_id ?? servant?.id ?? null } as Partial<Profile>)
  }

  const deleteUser = async (u: Profile) => {
    if (!confirm(`⚠️ حذف «${u.full_name}» نهائياً؟\nسيُحذف حسابه وكل صلاحياته وتكليفاته ولا يمكن التراجع!`)) return
    if (!confirm('متأكد تماماً؟ الحذف نهائي ولا رجعة فيه.')) return
    const { error } = await getSupabase().rpc('admin_delete_user', { target_id: u.id })
    if (error) flash('❌ تعذر الحذف — هل نُفّذ migration_v4؟')
    else { flash('🗑️ تم حذف الخادم نهائياً'); loadUsers() }
  }

  // ---- permissions modal ----
  const openPerms = async (u: Profile) => {
    setPermUser(u)
    const supabase = getSupabase()
    const [rp, up] = await Promise.all([
      u.role_id
        ? supabase.from('role_permissions').select('permission_id').eq('role_id', u.role_id)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('user_permissions').select('permission_id').eq('user_id', u.id),
    ])
    setRolePermIds(new Set(((rp.data as any[]) || []).map((r) => r.permission_id)))
    setUserPermIds(new Set(((up.data as any[]) || []).map((r) => r.permission_id)))
  }

  const toggleUserPerm = async (permId: number) => {
    if (!permUser) return
    setPermBusy(true)
    const supabase = getSupabase()
    if (userPermIds.has(permId)) {
      const { error } = await supabase.from('user_permissions')
        .delete().eq('user_id', permUser.id).eq('permission_id', permId)
      if (!error) setUserPermIds((s) => { const n = new Set(s); n.delete(permId); return n })
    } else {
      const { error } = await supabase.from('user_permissions')
        .insert({ user_id: permUser.id, permission_id: permId, granted_by: user?.id })
      if (!error) setUserPermIds((s) => new Set(s).add(permId))
    }
    setPermBusy(false)
  }

  const grantAll = async () => {
    if (!permUser) return
    setPermBusy(true)
    const missing = allPerms
      .filter((p) => !rolePermIds.has(p.id) && !userPermIds.has(p.id))
      .map((p) => ({ user_id: permUser.id, permission_id: p.id, granted_by: user?.id }))
    if (missing.length) {
      const { error } = await getSupabase().from('user_permissions').insert(missing)
      if (!error) setUserPermIds((s) => {
        const n = new Set(s); missing.forEach((m) => n.add(m.permission_id)); return n
      })
    }
    setPermBusy(false)
  }

  const revokeAll = async () => {
    if (!permUser) return
    setPermBusy(true)
    const { error } = await getSupabase().from('user_permissions').delete().eq('user_id', permUser.id)
    if (!error) setUserPermIds(new Set())
    setPermBusy(false)
  }

  // ---- day tasks (وظائف تنظيم اليوم — للمدير فقط) ----
  const addDayTask = async () => {
    if (!newTask.name.trim()) return
    const { error } = await getSupabase().from('day_tasks').insert({
      name: newTask.name.trim(), icon: newTask.icon || '🛠️', sort_order: dayTasks.length + 1,
    })
    if (error) flash('❌ حدث خطأ — هل نفّذت migration_v3؟')
    else { setNewTask({ name: '', icon: '🛠️' }); flash('✅ تمت إضافة الوظيفة'); loadTasks() }
  }

  const saveDayTask = async () => {
    if (!editTask || !editTask.name.trim()) return
    const { error } = await getSupabase().from('day_tasks')
      .update({ name: editTask.name.trim(), icon: editTask.icon, description: editTask.description })
      .eq('id', editTask.id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تم الحفظ'); setEditTask(null); loadTasks() }
  }

  const deleteDayTask = async (t: DayTask) => {
    if (!confirm(`حذف وظيفة «${t.name}»؟ ستُحذف كل التكليفات المرتبطة بها في كل الأيام.`)) return
    const { error } = await getSupabase().from('day_tasks').delete().eq('id', t.id)
    if (error) flash('❌ حدث خطأ')
    else { flash('✅ تم الحذف'); loadTasks() }
  }

  const moveTask = async (t: DayTask, dir: -1 | 1) => {
    const idx = dayTasks.findIndex((x) => x.id === t.id)
    const other = dayTasks[idx + dir]
    if (!other) return
    const supabase = getSupabase()
    await Promise.all([
      supabase.from('day_tasks').update({ sort_order: other.sort_order }).eq('id', t.id),
      supabase.from('day_tasks').update({ sort_order: t.sort_order }).eq('id', other.id),
    ])
    loadTasks()
  }

  // ---- classes / points ----
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
    ...(isAdmin ? [{ key: 'tasks' as const, label: '🗂️ الوظائف' }] : []),
    ...(hasPermission('settings.manage') ? [{ key: 'points' as const, label: '⭐ النقاط' }] : []),
    { key: 'about' as const, label: '👤 حسابي' },
  ]

  return (
    <div className="animate-fadeIn">
      <div className="px-4 pt-4 space-y-3 pb-4">
        {msg && <p className="card p-3 text-center text-sm font-bold text-violet-700 animate-pop">{msg}</p>}

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`chip ${tab === t.key ? 'chip-on' : 'chip-off'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== users ===== */}
        {tab === 'users' && isAdmin && (
          <section id="users-section" className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-gray-800 truncate">{u.full_name}</p>
                    <p className="text-[11px] text-gray-400 font-semibold" dir="ltr">@{u.username || '—'}</p>
                    {u.phone && <p className="text-[11px] text-gray-400 font-semibold" dir="ltr">📞 {u.phone}</p>}
                  </div>
                  <span className={`text-[10px] font-extrabold rounded-full px-2.5 py-1 shrink-0 ${statusBadge(u.status)}`}>
                    {statusLabel(u.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {u.status === 'pending' && (
                    <>
                      <button onClick={() => approveUser(u)}
                        className="rounded-xl bg-emerald-500 text-white text-xs font-extrabold px-3 py-2 active:scale-95 transition">
                        ✅ موافقة
                      </button>
                      <button onClick={() => updateUser(u.id, { status: 'rejected' } as Partial<Profile>)}
                        className="rounded-xl bg-red-50 text-red-600 text-xs font-extrabold px-3 py-2 active:scale-95 transition">
                        ❌ رفض
                      </button>
                    </>
                  )}
                  {u.status === 'approved' && u.id !== profile?.id && (
                    <button onClick={() => updateUser(u.id, { status: 'rejected' } as Partial<Profile>)}
                      className="rounded-xl bg-red-50 text-red-600 text-xs font-extrabold px-3 py-2 active:scale-95 transition">
                      ⛔ إيقاف
                    </button>
                  )}
                  {u.status === 'rejected' && (
                    <button onClick={() => updateUser(u.id, { status: 'approved' } as Partial<Profile>)}
                      className="rounded-xl bg-emerald-50 text-emerald-700 text-xs font-extrabold px-3 py-2 active:scale-95 transition">
                      🔄 إعادة تفعيل
                    </button>
                  )}
                  <select
                    className="rounded-xl border-2 border-gray-100 bg-gray-50 text-xs font-bold px-2 py-2"
                    value={u.role_id ?? ''}
                    onChange={(e) => updateUser(u.id, { role_id: e.target.value ? Number(e.target.value) : null } as Partial<Profile>)}>
                    <option value="">بدون دور</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
                  </select>
                  <button onClick={() => openPerms(u)}
                    className="rounded-xl bg-violet-50 text-violet-700 text-xs font-extrabold px-3 py-2 active:scale-95 transition">
                    🛡️ الصلاحيات
                  </button>
                  {u.id !== profile?.id && (
                    <button onClick={() => deleteUser(u)}
                      className="rounded-xl bg-red-600 text-white text-xs font-extrabold px-3 py-2 active:scale-95 transition shadow-md shadow-red-600/25">
                      🗑️ حذف نهائي
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ===== classes ===== */}
        {tab === 'classes' && (
          <section id="classes-section" className="space-y-2">
            <div className="card p-3 flex gap-2">
              <input className="input flex-1" placeholder="اسم الفصل الجديد"
                value={newClass} onChange={(e) => setNewClass(e.target.value)} />
              <button onClick={addClass} className="btn-primary px-5">إضافة</button>
            </div>
            <div className="card divide-y divide-gray-50">
              {classes.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3">
                  <p className="font-bold text-sm text-gray-700">🏫 {c.name}</p>
                  <button onClick={() => deleteClass(c.id)}
                    className="text-red-500 text-xs font-extrabold bg-red-50 rounded-xl px-3 py-1.5 active:scale-95 transition">حذف</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== day tasks (admin only) ===== */}
        {tab === 'tasks' && isAdmin && (
          <section id="tasks-section" className="space-y-2">
            <div className="card p-3 space-y-2">
              <p className="text-[11px] font-bold text-gray-400">
                الوظائف تظهر في صفحة «🗓️ تنظيم اليوم» لكل يوم — إدارتها للمدير العام فقط
              </p>
              <div className="flex gap-2">
                <input className="input !w-16 text-center" placeholder="🛠️" maxLength={4}
                  value={newTask.icon} onChange={(e) => setNewTask({ ...newTask, icon: e.target.value })} />
                <input className="input flex-1" placeholder="اسم الوظيفة الجديدة"
                  value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} />
                <button onClick={addDayTask} className="btn-primary px-5">إضافة</button>
              </div>
            </div>
            <div className="card divide-y divide-gray-50">
              {dayTasks.length === 0 && (
                <p className="text-center text-xs text-gray-300 font-bold p-4">لا توجد وظائف بعد</p>
              )}
              {dayTasks.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 p-3">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveTask(t, -1)} disabled={i === 0}
                      className="text-gray-300 disabled:opacity-30 text-xs leading-none">▲</button>
                    <button onClick={() => moveTask(t, 1)} disabled={i === dayTasks.length - 1}
                      className="text-gray-300 disabled:opacity-30 text-xs leading-none">▼</button>
                  </div>
                  <p className="flex-1 font-bold text-sm text-gray-700 min-w-0 truncate">{t.icon} {t.name}</p>
                  <button onClick={() => setEditTask({ ...t })}
                    className="text-violet-600 text-xs font-extrabold bg-violet-50 rounded-xl px-3 py-1.5 active:scale-95 transition">تعديل</button>
                  <button onClick={() => deleteDayTask(t)}
                    className="text-red-500 text-xs font-extrabold bg-red-50 rounded-xl px-3 py-1.5 active:scale-95 transition">حذف</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== points ===== */}
        {tab === 'points' && (
          <section id="points-section" className="card p-4 space-y-3">
            <p className="font-extrabold text-gray-800">⭐ النقاط الافتراضية للحضور</p>
            <div className="grid grid-cols-3 gap-2">
              {(['present', 'late', 'absent'] as const).map((k) => (
                <div key={k}>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">
                    {k === 'present' ? 'حاضر' : k === 'late' ? 'متأخر' : 'غائب'}
                  </label>
                  <input type="number" className="input text-center" dir="ltr" value={attPts[k]}
                    onChange={(e) => setAttPts({ ...attPts, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <button onClick={savePoints} className="btn-primary w-full">حفظ</button>
          </section>
        )}

        {/* ===== about ===== */}
        {tab === 'about' && (
          <section id="about-section" className="card p-5 text-center space-y-3">
            <div className="text-5xl">😇</div>
            <p className="font-extrabold text-gray-800 text-lg">{profile?.full_name}</p>
            <p className="text-sm text-gray-400 font-semibold" dir="ltr">@{profile?.username || '—'}</p>
            <p className="text-xs font-bold text-violet-600 bg-violet-50 rounded-full inline-block px-3 py-1">
              {profile?.roles?.name_ar || 'بدون دور'}
            </p>
            <button onClick={signOut} className="btn-soft w-full !text-red-600 !bg-red-50">🚪 تسجيل الخروج</button>
            <p className="text-[11px] text-gray-300 font-semibold">نهضة الملائكة · v2</p>
          </section>
        )}
      </div>

      {/* ===== edit day task modal ===== */}
      <Modal open={!!editTask} onClose={() => setEditTask(null)} title="✏️ تعديل الوظيفة">
        {editTask && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="input !w-16 text-center" maxLength={4}
                value={editTask.icon} onChange={(e) => setEditTask({ ...editTask, icon: e.target.value })} />
              <input className="input flex-1" placeholder="اسم الوظيفة"
                value={editTask.name} onChange={(e) => setEditTask({ ...editTask, name: e.target.value })} />
            </div>
            <input className="input w-full" placeholder="وصف مختصر (اختياري)"
              value={editTask.description || ''}
              onChange={(e) => setEditTask({ ...editTask, description: e.target.value || null })} />
            <button onClick={saveDayTask} className="btn-primary w-full">💾 حفظ</button>
          </div>
        )}
      </Modal>

      {/* ===== per-user permissions modal ===== */}
      <Modal open={!!permUser} onClose={() => setPermUser(null)} title={`🛡️ صلاحيات: ${permUser?.full_name || ''}`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={grantAll} disabled={permBusy}
              className="flex-1 rounded-xl bg-emerald-500 text-white text-xs font-extrabold py-2.5 active:scale-95 transition disabled:opacity-50">
              ✅ منح كل الصلاحيات
            </button>
            <button onClick={revokeAll} disabled={permBusy}
              className="flex-1 rounded-xl bg-red-50 text-red-600 text-xs font-extrabold py-2.5 active:scale-95 transition disabled:opacity-50">
              🗑️ إزالة الإضافية
            </button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {allPerms.map((p) => {
              const fromRole = rolePermIds.has(p.id)
              const extra = userPermIds.has(p.id)
              return (
                <label key={p.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border-2 ${
                    fromRole ? 'bg-gray-50 border-gray-100 opacity-60' : extra ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-100'
                  }`}>
                  <input type="checkbox" className="w-4 h-4 accent-violet-600"
                    checked={fromRole || extra}
                    disabled={fromRole || permBusy}
                    onChange={() => toggleUserPerm(p.id)} />
                  <span className="flex-1 text-sm font-bold text-gray-700">{p.name_ar}</span>
                  {fromRole && <span className="text-[10px] font-extrabold text-gray-400">من الدور</span>}
                  {!fromRole && extra && <span className="text-[10px] font-extrabold text-violet-600">إضافية</span>}
                </label>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold text-center">
            الصلاحيات «من الدور» تُدار عبر تغيير الدور · «الإضافية» تُمنح لهذا المستخدم فقط
          </p>
        </div>
      </Modal>
    </div>
  )
}
