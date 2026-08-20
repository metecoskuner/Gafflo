import { useState } from 'react'
import {
  applicationPipelineStepCount,
  getApplicationPipelineStep,
  getApplicationStatusInfo,
  isLandlordEngagedApplicationStatus,
  isTerminalApplicationStatus,
} from '../config/applicationStatus'
import { formatViewingSlotDateTime } from '../utils/dateUtils'
import Button from './Button'

export function ApplicationStatusPill({ status }) {
  const statusInfo = getApplicationStatusInfo(status)
  const closed = isTerminalApplicationStatus(status)
  const strong = isLandlordEngagedApplicationStatus(status)

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
        closed
          ? 'bg-slate-100 text-slate-600'
          : strong
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-indigo-50 text-indigo-900'
      }`}
    >
      {statusInfo.label}
    </span>
  )
}

// viewing is the real active (pending/confirmed) viewing_proposals row for this application, if
// any — see context/ViewingsProvider.jsx's getActiveViewing(). Only ever non-null when
// application.status is viewing_proposed or viewing_confirmed, since those are the only two
// application statuses a real active proposal can produce.
export default function ApplicationStatus({ application, viewing, onAcceptSlot, onDeclineViewing, onCancelViewing, compact = false }) {
  if (!application) return null
  const statusInfo = getApplicationStatusInfo(application.status)
  const closed = isTerminalApplicationStatus(application.status)
  const step = getApplicationPipelineStep(application.status)
  const progress = closed ? 100 : Math.round((step / applicationPipelineStepCount) * 100)

  return (
    <section className={`rounded-[22px] border ${closed ? 'border-slate-200 bg-slate-50' : 'border-indigo-100 bg-indigo-50/55'} ${compact ? 'px-3 py-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{compact ? 'Application status' : "What's happening?"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{statusInfo.description}</p>
        </div>
        <ApplicationStatusPill status={application.status} />
      </div>
      {!closed ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-indigo-950 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {application.status === 'viewing_proposed' && viewing ? (
        <ViewingProposalPanel viewing={viewing} onAcceptSlot={onAcceptSlot} onDeclineViewing={onDeclineViewing} />
      ) : null}
      {application.status === 'viewing_confirmed' && viewing ? (
        <ConfirmedViewingPanel viewing={viewing} onCancelViewing={onCancelViewing} />
      ) : null}
    </section>
  )
}

function ViewingProposalPanel({ viewing, onAcceptSlot, onDeclineViewing }) {
  const [pendingSlotId, setPendingSlotId] = useState(null)
  const [declining, setDeclining] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async (slotId) => {
    setPendingSlotId(slotId)
    setError('')
    const { error: acceptError } = await onAcceptSlot(slotId)
    setPendingSlotId(null)
    if (acceptError) setError(acceptError)
  }

  const handleDecline = async () => {
    setDeclining(true)
    setError('')
    const { error: declineError } = await onDeclineViewing()
    setDeclining(false)
    if (declineError) setError(declineError)
  }

  return (
    <div className="mt-4 rounded-[18px] border border-white bg-white/70 p-3">
      <p className="text-sm font-semibold text-slate-900">The landlord proposed a viewing</p>
      <p className="mt-1 text-xs text-slate-500">Choose one time, or decline this proposal.</p>
      <div className="mt-3 space-y-2">
        {viewing.slots.map((slot) => (
          <div key={slot.id} className="flex items-center justify-between gap-2 rounded-[14px] bg-slate-50 px-3 py-2.5">
            <span className="text-sm font-medium text-slate-800">{formatViewingSlotDateTime(slot.startsAt)}</span>
            <Button
              className="min-h-9 px-3 py-1.5 text-xs"
              isLoading={pendingSlotId === slot.id}
              disabled={pendingSlotId !== null || declining}
              onClick={() => handleAccept(slot.id)}
            >
              Choose this time
            </Button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={handleDecline}
        disabled={pendingSlotId !== null || declining}
        className="mt-3 min-h-9 rounded-full px-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {declining ? 'Declining…' : 'Decline this proposal'}
      </button>
    </div>
  )
}

function ConfirmedViewingPanel({ viewing, onCancelViewing }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const handleCancel = async () => {
    setPending(true)
    const { error: cancelError } = await onCancelViewing()
    setPending(false)
    setConfirmCancel(false)
    if (cancelError) setError(cancelError)
  }

  if (!viewing.acceptedSlot) return null

  return (
    <div className="mt-4 rounded-[18px] border border-white bg-white/70 p-3">
      <p className="text-sm font-semibold text-slate-900">{formatViewingSlotDateTime(viewing.acceptedSlot.startsAt)}</p>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
      {confirmCancel ? (
        <div className="mt-3 rounded-[14px] border border-amber-100 bg-amber-50 px-3 py-3">
          <p className="text-sm font-semibold text-amber-950">Cancel this viewing?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="bg-white" onClick={() => setConfirmCancel(false)}>Keep it</Button>
            <Button variant="dark" isLoading={pending} onClick={handleCancel}>Cancel viewing</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="mt-3 min-h-9 rounded-full px-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
        >
          Cancel viewing
        </button>
      )}
    </div>
  )
}
