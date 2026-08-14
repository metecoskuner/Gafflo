import { getTrustSignals } from '../config/rentalJourney'

export default function TrustSummary({ property }) {
  const signals = getTrustSignals(property)

  return (
    <section className="card-surface card-shadow rounded-[24px] p-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">Trust summary</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Verification signals are shown only when they exist for this listing.
      </p>
      {signals.length ? (
        <div className="mt-4 grid gap-2">
          {signals.map((signal) => (
            <div key={signal} className="flex items-center gap-3 rounded-[18px] bg-slate-50 px-3 py-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                ✓
              </span>
              <span className="text-sm font-semibold text-slate-800">{signal}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] bg-slate-50 px-3 py-3 text-sm font-medium text-slate-600">
          No additional verification signals are shown for this listing yet.
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <TrustTile label="Landlord" value={formatTrustStatus(property.trust?.landlordVerification)} />
        <TrustTile label="Property" value={formatTrustStatus(property.trust?.propertyVerification)} />
      </div>
    </section>
  )
}

function TrustTile({ label, value }) {
  return (
    <div className="surface-line min-w-0 rounded-[18px] bg-white px-3 py-3">
      <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function formatTrustStatus(status) {
  const labels = {
    verified: 'Verified',
    pending: 'Pending',
    rejected: 'Rejected',
    not_verified: 'Not verified',
  }
  return labels[status] || 'Not verified'
}
