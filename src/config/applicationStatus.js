// Centralized frontend <-> backend application_status_t mapping. This is the ONLY place that
// enumerates the real backend status vocabulary or decides how it groups into the product's
// pipeline tabs — nowhere else should string-compare a status or hand-roll a label. Deliberately
// separate from config/rentalJourney.js's old-style ('landlord interested', space-separated)
// vocabulary, which still serves the still-mock enquiry/conversation/viewing domain (Messages.jsx,
// MarketplaceState.jsx) that Stage D does not touch — the two vocabularies are for two genuinely
// different things now (a real application vs. a mock messaging thread) and forcing them back
// together would misrepresent one or the other.

export const APPLICATION_STATUSES = [
  'sent',
  'viewed',
  'landlord_interested',
  'shortlisted',
  'viewing_proposed',
  'viewing_confirmed',
  'not_selected',
  'withdrawn',
  'closed',
]

export const TERMINAL_APPLICATION_STATUSES = ['not_selected', 'withdrawn', 'closed']

const STATUS_INFO = {
  sent: { label: 'Sent', description: 'Your application has been sent to the listing owner.' },
  viewed: { label: 'Viewed', description: 'The listing owner has seen your application.' },
  landlord_interested: { label: 'Landlord interested', description: 'Good news — the landlord is interested in your application.' },
  shortlisted: { label: 'Shortlisted', description: 'You have been shortlisted for this property.' },
  // Never reachable through any Stage D-exposed action (Viewings are Stage F's own guarded
  // RPCs) — present only so an application that somehow already carries one of these statuses
  // renders honestly instead of falling through to the "Sent" default below.
  viewing_proposed: { label: 'Viewing proposed', description: 'The listing owner has proposed viewing times.' },
  viewing_confirmed: { label: 'Viewing confirmed', description: 'Your viewing is confirmed.' },
  not_selected: { label: 'Not selected', description: 'This application is not progressing, but you can keep applying to other listings.' },
  withdrawn: { label: 'Withdrawn', description: 'You withdrew this application.' },
  closed: { label: 'Closed', description: 'This application is closed.' },
}

export function getApplicationStatusInfo(status) {
  return STATUS_INFO[status] || { label: status || 'Sent', description: 'Your application is being reviewed.' }
}

export function isTerminalApplicationStatus(status) {
  return TERMINAL_APPLICATION_STATUSES.includes(status)
}

export function isLandlordEngagedApplicationStatus(status) {
  return ['landlord_interested', 'shortlisted', 'viewing_proposed', 'viewing_confirmed'].includes(status)
}

// The only four targets landlord_set_application_status() accepts (see part 10 of the Stage D
// migration). viewing_proposed/viewing_confirmed/sent/viewed/withdrawn are never offered here on
// purpose: viewings are Stage F's own guarded RPCs, and sent/viewed/withdrawn are never a
// landlord-authored decision.
const LANDLORD_DECISION_ACTIONS = [
  { status: 'landlord_interested', label: 'Interested' },
  { status: 'shortlisted', label: 'Shortlist' },
  { status: 'not_selected', label: 'Not suitable', destructive: true },
  { status: 'closed', label: 'Close' },
]

export function getLandlordApplicationActions(status) {
  if (isTerminalApplicationStatus(status)) return []
  return LANDLORD_DECISION_ACTIONS.filter((action) => action.status !== status)
}

// Preserves the existing product pipeline tabs (New/Interested/Shortlisted/Viewing/Closed) over
// the real backend vocabulary — see the Stage D report for confirmation this grouping still
// matches current product rules.
const PIPELINE_GROUPS = {
  sent: 'new',
  viewed: 'new',
  landlord_interested: 'interested',
  shortlisted: 'shortlisted',
  viewing_proposed: 'viewing',
  viewing_confirmed: 'viewing',
  not_selected: 'closed',
  withdrawn: 'closed',
  closed: 'closed',
}

export const applicantPipelineTabs = [
  { id: 'new', label: 'New' },
  { id: 'interested', label: 'Interested' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'viewing', label: 'Viewing' },
  { id: 'closed', label: 'Closed' },
]

export function getApplicationPipelineGroup(status) {
  return PIPELINE_GROUPS[status] || 'closed'
}

// Ordinal position of a status's pipeline group, for a simple progress indicator — mirrors the
// shape of the old mock applicationStatusSteps without claiming the same strict linear guarantee
// the backend doesn't make (e.g. shortlisted -> closed skips "viewing" entirely, honestly).
const PIPELINE_GROUP_ORDER = applicantPipelineTabs.map((tab) => tab.id)

export function getApplicationPipelineStep(status) {
  const index = PIPELINE_GROUP_ORDER.indexOf(getApplicationPipelineGroup(status))
  return index >= 0 ? index + 1 : 1
}

export const applicationPipelineStepCount = PIPELINE_GROUP_ORDER.length
