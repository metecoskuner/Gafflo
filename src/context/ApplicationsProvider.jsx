import { useCallback, useEffect, useState } from 'react'
import { mapApplicationRowToApplication } from '../config/applicationAdapter'
import { getApplicationStatusInfo } from '../config/applicationStatus'
import {
  createApplication as createApplicationRequest,
  fetchMyApplications,
  landlordSetApplicationStatus as landlordSetApplicationStatusRequest,
  markApplicationViewed as markApplicationViewedRequest,
  withdrawApplication as withdrawApplicationRequest,
} from '../services/applicationsService'
import useAuth from './useAuth'
import ApplicationsContext from './ApplicationsContext'

const emptyState = { tenantApplications: [], landlordApplications: [], loading: true, error: null }

function withStatusLabel(application) {
  return { ...application, statusLabel: getApplicationStatusInfo(application.status).label }
}

async function loadApplicationsState(userId) {
  const rows = await fetchMyApplications()
  const applications = rows.map(mapApplicationRowToApplication).map(withStatusLabel)
  return {
    // RLS's applications_select_landlord policy is the only other way a row not authored by the
    // caller could ever come back — every remaining row is necessarily attached to a listing the
    // caller owns (see applications_select_tenant/applications_select_landlord in the Stage D
    // migration), so this split needs no second query or explicit listing-ownership lookup.
    tenantApplications: applications.filter((application) => application.tenantId === userId),
    landlordApplications: applications.filter((application) => application.tenantId !== userId),
    loading: false,
    error: null,
  }
}

// The single real, Supabase-backed source of truth for applications/application_status_events —
// see services/applicationsService.js and config/applicationAdapter.js. Every application read or
// write in the app goes through the actions this exposes, never the client directly (mirrors
// AccountProfileProvider/ListingsProvider's own "centralize data access" role). Deliberately does
// not depend on ListingsProvider/useListings(): a single unfiltered applications select already
// returns exactly the caller's own rows on both sides (tenant and landlord) via RLS alone, so
// pairing an application with its listing is left to whichever page already has `properties`
// loaded (see PropertyDetailsModal/Applicants.jsx), rather than this provider re-fetching listing
// data a sibling provider already holds.
export function ApplicationsProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshApplications = useCallback(async () => {
    try {
      const next = await loadApplicationsState(user.id)
      setState(next)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }))
    }
  }, [user])

  // ApplicationsProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx) —
  // `user` is non-null for this component's entire lifetime, matching AccountProfileProvider/
  // ListingsProvider's own guarantee. Under the local dev-auth bypass (config/devAuthBypass.js)
  // `user` is a fake, non-null object but there is no real Supabase session behind it: the fetch
  // below still runs for real, hits RLS as a genuinely unauthenticated request, and fails honestly
  // (caught below, surfaced as `error`) rather than being special-cased to fake a result — see
  // that module's own comment for why that is the correct, safe behavior.
  useEffect(() => {
    let cancelled = false
    loadApplicationsState(user.id)
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

  const getTenantApplicationForListing = useCallback(
    (propertyId) => state.tenantApplications.find((application) => application.propertyId === propertyId) || null,
    [state.tenantApplications],
  )

  const applyToListing = useCallback(
    async (propertyId) => {
      try {
        await createApplicationRequest(propertyId)
        await refreshApplications()
        return { error: null, alreadyApplied: false }
      } catch (error) {
        // A real 23505 (unique_violation) means the server already holds an application for this
        // exact tenant+listing — reconcile from the server rather than surfacing this as a
        // failure, since the tenant's actual intent ("apply to this listing") is already true.
        if (error.code === '23505') {
          await refreshApplications()
          return { error: null, alreadyApplied: true }
        }
        return { error: error.message, alreadyApplied: false }
      }
    },
    [refreshApplications],
  )

  const withdraw = useCallback(
    async (applicationId) => {
      try {
        await withdrawApplicationRequest(applicationId)
        await refreshApplications()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshApplications],
  )

  const markViewed = useCallback(
    async (applicationId) => {
      try {
        await markApplicationViewedRequest(applicationId)
        await refreshApplications()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshApplications],
  )

  const setApplicationStatus = useCallback(
    async (applicationId, status) => {
      try {
        await landlordSetApplicationStatusRequest(applicationId, status)
        await refreshApplications()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshApplications],
  )

  const value = {
    tenantApplications: state.tenantApplications,
    landlordApplications: state.landlordApplications,
    loading: state.loading,
    error: state.error,
    refreshApplications,
    getTenantApplicationForListing,
    applyToListing,
    withdraw,
    markViewed,
    setApplicationStatus,
  }

  return <ApplicationsContext.Provider value={value}>{children}</ApplicationsContext.Provider>
}
