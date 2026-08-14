import { applicationStatusSteps, getApplicationStatus, getApplicationStep, isClosedStatus } from '../config/rentalJourney'

export function ApplicationStatusPill({ status }) {
  const statusInfo = getApplicationStatus(status)
  const closed = isClosedStatus(status)
  const strong = ['landlord interested', 'shortlisted', 'viewing proposed', 'viewing confirmed'].includes(status)

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

export default function ApplicationStatus({ enquiry, compact = false }) {
  if (!enquiry) return null
  const statusInfo = getApplicationStatus(enquiry.status)
  const step = getApplicationStep(enquiry.status)
  const closed = isClosedStatus(enquiry.status)
  const progress = closed ? 100 : Math.round((step / applicationStatusSteps.length) * 100)

  return (
    <section className={`rounded-[22px] border ${closed ? 'border-slate-200 bg-slate-50' : 'border-indigo-100 bg-indigo-50/55'} ${compact ? 'px-3 py-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{compact ? 'Application status' : "What's happening?"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{statusInfo.description}</p>
        </div>
        <ApplicationStatusPill status={enquiry.status} />
      </div>
      {!closed ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-indigo-950 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </section>
  )
}
