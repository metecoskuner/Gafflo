import { useEffect, useState } from 'react'
import { amIModerator } from '../services/moderationService'
import useAuth from './useAuth'
import ModeratorContext from './ModeratorContext'

// Stage K — the single real source of truth for "is the current account a moderator/admin".
// Deliberately narrow: am_i_moderator() never exposes profiles.platform_role itself to the
// client, only this one boolean. Used to gate the /moderator route and to decide whether to
// render a moderator entry point anywhere in the app — never the real enforcement, which is
// every moderator RPC's own is_caller_moderator() check. Under the local dev-auth bypass there
// is no real Supabase session, so this call fails honestly and isModerator stays false, exactly
// like every other provider's own dev-bypass behavior.
export function ModeratorProvider({ children }) {
  const { user } = useAuth()
  const [isModerator, setIsModerator] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    amIModerator().then((result) => {
      if (!cancelled) {
        setIsModerator(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [user])

  return <ModeratorContext.Provider value={{ isModerator, loading }}>{children}</ModeratorContext.Provider>
}
