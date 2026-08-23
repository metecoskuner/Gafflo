import { describe, expect, it } from 'vitest'
import { mapApplicationRowToApplication } from '../config/applicationAdapter'
import { normalizeSupportEmail } from '../config/support'
import { describeApplicationError } from '../config/applicationErrors'
import { filterConversationsByRole, isTenantWaitingForLandlordReply, mapConversationRowToConversation } from '../config/messageAdapter'
import { describeMessagingError } from '../config/messagingErrors'
import { combineLocalDateAndTimeToIso, getActiveViewingForApplication, mapViewingProposalRowToProposal } from '../config/viewingAdapter'
import { describeViewingError } from '../config/viewingErrors'
import { validateProposedSlots } from '../config/viewingStatus'
import {
  filterAvailableSmartMatchCandidates,
  mapDecisionRowsToMap,
  mapSavedListingRowsToIdSet,
  mapUsageRowToSmartMatchUsage,
} from '../config/engagementAdapter'
import { describeEngagementError } from '../config/engagementErrors'
import {
  filterUnreadNotifications,
  getNotificationRoute,
  getUnreadCount,
  mapNotificationRowToNotification,
} from '../config/notificationAdapter'
import {
  emptyListingAnalytics,
  mapListingAnalyticsRowToAnalytics,
  mapListingAnalyticsRowsToMap,
} from '../config/listingAnalyticsAdapter'
import { LISTING_REPORT_REASONS, listingReportReasonLabel } from '../config/listingReportsAdapter'
import {
  listingSummaryLabel,
  mapListingRowToPendingListing,
  mapReportRowToReport,
} from '../config/moderationAdapter'
import {
  applicantPipelineTabs,
  getApplicationPipelineGroup,
  getApplicationStatusInfo,
  getLandlordApplicationActions,
  isLandlordEngagedApplicationStatus,
  isTerminalApplicationStatus,
} from '../config/applicationStatus'
import { normalizePetPolicy, normalizePropertyType, normalizeLeaseMonths, normalizeSmoking } from '../config/domainOptions'
import { filterApplicantsByProperty, getValidApplicantPropertyId } from '../config/applicantFilters'
import { cityOptions, normalizePreferredAreas, resetAreasForCityChange } from '../config/locationOptions'
import { getBrowseFacts, getSmartMatchFacts, shouldShowTenantMatch } from '../config/listingPresentation'
import { getDurableListingImages, getDurablePhotoMetadata, normalizePhotoMetadata, validatePhotoFiles } from '../config/photoMetadata'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import {
  LISTING_CATEGORIES,
  canChangeListingCategory,
  getListingCompleteness,
  inferListingCategory,
  normalizeListingForStorage,
  normalizeListingDraftForStorage,
  normalizeListingFormState,
  validateListingForReview,
  validateRoomCapacity,
} from '../config/listingCategories'
import { canListingReceiveEnquiry, canTransitionListing, canViewListing, getListingActions } from '../config/listingLifecycle'
import {
  canBoostListing,
  canRewind,
  canSendPremiumFollowUp,
  canUseAdvancedFilters,
  getActiveListingAllowance,
  getInterestAllowance,
  getSmartMatchAllowance,
} from '../config/entitlements'
import { LANDLORD_PLAN, pricingPlans, TENANT_PLAN } from '../config/pricingPlans'
import { sortBySmartMatchScore, sortForBrowseExposure } from '../config/promotion'
import { getMissingCoreMatchFacts, getTenantProfileCompleteness, getTrustSignals, getTrustStatusLabel, hasCoreMatchFacts } from '../config/rentalJourney'
import { normalizeTenantProfileForState, normalizeTenantProfileForStorage } from '../config/tenantProfile'
import { getVisibleMvpMockProperties } from '../config/fixtureFilters'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { directionalDayGap, isPastIsoDate } from '../utils/dateUtils'
import { sanitizeMessageBody } from '../utils/messagingRules'

const tenant = {
  targetCity: 'Dublin',
  preferredAreas: ['Rathmines'],
  budgetMin: 1400,
  budgetMax: 2200,
  moveInDate: '2027-02-01',
  householdSize: 2,
  leaseLength: '12',
  furnishedPreference: 'furnished',
  parkingNeeded: 'no',
  smoking: 'no',
  pets: 'none',
  referencesReady: true,
  incomeReady: true,
  idReady: true,
}

const property = {
  city: 'Dublin',
  area: 'Rathmines',
  rent: 1200,
  availableFrom: '2027-02-10',
  maxOccupants: 2,
  minStayMonths: 6,
  furnished: 'furnished',
  parking: 'none',
  smokingAllowed: 'no',
  petsAllowed: 'not_allowed',
}

describe('Stage F — real viewing slot validation (mirrors propose_viewing() exactly)', () => {
  const now = new Date('2030-01-01T00:00:00.000Z')
  const future1 = { startsAt: '2030-01-02T11:00:00.000Z', endsAt: '2030-01-02T11:30:00.000Z' }
  const future2 = { startsAt: '2030-01-02T12:00:00.000Z', endsAt: '2030-01-02T12:30:00.000Z' }
  const future3 = { startsAt: '2030-01-02T13:00:00.000Z', endsAt: '2030-01-02T13:30:00.000Z' }
  const future4 = { startsAt: '2030-01-02T14:00:00.000Z', endsAt: '2030-01-02T14:30:00.000Z' }

  it('accepts 1, 2, or 3 valid future slots', () => {
    expect(validateProposedSlots([future1], now).valid).toBe(true)
    expect(validateProposedSlots([future1, future2], now).valid).toBe(true)
    expect(validateProposedSlots([future1, future2, future3], now).valid).toBe(true)
  })

  it('rejects zero slots and more than 3 slots', () => {
    expect(validateProposedSlots([], now).valid).toBe(false)
    expect(validateProposedSlots([future1, future2, future3, future4], now).valid).toBe(false)
  })

  it('rejects a past slot', () => {
    expect(validateProposedSlots([{ startsAt: '2020-01-02T11:00:00.000Z', endsAt: '2020-01-02T11:30:00.000Z' }], now).valid).toBe(false)
  })

  it('rejects end time at or before start time', () => {
    expect(validateProposedSlots([{ startsAt: '2030-01-02T11:00:00.000Z', endsAt: '2030-01-02T11:00:00.000Z' }], now).valid).toBe(false)
    expect(validateProposedSlots([{ startsAt: '2030-01-02T11:00:00.000Z', endsAt: '2030-01-02T10:30:00.000Z' }], now).valid).toBe(false)
  })

  it('rejects duplicate start times and blank/invalid slots', () => {
    expect(validateProposedSlots([future1, future1], now).valid).toBe(false)
    expect(validateProposedSlots([{ startsAt: null, endsAt: null }], now).valid).toBe(false)
    expect(validateProposedSlots([{ startsAt: 'not a date', endsAt: 'not a date' }], now).valid).toBe(false)
  })
})

describe('Stage F — timezone-safe local date/time combination', () => {
  it('interprets date+time as local wall-clock time, never as UTC', () => {
    // A 2030-06-15 18:30 local input must round-trip back to 18:30 when read back with the same
    // local-timezone formatting utility used for display (formatViewingSlotDateTime) — proving
    // this never silently shifts by whatever the test runner's local UTC offset happens to be.
    const iso = combineLocalDateAndTimeToIso('2030-06-15', '18:30')
    const readBack = new Date(iso)
    expect(readBack.getHours()).toBe(18)
    expect(readBack.getMinutes()).toBe(30)
    expect(readBack.getFullYear()).toBe(2030)
    expect(readBack.getMonth()).toBe(5) // June, 0-indexed
    expect(readBack.getDate()).toBe(15)
  })

  it('returns null for blank or incomplete input rather than fabricating a time', () => {
    expect(combineLocalDateAndTimeToIso('', '18:30')).toBeNull()
    expect(combineLocalDateAndTimeToIso('2030-06-15', '')).toBeNull()
    expect(combineLocalDateAndTimeToIso(null, null)).toBeNull()
  })
})

describe('Stage F — real viewing proposal adapter', () => {
  const row = {
    id: 'proposal-1',
    application_id: 'app-1',
    landlord_id: 'landlord-1',
    tenant_id: 'tenant-1',
    status: 'confirmed',
    confirmed_slot_id: 'slot-2',
    created_at: '2030-01-01T00:00:00.000Z',
    updated_at: '2030-01-01T01:00:00.000Z',
    responded_at: '2030-01-01T01:00:00.000Z',
    cancelled_at: null,
    viewing_slots: [
      { id: 'slot-2', starts_at: '2030-01-03T12:00:00.000Z', ends_at: '2030-01-03T12:30:00.000Z' },
      { id: 'slot-1', starts_at: '2030-01-02T11:00:00.000Z', ends_at: '2030-01-02T11:30:00.000Z' },
    ],
  }

  it('resolves the accepted slot from confirmed_slot_id and sorts slots chronologically', () => {
    const proposal = mapViewingProposalRowToProposal(row, { userId: 'tenant-1' })
    expect(proposal.slots.map((slot) => slot.id)).toEqual(['slot-1', 'slot-2'])
    expect(proposal.acceptedSlot.id).toBe('slot-2')
  })

  it('derives isTenant from the real participant id, never a passed-in role flag', () => {
    expect(mapViewingProposalRowToProposal(row, { userId: 'tenant-1' }).isTenant).toBe(true)
    expect(mapViewingProposalRowToProposal(row, { userId: 'landlord-1' }).isTenant).toBe(false)
  })

  it('getActiveViewingForApplication only ever returns a pending or confirmed proposal for that application', () => {
    const pending = mapViewingProposalRowToProposal({ ...row, id: 'proposal-pending', status: 'pending', confirmed_slot_id: null }, { userId: 'tenant-1' })
    const declined = mapViewingProposalRowToProposal({ ...row, id: 'proposal-declined', application_id: 'app-2', status: 'declined' }, { userId: 'tenant-1' })
    const confirmed = mapViewingProposalRowToProposal(row, { userId: 'tenant-1' })
    expect(getActiveViewingForApplication([declined, confirmed], 'app-1')).toEqual(confirmed)
    expect(getActiveViewingForApplication([declined], 'app-2')).toBeNull()
    expect(getActiveViewingForApplication([pending], 'app-1').status).toBe('pending')
  })
})

describe('Stage F — viewing error normalization', () => {
  it('maps known 42501/P0001/23505 backend messages to safe, specific user copy', () => {
    expect(describeViewingError({ code: '23505', message: 'anything' })).toBe('This application already has an open viewing proposal.')
    expect(describeViewingError({ code: '42501', message: 'This viewing cannot be confirmed right now' })).toBe('This viewing cannot be confirmed right now.')
    expect(describeViewingError({ code: 'P0001', message: "Each viewing slot's end time must be after its start time" })).toBe('Each end time must be after its start time.')
  })

  it('handles the one interpolated backend message via prefix match, not exact equality', () => {
    expect(describeViewingError({ code: 'P0001', message: 'A viewing can only be proposed for a shortlisted application (current status: sent)' })).toBe(
      'A viewing can only be proposed for a shortlisted application.',
    )
  })

  it('never leaks a raw/unknown backend message or missing error as user-facing text', () => {
    expect(describeViewingError(null)).toBe('Something went wrong. Please try again.')
    expect(describeViewingError({ code: '42501', message: 'some new unmapped backend string' })).toBe('Something went wrong. Please try again.')
  })
})

describe('messaging rules', () => {
  it('sanitizes whitespace and enforces the real backend length ceiling', () => {
    expect(sanitizeMessageBody('  Hi\n\nthere  ')).toBe('Hi there')
    expect(sanitizeMessageBody('x'.repeat(2000)).length).toBe(1200)
    expect(sanitizeMessageBody('   ')).toBe('')
  })
})

describe('matching and dates', () => {
  it('does not penalize cheaper rent and caps hard stops', () => {
    const result = calculatePropertyMatch(tenant, { ...property, maxOccupants: 1 })
    expect(result.reasons).toContain('The monthly rent is below your stated minimum budget.')
    expect(result.hardStops).toContain('The listed maximum occupancy is too small for your household.')
    expect(result.score).toBeLessThanOrEqual(58)
  })

  it('uses directional local date gaps and avoids invalid date positives', () => {
    expect(directionalDayGap('2027-02-01', '2027-02-10')).toBe(9)
    expect(isPastIsoDate('2027-02-01', '2027-02-02')).toBe(true)
    const result = calculatePropertyMatch(tenant, { ...property, availableFrom: 'not-a-date' })
    expect(result.warnings).toContain('Move-in timing is incomplete, so date fit is not scored.')
  })

  it('never treats a skipped budget as a €0 maximum — unknown budget is unscored, not a hard stop', () => {
    const skippedBudget = { ...tenant, budgetMin: null, budgetMax: null }
    const result = calculatePropertyMatch(skippedBudget, property)
    expect(result.warnings).toContain('Your budget is flexible, so rent fit is not scored.')
    expect(result.hardStops).toHaveLength(0)
    expect(result.reasons).not.toContain('The monthly rent is within your budget.')
    expect(result.reasons).not.toContain('The monthly rent is below your stated minimum budget.')
    expect(result.score).toBeGreaterThan(58)

    // undefined and '' must be treated the same as null.
    expect(calculatePropertyMatch({ ...tenant, budgetMin: undefined, budgetMax: undefined }, property).warnings).toContain(
      'Your budget is flexible, so rent fit is not scored.',
    )
    expect(calculatePropertyMatch({ ...tenant, budgetMin: '', budgetMax: '' }, property).warnings).toContain(
      'Your budget is flexible, so rent fit is not scored.',
    )
  })

  it('scores a partial budget by treating the unset side as unbounded, not as zero', () => {
    const maxOnly = calculatePropertyMatch({ ...tenant, budgetMin: null, budgetMax: 1500 }, property)
    expect(maxOnly.reasons).toContain('The monthly rent is within your budget.')
    expect(maxOnly.hardStops).toHaveLength(0)

    const minOnly = calculatePropertyMatch({ ...tenant, budgetMin: 1000, budgetMax: null }, { ...property, rent: 5000 })
    expect(minOnly.reasons).toContain('The monthly rent is within your budget.')
    expect(minOnly.hardStops).toHaveLength(0)
  })

  it('does not silently invent a household size or move-in date for a skipped onboarding profile', () => {
    const minimalProfile = { targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null }
    const result = calculatePropertyMatch(minimalProfile, property)
    expect(result.warnings).toContain('Move-in timing is incomplete, so date fit is not scored.')
    expect(result.warnings).toContain('Your budget is flexible, so rent fit is not scored.')
    expect(result.hardStops).toHaveLength(0)
    expect(result.score).toBeGreaterThan(58)
  })

  it('applies room matching hard stops and preferences', () => {
    const room = {
      ...property,
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      roomType: 'double',
      bathroomArrangement: 'shared',
      maxOccupants: 1,
      currentHouseholdSize: 1,
      maxHouseholdSize: 2,
      couplesAccepted: false,
      billsIncluded: false,
    }
    const result = calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: true, privateBathroomPreferred: true, billsIncludedPreferred: true }, room)
    expect(result.hardStops).toContain('Couples are not accepted for this room.')
    expect(result.hardStops).toContain('Household capacity exceeded.')
    expect(result.warnings).toContain('This room has a shared bathroom.')
    expect(result.warnings).toContain('Bills are separate for this room.')
  })

  it('does not infer couple status from household size alone', () => {
    const room = {
      ...property,
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      maxOccupants: 2,
      currentHouseholdSize: 0,
      maxHouseholdSize: 2,
      couplesAccepted: false,
    }
    const result = calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: false }, room)
    expect(result.hardStops).not.toContain('Couples are not accepted for this room.')
  })

  it('separates room applicant count from actual couple status', () => {
    const room = {
      ...property,
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      maxOccupants: 2,
      currentHouseholdSize: 0,
      maxHouseholdSize: 2,
      couplesAccepted: false,
    }
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: false }, room).hardStops).not.toContain('Couples are not accepted for this room.')
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: true }, room).hardStops).toContain('Couples are not accepted for this room.')
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: false }, { ...room, maxOccupants: 1 }).hardStops).toContain('This room occupancy is too small for the applicants.')
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, applyingAsCouple: false }, { ...room, maxHouseholdSize: 3 }).hardStops).not.toContain('Household capacity exceeded.')
  })

  it('treats pets considered as possible fit instead of guaranteed acceptance', () => {
    const considered = calculatePropertyMatch({ ...tenant, pets: 'dog' }, { ...property, petsAllowed: 'considered' })
    expect(considered.warnings).toContain('Pets are considered for this listing, but acceptance is not guaranteed.')
    expect(considered.hardStops).not.toContain('Some listing rules may not fit your smoking or pet preferences.')
    expect(calculatePropertyMatch({ ...tenant, pets: 'dog' }, { ...property, petsAllowed: 'not_allowed' }).hardStops).toContain('Some listing rules may not fit your smoking or pet preferences.')
  })

  it('honours owner occupied tenant preference only when explicitly excluded', () => {
    const room = {
      ...property,
      listingCategory: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
      roomType: 'ensuite',
      bathroomArrangement: 'ensuite',
      maxOccupants: 1,
      currentHouseholdSize: 1,
      maxHouseholdSize: 2,
      couplesAccepted: false,
    }
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 1, ownerOccupiedAcceptable: false }, room).hardStops).toContain('Owner-occupied excluded by tenant preference.')
    const acceptableResult = calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 1, ownerOccupiedAcceptable: true }, room)
    expect(acceptableResult.hardStops).not.toContain('Owner-occupied excluded by tenant preference.')
    expect(acceptableResult.reasons).toContain('Owner lives in the property.')
    expect(acceptableResult.reasons).not.toContain('Owner lives here, which fits your room preference.')
  })

  it('rewards room private bathroom preference when available', () => {
    const room = {
      ...property,
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      roomType: 'ensuite',
      bathroomArrangement: 'ensuite',
      maxOccupants: 1,
      currentHouseholdSize: 1,
      maxHouseholdSize: 2,
      couplesAccepted: false,
    }
    expect(calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 1, privateBathroomPreferred: true }, room).reasons).toContain('The bathroom arrangement matches your private bathroom preference.')
  })
})

describe('domain and listing rules', () => {
  it('normalizes shared domain values', () => {
    expect(normalizePropertyType('One-bedroom apartment')).toBe('apartment')
    expect(normalizeLeaseMonths('12+ months')).toBe('12')
    expect(normalizeSmoking('Outside only')).toBe('outside_only')
  })

  it('limits listing lifecycle and discovery eligibility', () => {
    expect(canTransitionListing('pending_verification', 'published')).toBe(false)
    expect(canTransitionListing('paused', 'published')).toBe(true)
    expect(canListingReceiveEnquiry({ listingStatus: 'rented' })).toBe(false)
    expect(propertyMatchesFilters({ ...property, listingStatus: 'rented' }, { location: 'Any', listingCategory: 'Any' })).toBe(false)
    expect(normalizePetPolicy('Pets allowed')).toBe('allowed')
  })

  it('blocks generic edits from faking a listing status transition', () => {
    expect(canTransitionListing('rented', 'published')).toBe(false)
    expect(canTransitionListing('published', 'pending_verification')).toBe(false)
    expect(canTransitionListing('published', 'draft')).toBe(false)
    expect(canTransitionListing('rejected', 'pending_verification')).toBe(true)
    expect(canTransitionListing('draft', 'pending_verification')).toBe(true)
  })

  it('centralizes cities and canonical preferred areas', () => {
    expect(cityOptions).toEqual(['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford'])
    expect(normalizePreferredAreas([' rathmines ', 'Rathmines', 'Custom Dock'], 'Dublin')).toEqual(['Rathmines', 'Custom Dock'])
    expect(resetAreasForCityChange('Dublin', 'Cork')).toEqual({ targetCity: 'Cork', preferredAreas: [], areaDraft: '' })
  })
})

describe('listing categories', () => {
  const validBase = {
    title: 'Bright listing in Rathmines',
    rent: 1200,
    deposit: 1200,
    area: 'Rathmines',
    availableFrom: '2030-02-01',
    minStayMonths: 6,
    description: 'A clear listing description with enough detail for renters to understand the home.',
    bathrooms: 1,
  }

  it('normalizes category and legacy property values', () => {
    expect(normalizeListingForStorage({ propertyType: 'One-bedroom apartment', bedrooms: 1 }).listingCategory).toBe(LISTING_CATEGORIES.ENTIRE_PROPERTY)
    expect(normalizeListingForStorage({ propertyType: 'One-bedroom apartment', bedrooms: 1 }).propertyType).toBe('apartment')
    expect(inferListingCategory({ roomType: 'Double' })).toBe(LISTING_CATEGORIES.PRIVATE_ROOM)
    expect(inferListingCategory({ ownerLivesInProperty: true })).toBe(LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM)
  })

  it('filters by listing category and room-specific options', () => {
    const room = {
      ...property,
      listingStatus: 'published',
      listingCategory: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
      roomType: 'double',
      bathroomArrangement: 'private',
      billsIncluded: true,
      couplesAccepted: true,
      furnished: 'furnished',
      parking: 'none',
    }
    expect(propertyMatchesFilters(room, { location: 'Any', listingCategory: 'room', privateBathroom: 'Required', billsIncluded: 'Required', ownerOccupied: 'Required', couplesAccepted: 'Required', roomType: 'double', furnishedPreference: 'Any', parking: 'Any', bedrooms: 'Any', pets: 'Any', leaseLength: 'Any' })).toBe(true)
    expect(propertyMatchesFilters(room, { location: 'Any', listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, furnishedPreference: 'Any', parking: 'Any', bedrooms: 'Any', pets: 'Any', leaseLength: 'Any' })).toBe(false)
  })

  it('returns category-specific card labels from pure presentation helpers', () => {
    const entireFacts = getSmartMatchFacts({ ...property, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: 2, furnished: 'furnished', parking: 'included', billsIncluded: false })
    const roomFacts = getBrowseFacts({ ...property, listingCategory: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM, roomType: 'ensuite', bathroomArrangement: 'ensuite', billsIncluded: true })
    expect(entireFacts.map((fact) => fact.label)).toContain('Beds')
    expect(roomFacts).toContainEqual({ label: 'Owner', value: 'Owner lives here' })
  })

  it('normalizes photo metadata by category and rejects invalid files', () => {
    const photos = normalizePhotoMetadata([{ src: 'a', label: 'Kitchen' }, { src: 'a', label: 'Other' }, { src: 'b', label: 'Bathroom' }], LISTING_CATEGORIES.PRIVATE_ROOM)
    expect(photos).toHaveLength(2)
    expect(photos[0].label).toBe('Kitchen')
    expect(photos[0].isCover).toBe(true)
    const file = { name: 'notes.txt', type: 'text/plain', size: 10 }
    expect(validatePhotoFiles([file], []).errors[0]).toBe("notes.txt isn't a supported photo format. Use JPEG, PNG, or WEBP.")
    // Stage O: the accepted set is the exact three mime types the backend allows (Storage bucket
    // + listing_images_mime_allowed CHECK), not merely image/* — HEIC (common on iPhone), GIF,
    // etc. must be caught here with a clear message rather than reaching a raw Storage error.
    const heicFile = { name: 'photo.heic', type: 'image/heic', size: 10 }
    expect(validatePhotoFiles([heicFile], []).errors[0]).toBe("photo.heic isn't a supported photo format. Use JPEG, PNG, or WEBP.")
  })

  it('keeps session object URLs out of durable listing photos', () => {
    const fallback = 'https://images.example.test/fallback.jpg'
    const remote = 'https://images.example.test/remote.jpg'
    const photos = [
      { src: 'blob:http://localhost/session-photo', label: 'Cover / Room' },
      { src: remote, label: 'Kitchen' },
    ]
    expect(getDurablePhotoMetadata(photos, LISTING_CATEGORIES.PRIVATE_ROOM).map((photo) => photo.src)).toEqual([remote])
    expect(getDurableListingImages(photos, fallback, LISTING_CATEGORIES.PRIVATE_ROOM)).toEqual([remote])
    expect(getDurableListingImages([{ src: 'blob:http://localhost/only-session-photo' }], fallback, LISTING_CATEGORIES.PRIVATE_ROOM)).toEqual([fallback])
  })

  it('normalizes studio bedrooms separately from property type labels', () => {
    const listing = normalizeListingForStorage({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'studio', bedrooms: 2 })
    expect(listing.propertyType).toBe('studio')
    expect(listing.bedrooms).toBe(0)
  })

  it('normalizes room ownership flags by category', () => {
    expect(normalizeListingForStorage({ listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, ownerLivesInProperty: true }).ownerLivesInProperty).toBe(false)
    expect(normalizeListingForStorage({ listingCategory: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM, ownerLivesInProperty: false }).ownerLivesInProperty).toBe(true)
  })

  it('uses category-specific required fields', () => {
    const entire = validateListingForReview({ ...validBase, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: 1, maxOccupants: 1 }, '2030-01-01', { photoCount: 1 })
    const room = validateListingForReview(
      {
        ...validBase,
        listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
        roomType: 'double',
        bathroomArrangement: 'shared',
        maxOccupants: 1,
        totalBedrooms: 3,
        currentHouseholdSize: 2,
        maxHouseholdSize: 3,
      },
      '2030-01-01',
      { photoCount: 1 },
    )
    expect(entire.valid).toBe(true)
    expect(room.valid).toBe(true)
    expect(validateListingForReview({ ...validBase, listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM }, '2030-01-01').valid).toBe(false)
  })

  it('validates room capacity', () => {
    expect(validateRoomCapacity({ currentHouseholdSize: 2, maxHouseholdSize: 2, maxOccupants: 1 }).errors.maxHouseholdSize).toBe('Max household size must fit the current household plus this room occupancy.')
    expect(validateRoomCapacity({ currentHouseholdSize: 2, maxHouseholdSize: 3, maxOccupants: 1 }).valid).toBe(true)
    expect(validateRoomCapacity({ listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, currentHouseholdSize: 0, maxHouseholdSize: 1, maxOccupants: 1 }).valid).toBe(true)
    expect(validateRoomCapacity({ listingCategory: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM, currentHouseholdSize: 0, maxHouseholdSize: 1, maxOccupants: 1 }).errors.currentHouseholdSize).toBe('Owner-occupied rooms must include the owner in the current household.')
  })

  it('protects unsafe category changes by lifecycle state', () => {
    expect(canChangeListingCategory({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, listingStatus: 'draft' }, LISTING_CATEGORIES.PRIVATE_ROOM).requiresConfirmation).toBe(true)
    expect(canChangeListingCategory({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, listingStatus: 'pending_verification' }, LISTING_CATEGORIES.PRIVATE_ROOM).allowed).toBe(false)
    expect(canChangeListingCategory({ listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, listingStatus: 'draft' }, LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM).allowed).toBe(true)
  })

  it('calculates listing completeness per category', () => {
    expect(getListingCompleteness({ ...validBase, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'studio', maxOccupants: 1 }, '2030-01-01', { photoCount: 1 }).complete).toBe(true)
    expect(getListingCompleteness({ ...validBase, listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, roomType: 'double' }, '2030-01-01').complete).toBe(false)
  })

  it('keeps listing completeness consistent with review photo requirements', () => {
    const entire = { ...validBase, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: 1, maxOccupants: 2 }
    expect(getListingCompleteness(entire, '2030-01-01', { photoCount: 1 }).complete).toBe(true)
    expect(getListingCompleteness(entire, '2030-01-01').complete).toBe(false)
    expect(getListingCompleteness(entire, '2030-01-01').missing).toContain('images')
  })

  it('marks every review validation error as incomplete', () => {
    const complete = { ...validBase, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: 1, maxOccupants: 2 }
    expect(getListingCompleteness({ ...complete, title: '' }, '2030-01-01', { photoCount: 1 }).complete).toBe(false)
    expect(getListingCompleteness({ ...complete, bathrooms: '' }, '2030-01-01', { photoCount: 1 }).complete).toBe(false)
    expect(getListingCompleteness({ ...complete, maxOccupants: '' }, '2030-01-01', { photoCount: 1 }).complete).toBe(false)
    expect(getListingCompleteness({ ...complete, minStayMonths: '' }, '2030-01-01', { photoCount: 1 }).complete).toBe(false)
    expect(getListingCompleteness(complete, '2030-01-01').complete).toBe(false)
  })

  it('marks room listings incomplete without a required room photo', () => {
    const room = {
      ...validBase,
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      roomType: 'double',
      bathroomArrangement: 'shared',
      maxOccupants: 1,
      totalBedrooms: 3,
      currentHouseholdSize: 0,
      maxHouseholdSize: 1,
    }
    expect(getListingCompleteness(room, '2030-01-01').complete).toBe(false)
    expect(getListingCompleteness(room, '2030-01-01').missing).toContain('images')
  })
})

describe('listing and conversation access control', () => {
  const publicListing = { ownerId: 'owner-a', listingStatus: 'published' }
  const hiddenListing = { ownerId: 'owner-a', listingStatus: 'paused' }

  it('lets anyone view a public listing', () => {
    expect(canViewListing({ role: 'tenant', viewerId: 'tenant-1', property: publicListing }).allowed).toBe(true)
    expect(canViewListing({ role: 'tenant', viewerId: 'tenant-1', property: publicListing }).mode).toBe('public')
  })

  it('lets a landlord manage their own listing regardless of status', () => {
    const result = canViewListing({ role: 'landlord', viewerId: 'owner-a', property: hiddenListing })
    expect(result).toEqual({ allowed: true, mode: 'own' })
  })

  it('blocks a landlord from viewing another landlord\'s hidden listing', () => {
    expect(canViewListing({ role: 'landlord', viewerId: 'owner-b', property: hiddenListing }).allowed).toBe(false)
  })

  it('blocks a tenant from an inactive listing with no history, but allows historical access', () => {
    expect(canViewListing({ role: 'tenant', viewerId: 'tenant-1', property: hiddenListing }).allowed).toBe(false)
    const historical = canViewListing({ role: 'tenant', viewerId: 'tenant-1', property: hiddenListing, hasHistoricalRelationship: true })
    expect(historical).toEqual({ allowed: true, mode: 'historical' })
  })

  it('reports no access for a missing property', () => {
    expect(canViewListing({ role: 'tenant', viewerId: 'tenant-1', property: null })).toEqual({ allowed: false, mode: 'none' })
  })
})

describe('frontend integrity helpers', () => {
  it('keeps editable blank numeric form state separate from storage normalization', () => {
    const form = normalizeListingFormState({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: '', bathrooms: '' })
    expect(form.bedrooms).toBe('')
    expect(form.bathrooms).toBe('')
    expect(validateListingForReview({ ...form, title: 'Valid title', rent: 1200, deposit: 1200, area: 'Rathmines', availableFrom: '2030-01-01', minStayMonths: 6, maxOccupants: 1, description: 'A clear listing description with enough detail for renters.' }, '2029-01-01', { photoCount: 1 }).errors).toMatchObject({
      bedrooms: 'Add the number of bedrooms.',
      bathrooms: 'Add the number of bathrooms.',
    })
  })

  it('stores studio bedrooms as zero without forcing apartment bedroom inputs', () => {
    const form = normalizeListingFormState({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'studio', bedrooms: '' })
    expect(form.bedrooms).toBe('0')
    expect(normalizeListingForStorage(form).bedrooms).toBe(0)
  })

  it('preserves missing numeric values for incomplete saved drafts', () => {
    const apartmentDraft = normalizeListingDraftForStorage({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'apartment', bedrooms: '', bathrooms: '' })
    expect(apartmentDraft).toMatchObject({
      bedrooms: null,
      bathrooms: null,
    })
    expect(normalizeListingFormState(apartmentDraft)).toMatchObject({ bedrooms: '', bathrooms: '' })

    const roomDraft = normalizeListingDraftForStorage({ listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, totalBedrooms: '', currentHouseholdSize: '', maxHouseholdSize: '', maxOccupants: '' })
    expect(roomDraft).toMatchObject({
      totalBedrooms: null,
      currentHouseholdSize: null,
      maxHouseholdSize: null,
      maxOccupants: null,
    })
    expect(normalizeListingFormState(roomDraft)).toMatchObject({ totalBedrooms: '', currentHouseholdSize: '', maxHouseholdSize: '', maxOccupants: '' })
    expect(normalizeListingDraftForStorage({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'studio', bedrooms: '' }).bedrooms).toBe(0)
  })

  it('preserves missing enum values for incomplete saved drafts', () => {
    const apartmentDraft = normalizeListingDraftForStorage({
      listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY,
      propertyType: '',
      furnished: '',
      parking: '',
      smokingAllowed: '',
      petsAllowed: '',
    })
    expect(apartmentDraft).toMatchObject({
      propertyType: null,
      furnished: null,
      parking: null,
      smokingAllowed: null,
      petsAllowed: null,
    })

    const roomDraft = normalizeListingDraftForStorage({
      listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM,
      parentPropertyType: '',
      roomType: '',
      bathroomArrangement: '',
    })
    expect(roomDraft).toMatchObject({
      propertyType: null,
      parentPropertyType: null,
      roomType: null,
      bathroomArrangement: null,
    })
  })

  it('normalizes legacy coupleRequirement on load but stores only applyingAsCouple', () => {
    const loaded = normalizeTenantProfileForState({ householdSize: 2, coupleRequirement: true })
    expect(loaded).toMatchObject({ householdSize: 2, applyingAsCouple: true })
    expect(loaded).not.toHaveProperty('coupleRequirement')

    const stored = normalizeTenantProfileForStorage({ householdSize: 2, coupleRequirement: true }, { targetCity: 'Dublin' })
    expect(stored).toMatchObject({ householdSize: 2, applyingAsCouple: true })
    expect(stored).not.toHaveProperty('coupleRequirement')
  })

  it('raises household size to at least 2 for a couple instead of silently discarding couple status', () => {
    // A stale/externally-written profile with couple: true but householdSize under 2 must have
    // its household size corrected up on reload, never have the couple flag quietly dropped.
    expect(normalizeTenantProfileForState({ householdSize: 1, applyingAsCouple: true })).toMatchObject({
      householdSize: 2,
      applyingAsCouple: true,
    })
    expect(normalizeTenantProfileForState({ householdSize: null, applyingAsCouple: true })).toMatchObject({
      householdSize: 2,
      applyingAsCouple: true,
    })
    // Already 2+ stays exactly as given (3 applicants + couple stays 3, never clamped down to 2).
    expect(normalizeTenantProfileForState({ householdSize: 3, applyingAsCouple: true })).toMatchObject({
      householdSize: 3,
      applyingAsCouple: true,
    })
    // Not a couple: household size (including unknown/null) is left completely untouched.
    expect(normalizeTenantProfileForState({ householdSize: null, applyingAsCouple: false })).toMatchObject({
      householdSize: null,
      applyingAsCouple: false,
    })
    expect(normalizeTenantProfileForState({ householdSize: 2, applyingAsCouple: false })).toMatchObject({
      householdSize: 2,
      applyingAsCouple: false,
    })

    const stored = normalizeTenantProfileForStorage({ householdSize: 1, applyingAsCouple: true }, { targetCity: 'Dublin' })
    expect(stored).toMatchObject({ householdSize: 2, applyingAsCouple: true })
  })

  it('persists valid completed listings with canonical numeric values', () => {
    const listing = normalizeListingForStorage({
      listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY,
      propertyType: 'apartment',
      bedrooms: '2',
      bathrooms: '1.5',
      maxOccupants: '3',
    })
    expect(listing).toMatchObject({ bedrooms: 2, bathrooms: 1.5, maxOccupants: 3 })
  })

  it('requires session or durable photos for review without persisting blob URLs', () => {
    const listing = {
      title: 'Bright listing',
      rent: 1200,
      deposit: 1200,
      area: 'Rathmines',
      availableFrom: '2030-01-01',
      minStayMonths: 6,
      description: 'A clear listing description with enough detail for renters.',
      listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY,
      propertyType: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      maxOccupants: 1,
    }
    expect(validateListingForReview(listing, '2029-01-01').errors.images).toBe('Add at least one listing photo before requesting review.')
    expect(validateListingForReview(listing, '2029-01-01', { photoCount: 1 }).valid).toBe(true)
    expect(getDurablePhotoMetadata([{ src: 'blob:http://localhost/photo' }], LISTING_CATEGORIES.ENTIRE_PROPERTY)).toEqual([])
  })

  // Stage C: photos are uploaded and durably registered in real Storage the moment a landlord
  // adds them (see CreateListing.jsx) — there is no more session-only/blob-URL intermediate
  // state, so there is no longer a distinct "kept for this session only" message to show. Any
  // zero-photo listing gets the same plain "add a photo" message regardless of history.
  it('requires at least one durable photo before review, with no session-only distinction', () => {
    const listing = {
      title: 'Bright listing',
      rent: 1200,
      deposit: 1200,
      area: 'Rathmines',
      availableFrom: '2030-01-01',
      minStayMonths: 6,
      description: 'A clear listing description with enough detail for renters.',
      listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY,
      propertyType: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      maxOccupants: 1,
    }
    const withNoPhotos = validateListingForReview(listing, '2029-01-01', { photoCount: 0 })
    expect(withNoPhotos.errors.images).toBe('Add at least one listing photo before requesting review.')
    expect(validateListingForReview(listing, '2029-01-01', { photoCount: 1 }).errors.images).toBeUndefined()
  })

  it('filters applicants by valid property query only', () => {
    const properties = [{ id: 'p1' }, { id: 'p2' }]
    const enquiries = [{ propertyId: 'p1' }, { propertyId: 'p2' }]
    expect(getValidApplicantPropertyId('p1', properties)).toBe('p1')
    expect(getValidApplicantPropertyId('missing', properties)).toBe('')
    expect(filterApplicantsByProperty(enquiries, 'p2')).toEqual([{ propertyId: 'p2' }])
  })

  it('hides tenant match presentation for landlord previews', () => {
    expect(shouldShowTenantMatch('tenant')).toBe(true)
    expect(shouldShowTenantMatch('landlord')).toBe(false)
  })

  it('does not present demo trust state as production verification', () => {
    const property = { trust: { internalDemoState: true, landlordVerification: 'verified', propertyVerification: 'verified' } }
    expect(getTrustSignals(property)).toEqual([])
    expect(getTrustStatusLabel('verified', property.trust)).toBe('Not shown')
  })

  it('only reports core match facts complete once move-in date and household size are real, and budget is either a real range or genuinely flexible', () => {
    const skipped = { targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null }
    expect(hasCoreMatchFacts(skipped)).toBe(false)
    expect(hasCoreMatchFacts({ ...skipped, budgetMin: 1200, budgetMax: 1800 })).toBe(false)
    expect(hasCoreMatchFacts({ ...skipped, budgetMin: 1200, budgetMax: 1800, moveInDate: '2030-01-01' })).toBe(false)
    expect(hasCoreMatchFacts({ ...skipped, budgetMin: 1200, budgetMax: 1800, moveInDate: '2030-01-01', householdSize: 1 })).toBe(true)

    // Stage Y2: a still-flexible ("No minimum"/"No maximum") budget must not, by itself, keep
    // this nudge showing once the two facts that actually matter here (move-in date, household
    // size) are real — this is the exact contradiction Stage Y found between this helper and
    // getTenantProfileCompleteness(), now resolved by sharing the same budget-readiness check.
    const readyExceptFlexibleBudget = { ...skipped, budgetMin: null, budgetMax: null, moveInDate: '2030-01-01', householdSize: 1 }
    expect(hasCoreMatchFacts(readyExceptFlexibleBudget)).toBe(true)
    expect(hasCoreMatchFacts({ ...readyExceptFlexibleBudget, budgetMin: '', budgetMax: '' })).toBe(true)

    // A one-sided preference is equally a real, deliberate answer.
    expect(hasCoreMatchFacts({ ...readyExceptFlexibleBudget, budgetMin: 1200, budgetMax: '' })).toBe(true)
    expect(hasCoreMatchFacts({ ...readyExceptFlexibleBudget, budgetMin: '', budgetMax: 2000 })).toBe(true)

    // A genuinely invalid range (min above max) still does not count, even with everything else
    // in place — an actual data contradiction is not the same thing as "flexible."
    expect(hasCoreMatchFacts({ ...readyExceptFlexibleBudget, budgetMin: 2000, budgetMax: 1200 })).toBe(false)
  })

  it('names only the core match facts actually still missing, so the Dashboard nudge never asks for a flexible budget that is already complete', () => {
    // Both budget sides unset is flexible, not missing (Stage Y2) — only move-in date and
    // household size are genuinely absent here.
    const skipped = { targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null }
    expect(getMissingCoreMatchFacts(skipped)).toEqual(['move-in date', 'household size'])
    expect(getMissingCoreMatchFacts({ ...skipped, moveInDate: '2030-01-01', householdSize: 1 })).toEqual([])
    expect(getMissingCoreMatchFacts({ ...skipped, budgetMin: 1200, budgetMax: 1800 })).toEqual(['move-in date', 'household size'])
    expect(getMissingCoreMatchFacts({ ...skipped, budgetMin: 1200, budgetMax: 1800, moveInDate: '2030-01-01' })).toEqual(['household size'])

    // An invalid range (min above max) is a real, still-missing budget gap, unlike flexible.
    expect(getMissingCoreMatchFacts({ ...skipped, budgetMin: 2000, budgetMax: 1200, moveInDate: '2030-01-01', householdSize: 1 })).toEqual(['budget'])
  })

  it('counts a fresh onboarding-only tenant\'s target city and looking-for, and treats a flexible ("No minimum/No maximum") budget as complete, not missing', () => {
    const freshFromOnboarding = { targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, preferredAreas: [] }
    const completeness = getTenantProfileCompleteness(freshFromOnboarding)
    expect(completeness.missing.map((item) => item.id)).not.toContain('targetCity')
    expect(completeness.missing.map((item) => item.id)).not.toContain('lookingFor')
    expect(completeness.missing.map((item) => item.id)).not.toContain('budget')
    expect(completeness.total).toBe(11)
    expect(completeness.completed).toBeGreaterThanOrEqual(2)

    // The empty-string sentinel Profile.jsx's budget selector actually stores for "No minimum"/
    // "No maximum" behaves identically to never having touched the field at all — Stage Y's
    // product decision is not to invent a distinction between the two.
    const explicitlyFlexible = { ...freshFromOnboarding, budgetMin: '', budgetMax: '' }
    expect(getTenantProfileCompleteness(explicitlyFlexible).missing.map((item) => item.id)).not.toContain('budget')

    // A literal 0 (a real value at least one existing tenant profile has) is likewise "no
    // preference," matching Profile.jsx's own budgetSelectValue() treatment of 0.
    const zeroBudget = { ...freshFromOnboarding, budgetMin: 0, budgetMax: 0 }
    expect(getTenantProfileCompleteness(zeroBudget).missing.map((item) => item.id)).not.toContain('budget')
  })

  it('still counts a real numeric budget range as complete', () => {
    const base = { targetCity: 'Dublin', lookingFor: 'any' }
    expect(getTenantProfileCompleteness({ ...base, budgetMin: 1200, budgetMax: 1800 }).missing.map((item) => item.id)).not.toContain('budget')
    // A one-sided preference (only one side genuinely set) is equally a real, deliberate answer.
    expect(getTenantProfileCompleteness({ ...base, budgetMin: 1200, budgetMax: '' }).missing.map((item) => item.id)).not.toContain('budget')
    expect(getTenantProfileCompleteness({ ...base, budgetMin: '', budgetMax: 2000 }).missing.map((item) => item.id)).not.toContain('budget')
  })

  it('still flags a genuinely invalid budget range (min above max) as incomplete', () => {
    const base = { targetCity: 'Dublin', lookingFor: 'any' }
    const invalid = getTenantProfileCompleteness({ ...base, budgetMin: 2000, budgetMax: 1200 })
    expect(invalid.missing.map((item) => item.id)).toContain('budget')
  })

  it('hides agent fixtures from the current visible MVP property set', () => {
    expect(getVisibleMvpMockProperties([{ id: 'a', ownerType: 'Letting agent' }, { id: 'b', ownerType: 'Private landlord' }]).map((item) => item.id)).toEqual(['b'])
  })

  it('keeps published mark-rented action reachable', () => {
    expect(getListingActions('published').map((action) => action.status)).toContain('rented')
  })
})

describe('pricing and entitlements', () => {
  it('has exactly one canonical Gafflo+ tenant price', () => {
    expect(pricingPlans.tenant.gafflo_plus.priceMonthly).toBe(4.99)
    expect(pricingPlans.tenant.free.priceMonthly).toBe(0)
  })

  it('keeps role and plan as separate concepts', () => {
    expect(Object.values(TENANT_PLAN)).not.toContain('tenant')
    expect(Object.values(LANDLORD_PLAN)).not.toContain('landlord')
    expect(Object.keys(pricingPlans.tenant)).not.toContain('premium_landlord')
  })

  it('grants tenant Free the current baseline Smart Match and Interested allowances', () => {
    expect(getSmartMatchAllowance(TENANT_PLAN.FREE)).toBe(30)
    expect(getInterestAllowance(TENANT_PLAN.FREE)).toBe(10)
    expect(canUseAdvancedFilters(TENANT_PLAN.FREE)).toBe(false)
    expect(canRewind(TENANT_PLAN.FREE)).toBe(false)
  })

  it('grants Gafflo+ higher, but not unlimited, allowances', () => {
    expect(getSmartMatchAllowance(TENANT_PLAN.GAFFLO_PLUS)).toBeGreaterThan(getSmartMatchAllowance(TENANT_PLAN.FREE))
    expect(getInterestAllowance(TENANT_PLAN.GAFFLO_PLUS)).toBeGreaterThan(getInterestAllowance(TENANT_PLAN.FREE))
    expect(Number.isFinite(getInterestAllowance(TENANT_PLAN.GAFFLO_PLUS))).toBe(true)
    expect(canUseAdvancedFilters(TENANT_PLAN.GAFFLO_PLUS)).toBe(true)
    expect(canRewind(TENANT_PLAN.GAFFLO_PLUS)).toBe(true)
  })

  it('gives landlord Free exactly one active listing and Landlord Plus more', () => {
    expect(getActiveListingAllowance(LANDLORD_PLAN.FREE)).toBe(1)
    expect(getActiveListingAllowance(LANDLORD_PLAN.LANDLORD_PLUS)).toBeGreaterThan(1)
  })

  it('prices Single Listing Plus as an honest one-off, never disguised as a subscription', () => {
    const singleListingPlus = pricingPlans.listingProducts.single_listing_plus
    expect(singleListingPlus.unit).toBe('listing')
    expect(singleListingPlus.features.join(' ')).toMatch(/one-off/i)
    expect(singleListingPlus.features.join(' ')).not.toMatch(/per month/i)
  })

  it('never lets plan affect the Rental Fit score', () => {
    const freeScore = calculatePropertyMatch(tenant, property).score
    const plusScore = calculatePropertyMatch({ ...tenant, plan: 'gafflo_plus' }, { ...property, plan: 'gafflo_plus' }).score
    expect(plusScore).toBe(freeScore)
  })

  it('excludes an active boost from Smart Match score and ranking', () => {
    const activeBoost = { type: 'boost', status: 'active', startsAt: '2030-05-30T00:00:00.000Z', endsAt: '2030-06-05T00:00:00.000Z' }
    const now = new Date('2030-06-01T00:00:00.000Z')
    const boostedProperty = { ...property, promotion: activeBoost }
    expect(calculatePropertyMatch(tenant, boostedProperty).score).toBe(calculatePropertyMatch(tenant, property).score)

    const lowerMatchBoosted = { id: 'boosted-low-match', match: { score: 40 }, listingStatus: 'published', promotion: activeBoost }
    const higherMatchPlain = { id: 'plain-high-match', match: { score: 95 }, listingStatus: 'published', promotion: null }
    expect(sortBySmartMatchScore([lowerMatchBoosted, higherMatchPlain]).map((item) => item.id)).toEqual(['plain-high-match', 'boosted-low-match'])
    expect(sortForBrowseExposure([lowerMatchBoosted, higherMatchPlain], now).map((item) => item.id)).toEqual(['boosted-low-match', 'plain-high-match'])
  })

  it('only allows boosting a listing that is public and not already promoted', () => {
    const now = new Date('2030-06-01T00:00:00.000Z')
    const activeBoost = { type: 'boost', status: 'active', startsAt: '2030-05-30T00:00:00.000Z', endsAt: '2030-06-05T00:00:00.000Z' }
    expect(canBoostListing({ listingStatus: 'published', promotion: null }, now)).toBe(true)
    expect(canBoostListing({ listingStatus: 'draft', promotion: null }, now)).toBe(false)
    expect(canBoostListing({ listingStatus: 'published', promotion: activeBoost }, now)).toBe(false)
  })

  it('allows an eligible Gafflo+ tenant exactly one premium follow-up after the waiting period', () => {
    const enquiry = { status: 'sent', createdAt: '2030-01-01T00:00:00.000Z' }
    const conversation = { blockedBy: null, messages: [{ sender: 'tenant', body: 'Hi' }] }
    const now = new Date('2030-01-03T01:00:00.000Z')
    expect(canSendPremiumFollowUp({ enquiry, conversation, plan: TENANT_PLAN.GAFFLO_PLUS, now })).toBe(true)
    expect(canSendPremiumFollowUp({ enquiry, conversation, plan: TENANT_PLAN.FREE, now })).toBe(false)
  })

  it('denies a premium follow-up before the waiting period has elapsed', () => {
    const enquiry = { status: 'sent', createdAt: '2030-01-01T00:00:00.000Z' }
    const conversation = { blockedBy: null, messages: [] }
    const now = new Date('2030-01-01T10:00:00.000Z')
    expect(canSendPremiumFollowUp({ enquiry, conversation, plan: TENANT_PLAN.GAFFLO_PLUS, now })).toBe(false)
  })

  it('denies a premium follow-up once one has already been used for this enquiry', () => {
    const enquiry = { status: 'sent', createdAt: '2030-01-01T00:00:00.000Z', premiumFollowUpUsedAt: '2030-01-04T00:00:00.000Z' }
    const conversation = { blockedBy: null, messages: [] }
    const now = new Date('2030-01-10T00:00:00.000Z')
    expect(canSendPremiumFollowUp({ enquiry, conversation, plan: TENANT_PLAN.GAFFLO_PLUS, now })).toBe(false)
  })

  it('denies a premium follow-up for a blocked conversation or a closed enquiry', () => {
    const now = new Date('2030-01-10T00:00:00.000Z')
    const openEnquiry = { status: 'sent', createdAt: '2030-01-01T00:00:00.000Z' }
    const blockedConversation = { blockedBy: 'landlord', messages: [] }
    expect(canSendPremiumFollowUp({ enquiry: openEnquiry, conversation: blockedConversation, plan: TENANT_PLAN.GAFFLO_PLUS, now })).toBe(false)

    const closedEnquiry = { status: 'closed', createdAt: '2030-01-01T00:00:00.000Z' }
    expect(canSendPremiumFollowUp({ enquiry: closedEnquiry, conversation: { blockedBy: null, messages: [] }, plan: TENANT_PLAN.GAFFLO_PLUS, now })).toBe(false)
  })
})

describe('Stage D — real application status/pipeline mapping', () => {
  it('labels every real backend status, and falls back honestly for an unknown one', () => {
    expect(getApplicationStatusInfo('sent').label).toBe('Sent')
    expect(getApplicationStatusInfo('landlord_interested').label).toBe('Landlord interested')
    expect(getApplicationStatusInfo('not_selected').label).toBe('Not selected')
    expect(getApplicationStatusInfo(undefined).label).toBe('Sent')
    expect(getApplicationStatusInfo('some_future_status').label).toBe('some_future_status')
  })

  it('treats only not_selected/withdrawn/closed as terminal', () => {
    expect(isTerminalApplicationStatus('not_selected')).toBe(true)
    expect(isTerminalApplicationStatus('withdrawn')).toBe(true)
    expect(isTerminalApplicationStatus('closed')).toBe(true)
    for (const status of ['sent', 'viewed', 'landlord_interested', 'shortlisted', 'viewing_proposed', 'viewing_confirmed']) {
      expect(isTerminalApplicationStatus(status)).toBe(false)
    }
  })

  it('treats landlord_interested/shortlisted/viewing_proposed/viewing_confirmed as landlord-engaged', () => {
    expect(isLandlordEngagedApplicationStatus('landlord_interested')).toBe(true)
    expect(isLandlordEngagedApplicationStatus('viewing_confirmed')).toBe(true)
    expect(isLandlordEngagedApplicationStatus('sent')).toBe(false)
    expect(isLandlordEngagedApplicationStatus('not_selected')).toBe(false)
  })

  it('only ever offers the four real landlord decision targets, excluding the current status, and none once terminal', () => {
    expect(getLandlordApplicationActions('sent').map((action) => action.status).sort()).toEqual(
      ['closed', 'landlord_interested', 'not_selected', 'shortlisted'].sort(),
    )
    expect(getLandlordApplicationActions('landlord_interested').map((action) => action.status)).not.toContain('landlord_interested')
    for (const terminal of ['not_selected', 'withdrawn', 'closed']) {
      expect(getLandlordApplicationActions(terminal)).toEqual([])
    }
    // Never offered — Viewings are Stage F's own guarded RPCs, and sent/viewed/withdrawn are
    // never a landlord-authored decision.
    const allTargets = new Set(getLandlordApplicationActions('sent').map((action) => action.status))
    expect(allTargets.has('viewing_proposed')).toBe(false)
    expect(allTargets.has('viewing_confirmed')).toBe(false)
    expect(allTargets.has('withdrawn')).toBe(false)
  })

  it('marks exactly one landlord action (not_selected) destructive — Applicants.jsx gates its confirm dialog on this flag alone', () => {
    const actions = getLandlordApplicationActions('sent')
    const destructive = actions.filter((action) => action.destructive)
    expect(destructive.map((action) => action.status)).toEqual(['not_selected'])
  })

  it('groups every real status into exactly one of the five pipeline tabs', () => {
    expect(getApplicationPipelineGroup('sent')).toBe('new')
    expect(getApplicationPipelineGroup('viewed')).toBe('new')
    expect(getApplicationPipelineGroup('landlord_interested')).toBe('interested')
    expect(getApplicationPipelineGroup('shortlisted')).toBe('shortlisted')
    expect(getApplicationPipelineGroup('viewing_proposed')).toBe('viewing')
    expect(getApplicationPipelineGroup('viewing_confirmed')).toBe('viewing')
    expect(getApplicationPipelineGroup('not_selected')).toBe('closed')
    expect(getApplicationPipelineGroup('withdrawn')).toBe('closed')
    expect(getApplicationPipelineGroup('closed')).toBe('closed')
    expect(applicantPipelineTabs.map((tab) => tab.id)).toEqual(['new', 'interested', 'shortlisted', 'viewing', 'closed'])
  })
})

describe('Stage D — real application row adapter', () => {
  const row = {
    id: 'app-1',
    listing_id: 'listing-1',
    tenant_id: 'tenant-1',
    status: 'shortlisted',
    tenant_snapshot: {
      display_name: 'Alex Applicant',
      target_city: 'Dublin',
      preferred_areas: ['Rathmines'],
      budget_min: 1200,
      budget_max: 1800,
      move_in_date: '2027-02-01',
      lease_length_months: 12,
      household_size: 2,
      applying_as_couple: true,
      looking_for: 'room',
      employment_status: 'full_time',
      student: false,
      pets: 'none',
      smoking: 'no',
      furnished_preference: 'any',
      parking_needed: false,
      private_bathroom_preferred: true,
      bills_included_preferred: false,
      owner_occupied_acceptable: true,
      references_ready: true,
      income_ready: true,
      id_ready: false,
      bio: 'Quiet professional.',
    },
    rental_fit_score: 74,
    rental_fit_breakdown: { reasons: ['Great fit'], warnings: ['One thing'], hard_stops: [] },
    rental_fit_algorithm_version: 'v1',
    first_viewed_at: '2027-01-02T10:00:00.000Z',
    created_at: '2027-01-01T10:00:00.000Z',
    updated_at: '2027-01-02T10:00:00.000Z',
  }

  it('translates listing_id/tenant_id into the frontend property-lookup idiom', () => {
    const application = mapApplicationRowToApplication(row)
    expect(application.propertyId).toBe('listing-1')
    expect(application.tenantId).toBe('tenant-1')
    expect(application.id).toBe('app-1')
    expect(application.status).toBe('shortlisted')
  })

  it('never recomputes Rental Fit — it carries the exact frozen score/reasons/warnings/hardStops stored server-side', () => {
    const application = mapApplicationRowToApplication(row)
    expect(application.match).toEqual({ score: 74, reasons: ['Great fit'], warnings: ['One thing'], hardStops: [] })
  })

  it('maps the frozen tenant_snapshot using the exact same field translations as a live tenant_profiles row, plus displayName', () => {
    const application = mapApplicationRowToApplication(row)
    expect(application.tenant.displayName).toBe('Alex Applicant')
    expect(application.tenant.budgetMin).toBe(1200)
    expect(application.tenant.budgetMax).toBe(1800)
    expect(application.tenant.householdSize).toBe(2)
    expect(application.tenant.applyingAsCouple).toBe(true)
    expect(application.tenant.referencesReady).toBe(true)
    expect(application.tenant.idReady).toBe(false)
    expect(application.tenant.bio).toBe('Quiet professional.')
  })

  it('returns null for a null row rather than throwing', () => {
    expect(mapApplicationRowToApplication(null)).toBeNull()
  })
})

describe('Stage D — application error normalization', () => {
  it('maps a real 23505 duplicate to a clear, specific message regardless of the raw text', () => {
    expect(describeApplicationError({ code: '23505', message: 'duplicate key value violates unique constraint "applications_one_per_tenant_listing"' }))
      .toBe('You have already applied to this listing.')
  })

  it('maps known 42501/P0001 backend messages to safe, specific user copy', () => {
    expect(describeApplicationError({ code: '42501', message: 'Account is not active' }))
      .toBe('Your account cannot currently do this. Contact support if this seems wrong.')
    expect(describeApplicationError({ code: '42501', message: 'You cannot apply to your own listing' }))
      .toBe('You cannot apply to your own listing.')
    expect(describeApplicationError({ code: '42501', message: 'Not authorized' }))
      .toBe('You are not able to do this.')
    expect(describeApplicationError({ code: 'P0001', message: 'This listing is not currently open for applications' }))
      .toBe('This listing is not currently accepting applications.')
    expect(describeApplicationError({ code: 'P0001', message: 'This application has already reached a terminal state' }))
      .toBe('This application has already reached a final state and can no longer be changed.')
  })

  it('never leaks a raw/unknown backend message, network error, or missing error as user-facing text', () => {
    const fallback = 'Something went wrong. Please try again.'
    expect(describeApplicationError({ code: '42501', message: 'permission denied for table applications' })).toBe(fallback)
    expect(describeApplicationError({ code: undefined, message: 'Failed to fetch' })).toBe(fallback)
    expect(describeApplicationError({ code: '08006', message: 'connection to server was lost' })).toBe(fallback)
    expect(describeApplicationError(null)).toBe(fallback)
    expect(describeApplicationError(undefined)).toBe(fallback)
  })

  it('never depends on substring matching — a similar-but-not-exact message falls through to the safe fallback', () => {
    expect(describeApplicationError({ code: 'P0001', message: 'This listing is not currently open for applications right now, sorry' }))
      .toBe('Something went wrong. Please try again.')
  })
})

describe('Stage E — canonical tenant anti-spam rule: real landlord message only, application status never unlocks', () => {
  const TENANT = 'tenant-1'
  const LANDLORD = 'landlord-1'

  function conversation(messages) {
    return { isTenant: true, tenantId: TENANT, landlordId: LANDLORD, messages }
  }

  it('blocks a second tenant message before any landlord reply exists', () => {
    const convo = conversation([{ senderId: TENANT, body: 'Hi, is this available?' }])
    expect(isTenantWaitingForLandlordReply(convo)).toBe(true)
  })

  it('unlocks only once a real message authored by the landlord exists', () => {
    const convo = conversation([
      { senderId: TENANT, body: 'Hi, is this available?' },
      { senderId: LANDLORD, body: 'Yes, still available.' },
    ])
    expect(isTenantWaitingForLandlordReply(convo)).toBe(false)
  })

  it('never unlocks from a landlord decision status — application state and messaging are fully decoupled', () => {
    // A real application object exists alongside this conversation, in each of the exact
    // statuses the Stage E task calls out by name — isTenantWaitingForLandlordReply's signature
    // takes only the conversation; there is no code path by which it could read `application` at
    // all, which is the actual guarantee, not just an incidental test outcome.
    const convoWithNoLandlordMessage = conversation([{ senderId: TENANT, body: 'Hi, is this available?' }])
    for (const status of ['landlord_interested', 'shortlisted', 'viewing_confirmed']) {
      const application = { status } // constructed, never passed to isTenantWaitingForLandlordReply
      expect(isTenantWaitingForLandlordReply(convoWithNoLandlordMessage)).toBe(true)
      expect(application.status).toBe(status) // sanity: the application really is in that status
    }
  })

  it('a landlord viewing their own conversation is never gated by this rule at all', () => {
    expect(isTenantWaitingForLandlordReply({ isTenant: false, tenantId: TENANT, landlordId: LANDLORD, messages: [] })).toBe(false)
  })
})

describe('Stage E — real conversation row adapter', () => {
  const row = {
    id: 'conv-1',
    listing_id: 'listing-1',
    tenant_id: 'tenant-1',
    landlord_id: 'landlord-1',
    last_message_at: '2027-01-02T10:00:00.000Z',
    updated_at: '2027-01-02T10:00:00.000Z',
    conversation_participant_state: [
      { user_id: 'tenant-1', archived_at: null, muted: false, last_read_at: '2027-01-01T09:00:00.000Z' },
      { user_id: 'landlord-1', archived_at: '2027-01-01T00:00:00.000Z', muted: true, last_read_at: null },
    ],
  }
  const messages = [
    { id: 'm1', conversation_id: 'conv-1', sender_id: 'tenant-1', body: 'Hi', created_at: '2027-01-01T08:00:00.000Z' },
    { id: 'm2', conversation_id: 'conv-1', sender_id: 'landlord-1', body: 'Hello', created_at: '2027-01-02T10:00:00.000Z' },
  ]
  const ctx = {
    userId: 'tenant-1',
    listingsById: { 'listing-1': { id: 'listing-1', title: 'Test listing' } },
    messagesByConversationId: { 'conv-1': messages },
    profileSummaries: { 'landlord-1': { displayName: 'Landlord Co', avatarUrl: null } },
    blockedUserIds: new Set(),
  }

  it('only ever exposes the caller\'s own participant state, never the counterpart\'s', () => {
    const result = mapConversationRowToConversation(row, ctx)
    expect(result.archived).toBe(false)
    expect(result.muted).toBe(false)
  })

  it('resolves counterpart identity and listing context from what the provider already batched, never re-fetching', () => {
    const result = mapConversationRowToConversation(row, ctx)
    expect(result.counterpart).toEqual({ displayName: 'Landlord Co', avatarUrl: null })
    expect(result.listing).toEqual({ id: 'listing-1', title: 'Test listing' })
  })

  it('is unread only when a message exists after the caller\'s own last_read_at', () => {
    const result = mapConversationRowToConversation(row, ctx)
    expect(result.unread).toBe(true) // landlord's reply (10:00) is after tenant's last_read_at (09:00)

    const readCtx = { ...ctx, messagesByConversationId: { 'conv-1': [messages[0]] } } // only the pre-read tenant message
    expect(mapConversationRowToConversation(row, readCtx).unread).toBe(false)
  })

  it('marks blockedByMe from the batched blocks set, keyed by counterpart id', () => {
    const blockedCtx = { ...ctx, blockedUserIds: new Set(['landlord-1']) }
    expect(mapConversationRowToConversation(row, blockedCtx).blockedByMe).toBe(true)
    expect(mapConversationRowToConversation(row, ctx).blockedByMe).toBe(false)
  })

  it('leaves listing null rather than fabricating one when it fell out of the caller\'s real listing set', () => {
    const noListingCtx = { ...ctx, listingsById: {} }
    expect(mapConversationRowToConversation(row, noListingCtx).listing).toBeNull()
  })
})

describe('Stage E audit — dual-role inbox scoping (presentation-only, single real identity)', () => {
  // One real account, tenant on one conversation and landlord on another — exactly the dual-role
  // shape the audit flagged: the backend never duplicates a conversation per role, so scoping must
  // be purely by which side of each real conversation this account is on (isTenant).
  const tenantSideConvo = { id: 'convo-as-tenant', isTenant: true, unread: true }
  const landlordSideConvo = { id: 'convo-as-landlord', isTenant: false, unread: true }
  const conversations = [tenantSideConvo, landlordSideConvo]

  it('shows only tenant-side conversations when activeRole is tenant', () => {
    expect(filterConversationsByRole(conversations, 'tenant')).toEqual([tenantSideConvo])
  })

  it('shows only landlord-side conversations when activeRole is landlord', () => {
    expect(filterConversationsByRole(conversations, 'landlord')).toEqual([landlordSideConvo])
  })

  it('never mixes both sides into one role view', () => {
    const tenantView = filterConversationsByRole(conversations, 'tenant')
    const landlordView = filterConversationsByRole(conversations, 'landlord')
    expect(tenantView).not.toContainEqual(landlordSideConvo)
    expect(landlordView).not.toContainEqual(tenantSideConvo)
  })

  it('an unread landlord-side thread is not counted in a tenant-scoped unread total, and vice versa', () => {
    const tenantUnread = filterConversationsByRole(conversations, 'tenant').filter((c) => c.unread).length
    const landlordUnread = filterConversationsByRole(conversations, 'landlord').filter((c) => c.unread).length
    expect(tenantUnread).toBe(1)
    expect(landlordUnread).toBe(1)
  })
})

describe('Stage E — messaging error normalization', () => {
  it('maps known 42501/P0001 backend messages to safe, specific user copy', () => {
    expect(describeMessagingError({ code: '42501', message: 'You have already sent a message — wait for the landlord to reply before sending another' }))
      .toBe('You already sent a message — wait for the landlord to reply before sending another.')
    expect(describeMessagingError({ code: '42501', message: 'Messaging is not currently available in this conversation' }))
      .toBe('Messaging is not currently available in this conversation.')
    expect(describeMessagingError({ code: 'P0001', message: 'Message is too long (maximum 1200 characters)' }))
      .toBe('Message is too long (maximum 1200 characters).')
  })

  it('never leaks a raw/unknown backend message or missing error as user-facing text', () => {
    const fallback = 'Something went wrong. Please try again.'
    expect(describeMessagingError({ code: '42501', message: 'permission denied for table conversations' })).toBe(fallback)
    expect(describeMessagingError(null)).toBe(fallback)
    expect(describeMessagingError(undefined)).toBe(fallback)
  })
})

describe('Stage G — saved listings / Smart Match adapters', () => {
  it('maps saved_listings rows into a plain Set of listing ids', () => {
    const set = mapSavedListingRowsToIdSet([{ listing_id: 'a' }, { listing_id: 'b' }])
    expect(set.has('a')).toBe(true)
    expect(set.has('b')).toBe(true)
    expect(set.has('c')).toBe(false)
  })

  it('maps smart_match_decisions rows into a Map keyed by listing id', () => {
    const map = mapDecisionRowsToMap([
      { listing_id: 'a', decision: 'pass', decided_at: '2030-01-01T00:00:00.000Z' },
      { listing_id: 'b', decision: 'interested', decided_at: '2030-01-02T00:00:00.000Z' },
    ])
    expect(map.get('a').decision).toBe('pass')
    expect(map.get('b').decision).toBe('interested')
    expect(map.has('c')).toBe(false)
  })

  it('candidate exclusion drops both already-decisioned listings and the caller\'s own listings, nothing else', () => {
    const properties = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]
    const decisions = mapDecisionRowsToMap([{ listing_id: 'p1', decision: 'pass' }])
    const ownListingIds = new Set(['p2'])
    expect(filterAvailableSmartMatchCandidates(properties, decisions, ownListingIds).map((p) => p.id)).toEqual(['p3', 'p4'])
  })

  it('usage denominator is always the real Free tier, never a spoofable local plan flag', () => {
    const usage = mapUsageRowToSmartMatchUsage({ usage_date: '2030-01-01', smart_match_count: 5, interested_count: 2 })
    expect(usage.cardAllowance).toBe(30)
    expect(usage.interestAllowance).toBe(10)
  })

  it('Pass vs Interested consumption: cards used only vs both used, remaining computed correctly', () => {
    const passOnly = mapUsageRowToSmartMatchUsage({ usage_date: '2030-01-01', smart_match_count: 1, interested_count: 0 })
    expect(passOnly.cardsRemaining).toBe(29)
    expect(passOnly.interestsRemaining).toBe(10)

    const interested = mapUsageRowToSmartMatchUsage({ usage_date: '2030-01-01', smart_match_count: 2, interested_count: 1 })
    expect(interested.cardsRemaining).toBe(28)
    expect(interested.interestsRemaining).toBe(9)
  })

  it('Interested can be exhausted while Smart Match still has room — the canonical Stage G example', () => {
    const usage = mapUsageRowToSmartMatchUsage({ usage_date: '2030-01-01', smart_match_count: 12, interested_count: 10 })
    expect(usage.cardsRemaining).toBe(18)
    expect(usage.interestsRemaining).toBe(0)
  })

  it('Smart Match itself can be fully exhausted', () => {
    const usage = mapUsageRowToSmartMatchUsage({ usage_date: '2030-01-01', smart_match_count: 30, interested_count: 4 })
    expect(usage.cardsRemaining).toBe(0)
    expect(usage.interestsRemaining).toBe(6)
  })
})

describe('Stage G — saved/Smart Match error normalization', () => {
  it('maps known 42501/P0001 backend messages to safe, specific user copy', () => {
    expect(describeEngagementError({ code: '42501', message: "You have reached today's Smart Match limit" })).toBe("You've reached today's Smart Match limit.")
    expect(describeEngagementError({ code: '42501', message: "You have reached today's Interested limit" })).toBe("You've reached today's Interested limit.")
    expect(describeEngagementError({ code: '42501', message: 'You cannot Smart Match your own listing' })).toBe('You cannot Smart Match your own listing.')
    expect(describeEngagementError({ code: '42501', message: 'You cannot save your own listing' })).toBe('You cannot save your own listing.')
  })

  it('never leaks a raw/unknown backend message or missing error as user-facing text', () => {
    const fallback = 'Something went wrong. Please try again.'
    expect(describeEngagementError({ code: '42501', message: 'permission denied for table saved_listings' })).toBe(fallback)
    expect(describeEngagementError(null)).toBe(fallback)
  })
})

describe('Stage H — notification adapter mapping', () => {
  const unreadRow = {
    id: 'notif-1',
    type: 'new_application',
    title: 'New application received',
    body: null,
    listing_id: 'listing-1',
    application_id: 'app-1',
    conversation_id: null,
    viewing_proposal_id: null,
    read_at: null,
    created_at: '2030-01-01T00:00:00.000Z',
  }
  const readRow = {
    ...unreadRow,
    id: 'notif-2',
    type: 'landlord_replied',
    application_id: null,
    conversation_id: 'conv-1',
    read_at: '2030-01-02T00:00:00.000Z',
  }

  it('maps a real row into the presentation shape, deriving read from read_at', () => {
    const unread = mapNotificationRowToNotification(unreadRow)
    expect(unread.read).toBe(false)
    expect(unread.applicationId).toBe('app-1')
    expect(unread.listingId).toBe('listing-1')

    const read = mapNotificationRowToNotification(readRow)
    expect(read.read).toBe(true)
    expect(read.readAt).toBe('2030-01-02T00:00:00.000Z')
    expect(read.conversationId).toBe('conv-1')
  })

  it('never fabricates a related id the row does not actually carry', () => {
    const mapped = mapNotificationRowToNotification(unreadRow)
    expect(mapped.conversationId).toBeNull()
    expect(mapped.viewingProposalId).toBeNull()
  })
})

describe('Stage H — unread calculation and filtering', () => {
  const notifications = [
    mapNotificationRowToNotification({ id: 'a', type: 'new_application', title: 'A', body: null, listing_id: null, application_id: null, conversation_id: null, viewing_proposal_id: null, read_at: null, created_at: '2030-01-01T00:00:00.000Z' }),
    mapNotificationRowToNotification({ id: 'b', type: 'landlord_replied', title: 'B', body: null, listing_id: null, application_id: null, conversation_id: null, viewing_proposal_id: null, read_at: '2030-01-02T00:00:00.000Z', created_at: '2030-01-01T00:00:00.000Z' }),
    mapNotificationRowToNotification({ id: 'c', type: 'viewing_proposed', title: 'C', body: null, listing_id: null, application_id: null, conversation_id: null, viewing_proposal_id: null, read_at: null, created_at: '2030-01-01T00:00:00.000Z' }),
  ]

  it('counts only real unread notifications', () => {
    expect(getUnreadCount(notifications)).toBe(2)
    expect(getUnreadCount([])).toBe(0)
  })

  it('filters down to exactly the unread set, preserving the rest untouched', () => {
    const unread = filterUnreadNotifications(notifications)
    expect(unread.map((n) => n.id)).toEqual(['a', 'c'])
  })
})

describe('Stage H — notification navigation routing', () => {
  it('prefers the conversation route when a conversation id is present', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'landlord_replied', title: 'T', body: null,
      listing_id: 'listing-1', application_id: null, conversation_id: 'conv-1', viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBe('/messages/conv-1')
  })

  it('falls back to the listing route when there is no conversation', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'new_application', title: 'T', body: null,
      listing_id: 'listing-1', application_id: 'app-1', conversation_id: null, viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBe('/properties/listing-1')
  })

  it('returns null rather than guessing when neither id is present', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'listing_approved', title: 'T', body: null,
      listing_id: null, application_id: null, conversation_id: null, viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBeNull()
  })

  it('routes a rejected-listing notification to the edit flow, not the read-only detail page', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'listing_rejected', title: 'T', body: 'Photos are unclear',
      listing_id: 'listing-1', application_id: null, conversation_id: null, viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBe('/listings/listing-1/edit')
  })

  it('routes a removed-listing notification to the properties list, where the reason is shown, not the dead detail page', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'listing_removed', title: 'T', body: 'Reported as inaccurate',
      listing_id: 'listing-1', application_id: null, conversation_id: null, viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBe('/properties')
  })

  it('leaves an approved-listing notification routed to the real listing detail page', () => {
    const notification = mapNotificationRowToNotification({
      id: 'n', type: 'listing_approved', title: 'T', body: null,
      listing_id: 'listing-1', application_id: null, conversation_id: null, viewing_proposal_id: null,
      read_at: null, created_at: '2030-01-01T00:00:00.000Z',
    })
    expect(getNotificationRoute(notification)).toBe('/properties/listing-1')
  })
})

describe('Stage I — listing analytics adapter', () => {
  it('maps aggregate RPC rows into landlord-facing counts', () => {
    const analytics = mapListingAnalyticsRowToAnalytics({
      listing_id: 'listing-1',
      unique_views: 12,
      saves: 3,
      applications: 2,
      enquiries: 1,
      confirmed_viewings: 1,
    })

    expect(analytics).toEqual({
      listingId: 'listing-1',
      uniqueViews: 12,
      saves: 3,
      applications: 2,
      enquiries: 1,
      confirmedViewings: 1,
    })
  })

  it('zero-fills empty aggregate rows for listings with no performance data', () => {
    expect(emptyListingAnalytics('listing-empty')).toEqual({
      listingId: 'listing-empty',
      uniqueViews: 0,
      saves: 0,
      applications: 0,
      enquiries: 0,
      confirmedViewings: 0,
    })
    expect(mapListingAnalyticsRowToAnalytics({
      listing_id: 'listing-null',
      unique_views: null,
      saves: null,
      applications: null,
      enquiries: null,
      confirmed_viewings: null,
    })).toEqual(emptyListingAnalytics('listing-null'))
  })

  it('indexes rows by listing id and never carries viewer identity or Smart Match signals forward', () => {
    const map = mapListingAnalyticsRowsToMap([
      {
        listing_id: 'listing-1',
        unique_views: 1,
        saves: 2,
        applications: 3,
        enquiries: 4,
        confirmed_viewings: 5,
        viewer_id: 'must-not-leak',
        smart_match_interested: 99,
      },
    ])

    expect(map.get('listing-1')).toEqual({
      listingId: 'listing-1',
      uniqueViews: 1,
      saves: 2,
      applications: 3,
      enquiries: 4,
      confirmedViewings: 5,
    })
  })
})

describe('Stage J1 — listing report reason labels', () => {
  it('maps every known reason value to a real, human-readable label', () => {
    expect(listingReportReasonLabel('discriminatory_language')).toBe('Discriminatory or exclusionary language')
    expect(listingReportReasonLabel('scam_or_fraud')).toBe('Scam or fraud concern')
    expect(listingReportReasonLabel('inaccurate_listing')).toBe('Listing looks inaccurate or misleading')
    expect(listingReportReasonLabel('inappropriate_content')).toBe('Inappropriate content or photos')
    expect(listingReportReasonLabel('harassment')).toBe('Harassment or abusive behaviour')
    expect(listingReportReasonLabel('other')).toBe('Something else')
  })

  it('falls back to a safe default label for an unrecognized or missing value', () => {
    expect(listingReportReasonLabel('not_a_real_reason')).toBe('Other')
    expect(listingReportReasonLabel(undefined)).toBe('Other')
  })

  it('exposes exactly the six reasons the backend enum defines, each with a distinct value', () => {
    expect(LISTING_REPORT_REASONS).toHaveLength(6)
    const values = LISTING_REPORT_REASONS.map((entry) => entry.value)
    expect(new Set(values).size).toBe(6)
  })
})

describe('Stage K — moderator workspace adapter', () => {
  it('maps a real report row without ever carrying reporter_id forward', () => {
    const report = mapReportRowToReport({
      id: 'report-1',
      listing_id: 'listing-1',
      reporter_id: 'must-not-leak',
      reason: 'scam_or_fraud',
      description: 'Looks off',
      status: 'open',
      created_at: '2026-08-21T00:00:00Z',
      reviewed_at: null,
    })
    expect(report).toEqual({
      id: 'report-1',
      listingId: 'listing-1',
      reason: 'scam_or_fraud',
      description: 'Looks off',
      status: 'open',
      createdAt: '2026-08-21T00:00:00Z',
      reviewedAt: null,
    })
    expect(report.reporterId).toBeUndefined()
  })

  it('treats a null description as an empty string, never null', () => {
    expect(mapReportRowToReport({
      id: 'report-2',
      listing_id: 'listing-1',
      reporter_id: 'x',
      reason: 'other',
      description: null,
      status: 'open',
      created_at: '2026-08-21T00:00:00Z',
      reviewed_at: null,
    }).description).toBe('')
  })

  it('maps a real pending listing row and falls back to a safe title', () => {
    expect(mapListingRowToPendingListing({
      id: 'listing-1', title: 'Bright room', city: 'Dublin', area: 'Rathmines',
      rent: 1200, listing_category: 'private_room', created_at: '2026-08-21T00:00:00Z',
    })).toEqual({
      id: 'listing-1', title: 'Bright room', city: 'Dublin', area: 'Rathmines',
      rent: 1200, listingCategory: 'private_room', createdAt: '2026-08-21T00:00:00Z',
    })
    expect(mapListingRowToPendingListing({
      id: 'listing-2', title: null, city: null, area: null,
      rent: null, listing_category: 'entire_property', created_at: '2026-08-21T00:00:00Z',
    }).title).toBe('Untitled listing')
  })

  it('builds a real listing summary label, and a safe fallback when the listing could not be loaded', () => {
    expect(listingSummaryLabel({ title: 'Bright room', city: 'Dublin', area: 'Rathmines' })).toBe('Bright room — Rathmines, Dublin')
    expect(listingSummaryLabel({ title: 'Bright room', city: '', area: '' })).toBe('Bright room')
    expect(listingSummaryLabel(null)).toBe('Listing')
  })
})

describe('Stage AE — support contact email normalization', () => {
  it('returns null, never a fabricated address, for every genuinely unset shape', () => {
    expect(normalizeSupportEmail(undefined)).toBeNull()
    expect(normalizeSupportEmail(null)).toBeNull()
    expect(normalizeSupportEmail('')).toBeNull()
    expect(normalizeSupportEmail('   ')).toBeNull()
  })

  it('trims a real configured address but otherwise passes it through unchanged', () => {
    expect(normalizeSupportEmail('support@example.com')).toBe('support@example.com')
    expect(normalizeSupportEmail('  support@example.com  ')).toBe('support@example.com')
  })
})
