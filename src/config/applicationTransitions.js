export const applicationStatuses = [
  'sent',
  'viewed',
  'landlord interested',
  'shortlisted',
  'viewing proposed',
  'viewing confirmed',
  'viewing cancelled',
  'rejected',
  'withdrawn',
  'closed',
]

export const terminalApplicationStatuses = ['rejected', 'withdrawn', 'closed']

const transitions = {
  sent: ['viewed', 'landlord interested', 'shortlisted', 'viewing proposed', 'rejected', 'closed', 'withdrawn'],
  viewed: ['landlord interested', 'shortlisted', 'viewing proposed', 'rejected', 'closed', 'withdrawn'],
  'landlord interested': ['shortlisted', 'viewing proposed', 'rejected', 'closed', 'withdrawn'],
  shortlisted: ['viewing proposed', 'rejected', 'closed', 'withdrawn'],
  'viewing proposed': ['viewing confirmed', 'viewing cancelled', 'rejected', 'closed', 'withdrawn'],
  'viewing confirmed': ['viewing cancelled', 'rejected', 'closed', 'withdrawn'],
  'viewing cancelled': ['viewing proposed', 'rejected', 'closed', 'withdrawn'],
  rejected: [],
  withdrawn: [],
  closed: [],
}

export function canTransitionApplication(from, to) {
  if (!applicationStatuses.includes(to)) return false
  if (!from) return to === 'sent'
  if (from === to) return true
  if (terminalApplicationStatuses.includes(from)) return false
  return transitions[from]?.includes(to) || false
}

export function getApplicationActions(status) {
  const actions = [
    { status: 'landlord interested', label: 'Interested' },
    { status: 'shortlisted', label: 'Shortlist' },
    { status: 'viewing proposed', label: 'Arrange viewing' },
    { status: 'viewing cancelled', label: 'Cancel viewing' },
    { status: 'rejected', label: 'Not suitable', destructive: true },
    { status: 'closed', label: 'Close' },
  ]
  return actions.filter((action) => action.status !== status && canTransitionApplication(status, action.status))
}

export function nextViewingStatusForApplication(status, viewingStatus) {
  if (['viewing proposed', 'viewing confirmed', 'viewing cancelled'].includes(status)) return status
  if (['rejected', 'withdrawn', 'closed'].includes(status)) return viewingStatus === 'viewing confirmed' ? 'viewing confirmed' : 'none'
  return viewingStatus || 'none'
}
