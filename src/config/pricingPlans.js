export const TENANT_PLAN = {
  FREE: 'free',
  GAFFLO_PLUS: 'gafflo_plus',
}

export const LANDLORD_PLAN = {
  FREE: 'free',
  LANDLORD_PLUS: 'landlord_plus',
}

export const LISTING_PRODUCT = {
  SINGLE_LISTING_PLUS: 'single_listing_plus',
  BOOST: 'boost',
  EXTRA_LISTING_SLOT: 'extra_listing_slot',
}

// Single source of truth for every price and allowance in the product. No component or
// config elsewhere should hardcode a price, a Smart Match limit or a listing allowance —
// read it from here so there is never more than one number for the same thing.
export const pricingPlans = {
  tenant: {
    [TENANT_PLAN.FREE]: {
      id: TENANT_PLAN.FREE,
      name: 'Tenant Free',
      priceMonthly: 0,
      smartMatchCardsPerDay: 30,
      interestsPerDay: 10,
      features: [
        'Browse and save properties',
        'Basic filters',
        'Full property details and Rental Fit score',
        'Track current applications',
        'First enquiry per listing',
        'Normal messaging after a landlord replies',
        '30 Smart Match cards a day',
        '10 Interested actions a day',
      ],
    },
    [TENANT_PLAN.GAFFLO_PLUS]: {
      id: TENANT_PLAN.GAFFLO_PLUS,
      name: 'Gafflo+',
      priceMonthly: 4.99,
      smartMatchCardsPerDay: 100,
      interestsPerDay: 25,
      // Every line here must correspond to real, wired UI behaviour — see entitlements.js.
      // Rewind, instant/high-fit/saved-search alerts, listing compare and the 48h follow-up
      // are deliberately not listed: none has real UI behind it yet, so none is advertised.
      features: [
        '100 Smart Match cards a day',
        '25 Interested actions a day',
        'Advanced filters',
        'Full application history',
      ],
    },
  },
  landlord: {
    [LANDLORD_PLAN.FREE]: {
      id: LANDLORD_PLAN.FREE,
      name: 'Landlord Free',
      priceMonthly: 0,
      activeListingAllowance: 1,
      features: [
        '1 active listing',
        'Applicants and shortlisting',
        'Messaging with reusable quick replies',
        'Viewing scheduling',
        'Basic Rental Fit ranking',
      ],
    },
    [LANDLORD_PLAN.LANDLORD_PLUS]: {
      id: LANDLORD_PLAN.LANDLORD_PLUS,
      name: 'Landlord Plus',
      priceMonthly: 19.99,
      activeListingAllowance: 3,
      // Advanced applicant filters/notes/templates/viewing tools/analytics are deliberately
      // not listed: none has real UI behind it yet. Only list what is actually wired.
      features: ['Up to 3 active listings'],
    },
  },
  listingProducts: {
    // A one-off alternative to a monthly Landlord Plus subscription for a landlord with a
    // single vacancy. Its only real, honest benefit today is the same one Extra Listing Slot
    // already provides — advanced applicant tools/analytics are not built, so they are not
    // advertised here (see config/entitlements.js canUseAdvancedApplicantTools, still unused).
    [LISTING_PRODUCT.SINGLE_LISTING_PLUS]: {
      id: LISTING_PRODUCT.SINGLE_LISTING_PLUS,
      name: 'Single Listing Plus',
      price: 9.99,
      unit: 'listing',
      features: ['One additional active listing, one-off — no monthly subscription', 'Same tools as Free: applicants, messaging, viewings, Rental Fit'],
    },
    [LISTING_PRODUCT.BOOST]: {
      id: LISTING_PRODUCT.BOOST,
      name: 'Listing Boost',
      price: 8.99,
      unit: '7 days',
      durationDays: 7,
      features: ['Extra visibility in Browse for 7 days', 'Clearly labelled as Promoted'],
    },
    [LISTING_PRODUCT.EXTRA_LISTING_SLOT]: {
      id: LISTING_PRODUCT.EXTRA_LISTING_SLOT,
      name: 'Extra Listing Slot',
      price: 6.99,
      unit: 'slot',
      features: ['One additional active listing beyond your plan allowance'],
    },
  },
  // Premium follow-up: exactly one delayed follow-up message per enquiry, and only once the
  // landlord has had a fair, defined window to reply. See entitlements.canSendPremiumFollowUp.
  followUp: {
    waitingPeriodHours: 48,
  },
}

export function getTenantPlanConfig(plan) {
  return pricingPlans.tenant[plan] || pricingPlans.tenant[TENANT_PLAN.FREE]
}

export function getLandlordPlanConfig(plan) {
  return pricingPlans.landlord[plan] || pricingPlans.landlord[LANDLORD_PLAN.FREE]
}

export function getListingProductConfig(productId) {
  return pricingPlans.listingProducts[productId] || null
}
