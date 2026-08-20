import { useCallback, useEffect, useState } from 'react'
import { mapDecisionRowsToMap, mapSavedListingRowsToIdSet, mapUsageRowToSmartMatchUsage } from '../config/engagementAdapter'
import { describeEngagementError } from '../config/engagementErrors'
import {
  fetchMySavedListings,
  fetchMySmartMatchDecisions,
  fetchSmartMatchUsage,
  recordSmartMatchDecision as recordSmartMatchDecisionRequest,
  setListingSaved as setListingSavedRequest,
} from '../services/engagementService'
import useAuth from './useAuth'
import EngagementContext from './EngagementContext'

const emptyState = { savedIds: new Set(), decisions: new Map(), usage: null, loading: true, error: null }

async function loadEngagementState() {
  const [savedRows, decisionRows, usageRow] = await Promise.all([
    fetchMySavedListings(),
    fetchMySmartMatchDecisions(),
    fetchSmartMatchUsage(),
  ])
  return {
    savedIds: mapSavedListingRowsToIdSet(savedRows),
    decisions: mapDecisionRowsToMap(decisionRows),
    usage: mapUsageRowToSmartMatchUsage(usageRow),
    loading: false,
    error: null,
  }
}

// The single real, Supabase-backed source of truth for saved_listings/smart_match_decisions/
// smart_match_daily_usage — see services/engagementService.js and config/engagementAdapter.js.
// Every read/write in this domain goes through the actions this exposes, never the client
// directly (mirrors ApplicationsProvider/MessagingProvider/ViewingsProvider's own "centralize
// data access" role). Deliberately independent of ListingsProvider: candidate exclusion (which
// listings to hide from Smart Match because they're already decisioned) is composed in
// MarketplaceState.jsx, which already loads real listings — this provider only owns the
// engagement rows themselves.
export function EngagementProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshEngagement = useCallback(async () => {
    try {
      const next = await loadEngagementState()
      setState(next)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: describeEngagementError(error) }))
    }
  }, [])

  // EngagementProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx) —
  // `user` is non-null for this component's entire lifetime, matching every other Stage
  // provider's own guarantee. Under the local dev-auth bypass there is no real Supabase session:
  // these fetches still run for real, hit RLS as genuinely unauthenticated requests, and fail
  // honestly (caught below) rather than faking a result.
  useEffect(() => {
    let cancelled = false
    loadEngagementState()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: describeEngagementError(error) }))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const isSaved = useCallback((listingId) => state.savedIds.has(listingId), [state.savedIds])
  const getDecision = useCallback((listingId) => state.decisions.get(listingId) || null, [state.decisions])

  // Confirmed-success-then-update, never speculative-then-rollback (see the Stage G report):
  // the Set is only ever mutated after the real RPC call succeeds, so there is no phantom Saved
  // state to roll back from a failed write.
  const setSaved = useCallback(async (listingId, saved) => {
    try {
      await setListingSavedRequest(listingId, saved)
      setState((current) => {
        const nextIds = new Set(current.savedIds)
        if (saved) nextIds.add(listingId)
        else nextIds.delete(listingId)
        return { ...current, savedIds: nextIds }
      })
      return { error: null }
    } catch (error) {
      return { error: describeEngagementError(error) }
    }
  }, [])

  // Applies the RPC's own authoritative response directly (decision + real post-write usage) —
  // no extra round trip to re-fetch what the write already returned.
  const recordDecision = useCallback(async (listingId, decision) => {
    try {
      const result = await recordSmartMatchDecisionRequest(listingId, decision)
      setState((current) => {
        const nextDecisions = new Map(current.decisions)
        nextDecisions.set(listingId, { decision: result.decision, decidedAt: new Date().toISOString() })
        return {
          ...current,
          decisions: nextDecisions,
          usage: mapUsageRowToSmartMatchUsage({
            usage_date: current.usage?.date,
            smart_match_count: result.smartMatchCount,
            interested_count: result.interestedCount,
          }),
        }
      })
      return { error: null }
    } catch (error) {
      return { error: describeEngagementError(error) }
    }
  }, [])

  const value = {
    savedIds: state.savedIds,
    decisions: state.decisions,
    usage: state.usage,
    loading: state.loading,
    error: state.error,
    refreshEngagement,
    isSaved,
    getDecision,
    setSaved,
    recordDecision,
  }

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>
}
