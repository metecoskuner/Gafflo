import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthContext from './AuthContext'

// The one canonical session/auth state for the app. Supabase itself owns session persistence
// (its own localStorage key, its own refresh scheduling) — this provider never reads or writes
// that storage directly, it only mirrors whatever Supabase reports via getSession()/
// onAuthStateChange() into React state so components can render off it.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      // No password grant exists — email magic link / OTP only. emailRedirectTo uses the
      // app's own current origin rather than a hardcoded host, so this works unchanged on
      // localhost, any Vite preview port, and whatever real deployment origin the app is
      // eventually served from — see the Stage A report for exactly which origins still need
      // adding to the Supabase Dashboard's redirect URL allowlist.
      async signInWithEmail(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
      },
      async signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
