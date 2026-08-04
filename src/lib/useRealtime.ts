'use client'
import { useEffect, useRef } from 'react'
import { getSupabase } from './supabase'

/**
 * Subscribe to postgres_changes on the given tables and call `onChange`
 * (debounced) whenever any of them changes. Used to keep every screen
 * live-updated across all connected users.
 */
export function useRealtime(tables: string[], onChange: () => void, debounceMs = 250) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  const key = tables.join(',')

  useEffect(() => {
    const supabase = getSupabase()
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cbRef.current(), debounceMs)
    }
    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2, 8)}`)
    key.split(',').forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    })
    channel.subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [key, debounceMs])
}
