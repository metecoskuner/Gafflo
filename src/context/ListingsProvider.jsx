import { useCallback, useEffect, useState } from 'react'
import { mapListingImageRowToPhoto, mapListingRowToProperty } from '../config/listingAdapter'
import {
  createListingDraft,
  deleteListingImage as deleteListingImageRequest,
  fetchListingImagesForListings,
  fetchMyListings,
  fetchPublicListings,
  fetchPublicProfileSummaries,
  markListingRented as markListingRentedRequest,
  pauseListing as pauseListingRequest,
  requestListingReview as requestListingReviewRequest,
  reorderListingImages as reorderListingImagesRequest,
  resumeListing as resumeListingRequest,
  setListingCoverImage as setListingCoverImageRequest,
  updateListingFields,
  uploadAndRegisterListingImage,
  withdrawListingFromReview as withdrawListingFromReviewRequest,
} from '../services/listingsService'
import { forgetSignedUrl, resolveSignedUrls } from '../utils/signedImageUrls'
import useAuth from './useAuth'
import ListingsContext from './ListingsContext'

const emptyState = { publicListings: [], myListings: [], loading: true, error: null }

// Attaches durable listing_images (as resolved signed URLs) and the real public display name
// (via get_public_profile_summaries, batched once for every owner_id in the set — never a
// per-row/per-card lookup) to each row. Both lookups are shared across the whole rows array in
// one round trip each, regardless of how many listings are being loaded.
async function attachImagesAndOwners(rows) {
  if (!rows.length) return []
  const listingIds = rows.map((row) => row.id)
  const imageRows = await fetchListingImagesForListings(listingIds)
  const paths = imageRows.map((row) => row.storage_path)
  const [urlMap, ownerMap] = await Promise.all([
    resolveSignedUrls(paths),
    fetchPublicProfileSummaries(rows.map((row) => row.owner_id)),
  ])

  const imagesByListing = new Map()
  imageRows.forEach((row) => {
    const list = imagesByListing.get(row.listing_id) || []
    list.push(mapListingImageRowToPhoto(row, urlMap[row.storage_path]))
    imagesByListing.set(row.listing_id, list)
  })

  return rows.map((row) => {
    // Cover pinned first regardless of storage position — every card/gallery in the app just
    // reads images[0] as "the" photo, so is_cover (a real, independent DB flag — see
    // register_listing_image/set_listing_cover_image) must be what decides that, not raw
    // position. Position still orders the rest of the gallery.
    const photoMetadata = (imagesByListing.get(row.id) || []).sort(
      (a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position,
    )
    return {
      ...mapListingRowToProperty(row),
      photoMetadata,
      images: photoMetadata.map((photo) => photo.src).filter(Boolean),
      ownerName: ownerMap[row.owner_id]?.displayName || '',
    }
  })
}

async function loadListingsState() {
  const [publicRows, myRows] = await Promise.all([fetchPublicListings(), fetchMyListings()])
  const [publicListings, myListings] = await Promise.all([
    attachImagesAndOwners(publicRows),
    attachImagesAndOwners(myRows),
  ])
  return { publicListings, myListings, loading: false, error: null }
}

// The single real, Supabase-backed source of truth for listings/listing_images/Storage — see
// config/listingAdapter.js and services/listingsService.js. Every write action below re-fetches
// afterward rather than optimistically patching local state: the backend (RLS, category CHECK
// constraints, request_listing_review()'s readiness rules) is authoritative, so re-reading its
// actual result is simpler and strictly more correct than trying to predict it client-side.
export function ListingsProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshListings = useCallback(async () => {
    const next = await loadListingsState()
    setState(next)
  }, [])

  // ListingsProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx), the
  // same guarantee AccountProfileProvider relies on — `user` is non-null for this component's
  // entire lifetime, and AuthGate itself unmounts this subtree on sign-out rather than
  // re-rendering it with a null user.
  useEffect(() => {
    let cancelled = false
    loadListingsState()
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

  const createListing = useCallback(
    async (fields) => {
      try {
        const row = await createListingDraft(user.id, fields)
        await refreshListings()
        return { data: mapListingRowToProperty(row), error: null }
      } catch (error) {
        return { data: null, error: error.message }
      }
    },
    [user, refreshListings],
  )

  const updateListing = useCallback(
    async (listingId, fields) => {
      try {
        const row = await updateListingFields(listingId, fields)
        await refreshListings()
        return { data: mapListingRowToProperty(row), error: null }
      } catch (error) {
        return { data: null, error: error.message }
      }
    },
    [refreshListings],
  )

  const requestReview = useCallback(
    async (listingId) => {
      try {
        await requestListingReviewRequest(listingId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const withdrawReview = useCallback(
    async (listingId) => {
      try {
        await withdrawListingFromReviewRequest(listingId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const pauseListing = useCallback(
    async (listingId) => {
      try {
        await pauseListingRequest(listingId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const resumeListing = useCallback(
    async (listingId) => {
      try {
        await resumeListingRequest(listingId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const markRented = useCallback(
    async (listingId) => {
      try {
        await markListingRentedRequest(listingId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const uploadImage = useCallback(
    async (listingId, file, options) => {
      try {
        const result = await uploadAndRegisterListingImage(listingId, file, options)
        await refreshListings()
        return { data: result, error: null }
      } catch (error) {
        return { data: null, error: error.message }
      }
    },
    [refreshListings],
  )

  const deleteImage = useCallback(
    async (imageId, storagePath) => {
      try {
        await deleteListingImageRequest(imageId)
        if (storagePath) forgetSignedUrl(storagePath)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const setCoverImage = useCallback(
    async (listingId, imageId) => {
      try {
        await setListingCoverImageRequest(listingId, imageId)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const reorderImages = useCallback(
    async (listingId, imageIds) => {
      try {
        await reorderListingImagesRequest(listingId, imageIds)
        await refreshListings()
        return { error: null }
      } catch (error) {
        return { error: error.message }
      }
    },
    [refreshListings],
  )

  const value = {
    publicListings: state.publicListings,
    myListings: state.myListings,
    loading: state.loading,
    error: state.error,
    refreshListings,
    createListing,
    updateListing,
    requestReview,
    withdrawReview,
    pauseListing,
    resumeListing,
    markRented,
    uploadImage,
    deleteImage,
    setCoverImage,
    reorderImages,
  }

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>
}
