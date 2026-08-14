import { describe, expect, it } from 'vitest'
import { canTransitionApplication, terminalApplicationStatuses } from '../config/applicationTransitions'
import { normalizePetPolicy, normalizePropertyType, normalizeLeaseMonths, normalizeSmoking } from '../config/domainOptions'
import { filterApplicantsByProperty, getValidApplicantPropertyId } from '../config/applicantFilters'
import { cityOptions, normalizePreferredAreas } from '../config/locationOptions'
import { getBrowseFacts, getSmartMatchFacts, shouldShowTenantMatch } from '../config/listingPresentation'
import { getDurableListingImages, getDurablePhotoMetadata, normalizePhotoMetadata, validatePhotoFiles } from '../config/photoMetadata'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import {
  LISTING_CATEGORIES,
  canChangeListingCategory,
  getListingCompleteness,
  inferListingCategory,
  normalizeListingForStorage,
  normalizeListingFormState,
  validateListingForReview,
  validateRoomCapacity,
} from '../config/listingCategories'
import { canListingReceiveEnquiry, canTransitionListing, getListingActions } from '../config/listingLifecycle'
import { getTrustSignals, getTrustStatusLabel } from '../config/rentalJourney'
import { getVisibleMvpMockProperties } from '../config/fixtureFilters'
import { validateViewingChoice, validateViewingProposal } from '../config/viewingSlots'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { directionalDayGap, isPastIsoDate } from '../utils/dateUtils'
import { hasDuplicateEnquiry, hasDuplicateRecentMessage, sanitizeMessageBody } from '../utils/messagingRules'

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

describe('application transitions', () => {
  it('prevents normal regressions and terminal reopen', () => {
    expect(canTransitionApplication('shortlisted', 'landlord interested')).toBe(false)
    expect(canTransitionApplication('viewing proposed', 'landlord interested')).toBe(false)
    expect(canTransitionApplication('viewing confirmed', 'shortlisted')).toBe(false)
    for (const status of terminalApplicationStatuses) {
      expect(canTransitionApplication(status, 'viewing proposed')).toBe(false)
    }
  })

  it('allows cancelling a viewing without closing the application forever', () => {
    expect(canTransitionApplication('viewing confirmed', 'viewing cancelled')).toBe(true)
    expect(canTransitionApplication('viewing cancelled', 'viewing proposed')).toBe(true)
  })
})

describe('viewing slots', () => {
  it('rejects duplicate, past, excessive and invalid proposals', () => {
    const future = '2030-01-02T11:00:00.000Z'
    expect(validateViewingProposal([future, future], '2030-01-01T00:00:00.000Z').valid).toBe(false)
    expect(validateViewingProposal(['2020-01-02T11:00:00.000Z'], '2030-01-01T00:00:00.000Z').valid).toBe(false)
    expect(validateViewingProposal([future, '2030-01-02T12:00:00.000Z', '2030-01-02T13:00:00.000Z', '2030-01-02T14:00:00.000Z']).valid).toBe(false)
    expect(validateViewingProposal(['not a date']).valid).toBe(false)
  })

  it('confirms only a current proposed future slot', () => {
    const proposal = validateViewingProposal(['2030-01-02T11:00:00.000Z'], '2030-01-01T00:00:00.000Z')
    expect(validateViewingChoice({ status: 'viewing proposed', proposedSlots: proposal.slots }, proposal.slots[0].id, '2030-01-01T00:00:00.000Z').valid).toBe(true)
    expect(validateViewingChoice({ status: 'viewing proposed', proposedSlots: proposal.slots }, 'other', '2030-01-01T00:00:00.000Z').valid).toBe(false)
    expect(validateViewingChoice({ status: 'viewing confirmed', proposedSlots: proposal.slots }, proposal.slots[0].id, '2030-01-01T00:00:00.000Z').valid).toBe(false)
  })
})

describe('messaging rules', () => {
  it('sanitizes and detects repeated messages', () => {
    const body = sanitizeMessageBody('  Hi\n\nthere  ')
    expect(body).toBe('Hi there')
    expect(hasDuplicateRecentMessage({ messages: [{ sender: 'tenant', body, createdAt: '2030-01-01T00:00:00.000Z' }] }, 'tenant', body, new Date('2030-01-01T00:00:04.000Z').getTime())).toBe(true)
  })

  it('detects duplicate enquiries by tenant and property', () => {
    expect(hasDuplicateEnquiry([{ propertyId: 'p1', tenantId: 't1' }], 'p1', 't1')).toBe(true)
    expect(hasDuplicateEnquiry([{ propertyId: 'p1', tenantId: 't1' }], 'p1', 't2')).toBe(false)
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
    const result = calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, coupleRequirement: true, privateBathroomPreferred: true, billsIncludedPreferred: true }, room)
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
    const result = calculatePropertyMatch({ ...tenant, lookingFor: 'room', householdSize: 2, coupleRequirement: false }, room)
    expect(result.hardStops).not.toContain('Couples are not accepted for this room.')
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

  it('centralizes cities and canonical preferred areas', () => {
    expect(cityOptions).toEqual(['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford'])
    expect(normalizePreferredAreas([' rathmines ', 'Rathmines', 'Custom Dock'], 'Dublin')).toEqual(['Rathmines', 'Custom Dock'])
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
    expect(validatePhotoFiles([file], []).errors[0]).toBe('notes.txt is not an image.')
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
    expect(getListingCompleteness({ ...validBase, listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY, propertyType: 'studio', maxOccupants: 1 }, '2030-01-01').complete).toBe(true)
    expect(getListingCompleteness({ ...validBase, listingCategory: LISTING_CATEGORIES.PRIVATE_ROOM, roomType: 'double' }, '2030-01-01').complete).toBe(false)
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

  it('hides agent fixtures from the current visible MVP property set', () => {
    expect(getVisibleMvpMockProperties([{ id: 'a', ownerType: 'Letting agent' }, { id: 'b', ownerType: 'Private landlord' }]).map((item) => item.id)).toEqual(['b'])
  })

  it('keeps published mark-rented action reachable', () => {
    expect(getListingActions('published').map((action) => action.status)).toContain('rented')
  })
})
