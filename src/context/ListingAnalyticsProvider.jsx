import { useCallback, useEffect, useState } from 'react'
import { emptyListingAnalytics, mapListingAnalyticsRowsToMap } from '../config/listingAnalyticsAdapter'
import {
  fetchMyListingAnalytics,
  recordListingView as recordListingViewRequest,
} from '../services/listingAnalyticsService'
import useAuth from './useAuth'
import ListingAnalyticsContext from './ListingAnalyticsContext'

const emptyState = { analyticsByListingId: new Map(), loading: true, error: null }

async function loadListingAnalyticsState() {
  const rows = await fetchMyListingAnalytics()
  return { analyticsByListingId: mapListingAnalyticsRowsToMap(rows), loading: false, error: null }
}

// The single real, Supabase-backed source of truth for Stage I aggregate listing analytics.
// It exposes aggregate rows for a landlord's own listings and a passive recordListingView()
// action for the property details experience. It never reads listing_views directly.
export function ListingAnalyticsProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshListingAnalytics = useCallback(async () => {
    try {
      const next = await loadListingAnalyticsState()
      setState(next)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadListingAnalyticsState()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: error.message }))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const getAnalyticsForListing = useCallback(
    (listingId) => state.analyticsByListingId.get(listingId) || emptyListingAnalytics(listingId),
    [state.analyticsByListingId],
  )

  const recordListingView = useCallback(async (listingId) => {
    try {
      const recorded = await recordListingViewRequest(listingId)
      return { recorded, error: null }
    } catch (error) {
      return { recorded: false, error: error.message }
    }
  }, [])

  const value = {
    analyticsByListingId: state.analyticsByListingId,
    loading: state.loading,
    error: state.error,
    refreshListingAnalytics,
    getAnalyticsForListing,
    recordListingView,
  }

  return <ListingAnalyticsContext.Provider value={value}>{children}</ListingAnalyticsContext.Provider>
}
