import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import { applicantPipelineTabs, getPipelineGroup } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate, getFutureViewingSlots } from '../utils/dateUtils'

const applicantActions = [
  ['landlord interested', 'Interested'],
  ['shortlisted', 'Shortlist'],
  ['rejected', 'Not suitable'],
]

export default function Applicants() {
  const navigate = useNavigate()
  const { landlordEnquiries, landlordProperties, updateEnquiryStatus, openConversationForEnquiry, proposeViewing } = useAppState()
  const [activePipeline, setActivePipeline] = useState('new')
  const [confirmRejectId, setConfirmRejectId] = useState(null)
  const pipelineCounts = useMemo(
    () =>
      applicantPipelineTabs.reduce((acc, tab) => {
        acc[tab.id] = landlordEnquiries.filter((enquiry) => getPipelineGroup(enquiry.status) === tab.id).length
        return acc
      }, {}),
    [landlordEnquiries],
  )
  const filteredEnquiries = useMemo(
    () => landlordEnquiries.filter((enquiry) => getPipelineGroup(enquiry.status) === activePipeline),
    [activePipeline, landlordEnquiries],
  )

  if (!landlordEnquiries.length) {
    return (
      <EmptyState
        eyebrow="Applicants"
        title="No applicants yet"
        description="New tenant interest will appear here, ranked by rental fit for each property."
        actions={<Button onClick={() => navigate('/properties')}>View properties</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[28px] p-5">
        <p className="text-sm font-semibold text-emerald-600">Applicants</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Review interested tenants</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Start with the strongest rental fit, then message or arrange a viewing.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {applicantPipelineTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePipeline(tab.id)}
              className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${
                activePipeline === tab.id ? 'bg-indigo-950 text-white shadow-soft' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {tab.label} {pipelineCounts[tab.id] || 0}
            </button>
          ))}
        </div>
      </section>

      {!filteredEnquiries.length ? (
        <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 text-center">
          <p className="text-sm font-semibold text-slate-950">No applicants in {applicantPipelineTabs.find((tab) => tab.id === activePipeline)?.label.toLowerCase()} yet.</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Choose another stage or check back when more tenant interest arrives.</p>
        </section>
      ) : null}

      {landlordProperties.map((property) => {
        const propertyApplicants = filteredEnquiries
          .filter((enquiry) => enquiry.propertyId === property.id)
          .sort((a, b) => b.match.score - a.match.score)
        if (!propertyApplicants.length) return null

        return (
          <section key={property.id} className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">{property.title}</h2>
                <p className="text-sm text-slate-500">{property.area}, {property.city}</p>
              </div>
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                {propertyApplicants.length} applicants
              </span>
            </div>

            {propertyApplicants.map((enquiry, index) => {
              const tenant = enquiry.tenant
              const docsReady = [tenant.referencesReady, tenant.incomeReady, tenant.idReady].filter(Boolean).length
              const isMutual = ['landlord interested', 'shortlisted', 'viewing proposed', 'viewing confirmed'].includes(enquiry.status)
              const handleStatusChange = (status) => {
                if (status === 'rejected') {
                  setConfirmRejectId(enquiry.id)
                  return
                }
                updateEnquiryStatus(enquiry.id, status)
              }

              return (
                <article key={enquiry.id} className="card-surface card-shadow rounded-[26px] p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">#{index + 1}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-soft">{enquiry.statusLabel}</span>
                        {isMutual ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Mutual interest</span> : null}
                      </div>
                      <h3 className="mt-3 truncate text-xl font-semibold text-slate-950">{tenant.name || 'Tenant applicant'}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{tenant.bio}</p>
                    </div>
                    <MatchBadge score={enquiry.match.score} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                    <Info label="Budget" value={`${formatCurrency(tenant.budgetMin)}-${formatCurrency(tenant.budgetMax)}`} />
                    <Info label="Move-in" value={formatDate(tenant.moveInDate)} />
                    <Info label="Household" value={`${tenant.householdSize}`} />
                    <Info label="Employment" value={tenant.employmentStatus} />
                    <Info label="References" value={tenant.referencesReady ? 'Ready' : 'Not ready'} />
                    <Info label="Documents" value={`${docsReady}/3 ready`} />
                  </div>

                  <div className="mt-4 rounded-[20px] border border-slate-100 bg-slate-50/78 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">Why this tenant is ranked here</p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                      {enquiry.match.reasons.slice(0, 2).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 grid gap-2 min-[380px]:grid-cols-2 md:grid-cols-5">
                    {applicantActions.map(([status, label]) => (
                      <Button key={status} variant="secondary" disabled={enquiry.status === status} onClick={() => handleStatusChange(status)}>
                        {label}
                      </Button>
                    ))}
                    <Button variant="dark" onClick={() => navigate(`/messages/${openConversationForEnquiry(enquiry.id)}`)}>
                      Message
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => proposeViewing(enquiry.id, property.viewingSlots?.length ? property.viewingSlots : getFutureViewingSlots())}
                    >
                      Arrange viewing
                    </Button>
                  </div>
                  {confirmRejectId === enquiry.id ? (
                    <div className="mt-3 rounded-[20px] border border-amber-100 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-amber-950">Mark this applicant as not suitable?</p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">They will move to Closed for this property.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button variant="secondary" className="bg-white" onClick={() => setConfirmRejectId(null)}>Cancel</Button>
                        <Button
                          variant="dark"
                          onClick={() => {
                            updateEnquiryStatus(enquiry.id, 'rejected')
                            setConfirmRejectId(null)
                          }}
                        >
                          Not suitable
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="surface-line rounded-[18px] bg-slate-50/78 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
