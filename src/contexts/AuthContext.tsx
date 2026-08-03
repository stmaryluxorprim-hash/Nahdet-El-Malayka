'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

interface AuthCtx {
  user: User | null
  profile: Profile | null
  permissions: Set<string>
  loading: boolean
  hasPermission: (p: string) => boolean
  isAdmin: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null, profile: null, permissions: new Set(), loading: true,
  hasPermission: () => false, isAdmin: false,
  refreshProfile: async () => {}, signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid: string) => {
    const supabase = getSupabase()
    const { data: prof } = await supabase
      .from('profiles').select('*, roles(*)').eq('id', uid).single()
    setProfile(prof as Profile | null)
    if (prof?.role_id) {
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('permissions(key)')
        .eq('role_id', prof.role_id)
      setPermissions(new Set((perms || []).map((p: any) => p.permissions?.key).filter(Boolean)))
    } else {
      setPermissions(new Set())
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)
        await loadProfile(data.user.id)
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      else { setProfile(null); setPermissions(new Set()) }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id)
  }, [user, loadProfile])

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut()
    window.location.href = '/login'
  }, [])

  const isAdmin = profile?.roles?.key === 'admin'

  return (
    <Ctx.Provider value={{
      user, profile, permissions, loading,
      hasPermission: (p) => isAdmin || permissions.has(p),
      isAdmin, refreshProfile, signOut,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
