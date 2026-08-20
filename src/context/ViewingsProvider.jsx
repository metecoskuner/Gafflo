import { useCallback, useEffect, useState } from 'react'
import { getActiveViewingForApplication, mapViewingProposalRowToProposal } from '../config/viewingAdapter'
import { describeViewingError } from '../config/viewingErrors'
import {
  acceptViewingSlot as acceptViewingSlotRequest,
  cancelViewing as cancelViewingRequest,
  declineViewing as declineViewingRequest,
  fetchMyViewingProposals,
  proposeViewing as proposeViewingRequest,
} from '../services/viewingsService'
import useAuth from './useAuth'
import ViewingsContext from './ViewingsContext'

const emptyState = { viewings: [], loading: true, error: null }

async function loadViewingsState(userId) {
  const rows = await fetchMyViewingProposals()
  const viewings = rows.map((row) => mapViewingProposalRowToProposal(row, { userId }))
  return { viewings, loading: false, error: null }
}

// The single real, Supabase-backed source of truth for viewing_proposals/viewing_slots — see
// services/viewingsService.js and config/viewingAdapter.js. Every viewing read or write in the app
// goes through the actions this exposes, never the client directly (mirrors ApplicationsProvider/
// MessagingProvider's own "centralize data access" role). Deliberately independent of
// ApplicationsProvider: viewing_proposals denormalizes landlord_id/tenant_id at creation time, so
// RLS alone already returns exactly the caller's own proposals with no join through applications
// needed — composing a proposal with its application (for display) is left to whichever page
// already has applications loaded (Applicants.jsx, PropertyDetailsModal), via application_id,
// exactly as the Stage F task requires (never a second copy of viewing state inside applications).
export function ViewingsProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshViewings = useCallback(async () => {
    try {
      const next = await loadViewingsState(user.id)
      setState(next)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: describeViewingError(error) }))
    }
  }, [user])

  // ViewingsProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx) —
  // `user` is non-null for this component's entire lifetime, matching every other Stage provider's
  // own guarantee. Under the local dev-auth bypass there is no real Supabase session: this fetch
  // still runs for real, hits RLS as a genuinely unauthenticated request, and fails honestly
  // (caught below) rather than faking a result.
  useEffect(() => {
    let cancelled = false
    loadViewingsState(user.id)
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: describeViewingError(error) }))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // "At most one open proposal per application" is a real backend invariant — see
  // config/viewingAdapter.js's own comment on getActiveViewingForApplication.
  const getActiveViewing = useCallback(
    (applicationId) => getActiveViewingForApplication(state.viewings, applicationId),
    [state.viewings],
  )

  const getViewingsForApplication = useCallback(
    (applicationId) => state.viewings.filter((viewing) => viewing.applicationId === applicationId),
    [state.viewings],
  )

  const proposeViewing = useCallback(
    async (applicationId, slots) => {
      try {
        const proposalId = await proposeViewingRequest(applicationId, slots)
        await refreshViewings()
        return { proposalId, error: null }
      } catch (error) {
        return { proposalId: null, error: describeViewingError(error) }
      }
    },
    [refreshViewings],
  )

  const acceptSlot = useCallback(
    async (proposalId, slotId) => {
      try {
        await acceptViewingSlotRequest(proposalId, slotId)
        await refreshViewings()
        return { error: null }
      } catch (error) {
        return { error: describeViewingError(error) }
      }
    },
    [refreshViewings],
  )

  const decline = useCallback(
    async (proposalId) => {
      try {
        await declineViewingRequest(proposalId)
        await refreshViewings()
        return { error: null }
      } catch (error) {
        return { error: describeViewingError(error) }
      }
    },
    [refreshViewings],
  )

  const cancel = useCallback(
    async (proposalId) => {
      try {
        await cancelViewingRequest(proposalId)
        await refreshViewings()
        return { error: null }
      } catch (error) {
        return { error: describeViewingError(error) }
      }
    },
    [refreshViewings],
  )

  const value = {
    viewings: state.viewings,
    loading: state.loading,
    error: state.error,
    refreshViewings,
    getActiveViewing,
    getViewingsForApplication,
    proposeViewing,
    acceptSlot,
    decline,
    cancel,
  }

  return <ViewingsContext.Provider value={value}>{children}</ViewingsContext.Provider>
}
