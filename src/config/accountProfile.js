import { normalizeFurnished, normalizePet, normalizeSmoking } from './domainOptions'

// ---- profiles row (snake_case DB columns) <-> frontend shape --------------------------------

export function mapProfileRow(row) {
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    lastActiveRole: row.last_active_role,
  }
}

// last_active_role is trusted as-is whenever it is set — App.jsx's own onboarding gate
// (role === 'tenant' && !hasTenantProfile -> TenantOnboarding, symmetrically for landlord)
// already handles "chosen but not yet onboarded" and "used to have a profile that somehow no
// longer exists" identically and correctly: both route to the real setup flow for that role,
// never a crash or a stranded screen. Only a genuinely unset last_active_role needs a computed
// fallback, and only once we know which profiles actually exist.
export function deriveActiveRole(lastActiveRole, hasTenantProfile, hasLandlordProfile) {
  if (lastActiveRole) return lastActiveRole
  if (hasTenantProfile) return 'tenant'
  if (hasLandlordProfile) return 'landlord'
  return null
}

// ---- tenant_profiles enum/label bridges ------------------------------------------------------
// employment_status_t and the Employment <select> have always used different string spellings
// (full_time vs "Full-time") with no existing normalizer covering this field — an explicit,
// exhaustive map is safer than a derived slug here since both sides are small, fixed sets.
const EMPLOYMENT_STATUS_TO_LABEL = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  student: 'Student',
  remote_worker: 'Remote worker',
  self_employed: 'Self-employed',
}
const EMPLOYMENT_LABEL_TO_STATUS = Object.fromEntries(
  Object.entries(EMPLOYMENT_STATUS_TO_LABEL).map(([status, label]) => [label, status]),
)

export function employmentStatusToLabel(status) {
  return EMPLOYMENT_STATUS_TO_LABEL[status] || ''
}
export function employmentLabelToStatus(label) {
  return EMPLOYMENT_LABEL_TO_STATUS[label] || null
}

const CONTACT_METHOD_TO_LABEL = {
  in_app_message: 'In-app message',
  email: 'Email',
  phone: 'Phone',
}
const CONTACT_LABEL_TO_METHOD = Object.fromEntries(
  Object.entries(CONTACT_METHOD_TO_LABEL).map(([method, label]) => [label, method]),
)

export function contactMethodToLabel(method) {
  return CONTACT_METHOD_TO_LABEL[method] || CONTACT_METHOD_TO_LABEL.in_app_message
}
export function contactLabelToMethod(label) {
  return CONTACT_LABEL_TO_METHOD[label] || 'in_app_message'
}

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function furnishedPreferenceToDb(value) {
  if (value === 'any' || value === 'Any' || !value) return 'any'
  return normalizeFurnished(value)
}

// ---- tenant_profiles row <-> frontend shape --------------------------------------------------
// The frontend shape matches exactly what calculatePropertyMatch.js / rentalJourney.js / the
// TenantProfile form already expect (camelCase, the same shape config/tenantProfile.js's own
// normalizeTenantProfileForState produces) — this only translates column names/types between
// tenant_profiles and that existing shape, it never duplicates the couple/household
// reconciliation already centralized in config/tenantProfile.js.

export function mapTenantProfileRowToFields(row) {
  if (!row) return null
  return {
    targetCity: row.target_city,
    preferredAreas: row.preferred_areas || [],
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    moveInDate: row.move_in_date,
    householdSize: row.household_size,
    leaseLength: row.lease_length_months === null || row.lease_length_months === undefined ? '12' : String(row.lease_length_months),
    lookingFor: row.looking_for,
    applyingAsCouple: row.applying_as_couple,
    pets: row.pets,
    smoking: row.smoking,
    furnishedPreference: row.furnished_preference,
    parkingNeeded: row.parking_needed ? 'yes' : 'no',
    privateBathroomPreferred: row.private_bathroom_preferred,
    billsIncludedPreferred: row.bills_included_preferred,
    ownerOccupiedAcceptable: row.owner_occupied_acceptable,
    employmentStatus: employmentStatusToLabel(row.employment_status),
    studentStatus: row.student ? 'Yes' : 'No',
    referencesReady: row.references_ready,
    incomeReady: row.income_ready,
    idReady: row.id_ready,
    bio: row.bio || '',
  }
}

// Accepts the frontend camelCase shape and produces exactly the tenant_profiles columns
// authenticated has INSERT/UPDATE grants on — never profile_id/created_at/updated_at, those are
// server/RLS-owned. Only keys actually present on `fields` are translated, so a caller can send
// a partial update.
export function mapTenantProfileFieldsToRow(fields) {
  const row = {}
  if ('targetCity' in fields) row.target_city = fields.targetCity
  if ('preferredAreas' in fields) row.preferred_areas = fields.preferredAreas || []
  if ('budgetMin' in fields) row.budget_min = numOrNull(fields.budgetMin)
  if ('budgetMax' in fields) row.budget_max = numOrNull(fields.budgetMax)
  if ('moveInDate' in fields) row.move_in_date = fields.moveInDate || null
  if ('householdSize' in fields) row.household_size = numOrNull(fields.householdSize)
  if ('leaseLength' in fields) row.lease_length_months = numOrNull(fields.leaseLength)
  if ('lookingFor' in fields) row.looking_for = fields.lookingFor
  if ('applyingAsCouple' in fields) row.applying_as_couple = Boolean(fields.applyingAsCouple)
  if ('pets' in fields) row.pets = normalizePet(fields.pets)
  if ('smoking' in fields) row.smoking = normalizeSmoking(fields.smoking)
  if ('furnishedPreference' in fields) row.furnished_preference = furnishedPreferenceToDb(fields.furnishedPreference)
  if ('parkingNeeded' in fields) row.parking_needed = String(fields.parkingNeeded || '').toLowerCase() === 'yes'
  if ('privateBathroomPreferred' in fields) row.private_bathroom_preferred = Boolean(fields.privateBathroomPreferred)
  if ('billsIncludedPreferred' in fields) row.bills_included_preferred = Boolean(fields.billsIncludedPreferred)
  if ('ownerOccupiedAcceptable' in fields) row.owner_occupied_acceptable = fields.ownerOccupiedAcceptable !== false
  if ('employmentStatus' in fields) row.employment_status = employmentLabelToStatus(fields.employmentStatus)
  if ('studentStatus' in fields) row.student = String(fields.studentStatus || '').toLowerCase() === 'yes'
  if ('referencesReady' in fields) row.references_ready = Boolean(fields.referencesReady)
  if ('incomeReady' in fields) row.income_ready = Boolean(fields.incomeReady)
  if ('idReady' in fields) row.id_ready = Boolean(fields.idReady)
  if ('bio' in fields) row.bio = fields.bio || null
  return row
}

// ---- landlord_profiles row <-> frontend shape --------------------------------------------------
// landlordType is deliberately never written by the frontend: the column default
// ('private_landlord') is also the only value its CHECK constraint permits, so there is nothing
// for a client update to legitimately change.

export function mapLandlordProfileRowToFields(row) {
  if (!row) return null
  return {
    displayName: row.display_name,
    landlordType: row.landlord_type,
    bio: row.bio || '',
    preferredContactMethod: contactMethodToLabel(row.preferred_contact_method),
    fairHousingAcknowledgedAt: row.fair_housing_acknowledged_at || null,
  }
}

export function mapLandlordProfileFieldsToRow(fields) {
  const row = {}
  if ('displayName' in fields) row.display_name = fields.displayName
  if ('bio' in fields) row.bio = fields.bio || null
  if ('preferredContactMethod' in fields) row.preferred_contact_method = contactLabelToMethod(fields.preferredContactMethod)
  return row
}
