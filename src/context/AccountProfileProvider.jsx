import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deriveActiveRole,
  mapLandlordProfileFieldsToRow,
  mapLandlordProfileRowToFields,
  mapProfileRow,
  mapTenantProfileFieldsToRow,
  mapTenantProfileRowToFields,
} from '../config/accountProfile'
import { supabase } from '../lib/supabase'
import useAuth from './useAuth'
import AccountProfileContext from './AccountProfileContext'

const PROFILE_COLUMNS = 'id, display_name, avatar_url, last_active_role'

const emptyState = { profile: null, tenantProfile: null, landlordProfile: null, loading: true, error: null }

async function fetchProfileState(userId) {
  const [profileResult, tenantResult, landlordResult] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single(),
    supabase.from('tenant_profiles').select('*').eq('profile_id', userId).maybeSingle(),
    supabase.from('landlord_profiles').select('*').eq('profile_id', userId).maybeSingle(),
  ])

  if (profileResult.error) {
    return { ...emptyState, loading: false, error: profileResult.error.message }
  }

  return {
    profile: mapProfileRow(profileResult.data),
    tenantProfile: mapTenantProfileRowToFields(tenantResult.data),
    landlordProfile: mapLandlordProfileRowToFields(landlordResult.data),
    loading: false,
    error: tenantResult.error?.message || landlordResult.error?.message || null,
  }
}

// The single real, Supabase-backed source of truth for profiles/tenant_profiles/
// landlord_profiles/last_active_role. Every supabase.from('profiles'|'tenant_profiles'|
// 'landlord_profiles') call in the app lives here — pages call the actions this exposes, never
// the client directly. RLS already scopes every read/write to auth.uid(); every query below
// still filters explicitly by the real authenticated user's own id (never a client-suppliable
// one) as defense in depth, not because RLS needs the help.
export function AccountProfileProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  // AccountProfileProvider only ever mounts inside AuthGate's authenticated branch — `user` is
  // guaranteed non-null for this component's entire lifetime, since AuthGate itself unmounts
  // this whole subtree (swapping to the Auth screen) the moment a session ends, rather than
  // re-rendering it with a null user. That unmount is what guarantees no previous user's
  // profile data can ever flash for whoever signs in next; `state` starts fresh (emptyState) on
  // every new mount.
  useEffect(() => {
    let cancelled = false
    fetchProfileState(user.id).then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const refreshProfiles = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    setState(await fetchProfileState(user.id))
  }, [user])

  const setActiveRole = useCallback(
    async (role) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ last_active_role: role })
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, profile: mapProfileRow(data) }))
      return { error: null }
    },
    [user],
  )

  const createTenantProfile = useCallback(
    async (fields) => {
      const row = mapTenantProfileFieldsToRow(fields)
      const { data, error } = await supabase
        .from('tenant_profiles')
        .insert({ profile_id: user.id, ...row })
        .select()
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, tenantProfile: mapTenantProfileRowToFields(data) }))
      return setActiveRole('tenant')
    },
    [user, setActiveRole],
  )

  const updateTenantProfile = useCallback(
    async (fields) => {
      const row = mapTenantProfileFieldsToRow(fields)
      const { data, error } = await supabase
        .from('tenant_profiles')
        .update(row)
        .eq('profile_id', user.id)
        .select()
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, tenantProfile: mapTenantProfileRowToFields(data) }))
      return { error: null }
    },
    [user],
  )

  const createLandlordProfile = useCallback(
    async (fields) => {
      const row = mapLandlordProfileFieldsToRow(fields)
      const { data, error } = await supabase
        .from('landlord_profiles')
        .insert({ profile_id: user.id, ...row })
        .select()
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, landlordProfile: mapLandlordProfileRowToFields(data) }))
      return setActiveRole('landlord')
    },
    [user, setActiveRole],
  )

  const updateLandlordProfile = useCallback(
    async (fields) => {
      const row = mapLandlordProfileFieldsToRow(fields)
      const { data, error } = await supabase
        .from('landlord_profiles')
        .update(row)
        .eq('profile_id', user.id)
        .select()
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, landlordProfile: mapLandlordProfileRowToFields(data) }))
      return { error: null }
    },
    [user],
  )

  const updateDisplayName = useCallback(
    async (name) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: name || null })
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .single()
      if (error) return { error: error.message }
      setState((current) => ({ ...current, profile: mapProfileRow(data) }))
      return { error: null }
    },
    [user],
  )

  const hasTenantProfile = Boolean(state.tenantProfile)
  const hasLandlordProfile = Boolean(state.landlordProfile)
  const hasAnyRoleProfile = hasTenantProfile || hasLandlordProfile
  const activeRole = deriveActiveRole(state.profile?.lastActiveRole, hasTenantProfile, hasLandlordProfile)

  const value = useMemo(
    () => ({
      profile: state.profile,
      tenantProfile: state.tenantProfile,
      landlordProfile: state.landlordProfile,
      activeRole,
      hasTenantProfile,
      hasLandlordProfile,
      hasAnyRoleProfile,
      loading: state.loading,
      error: state.error,
      refreshProfiles,
      setActiveRole,
      createTenantProfile,
      updateTenantProfile,
      createLandlordProfile,
      updateLandlordProfile,
      updateDisplayName,
    }),
    [
      state,
      activeRole,
      hasTenantProfile,
      hasLandlordProfile,
      hasAnyRoleProfile,
      refreshProfiles,
      setActiveRole,
      createTenantProfile,
      updateTenantProfile,
      createLandlordProfile,
      updateLandlordProfile,
      updateDisplayName,
    ],
  )

  return <AccountProfileContext.Provider value={value}>{children}</AccountProfileContext.Provider>
}
