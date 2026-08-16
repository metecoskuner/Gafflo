import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import { getApplicationActions } from '../config/applicationTransitions'
import { filterApplicantsByProperty, getValidApplicantPropertyId } from '../config/applicantFilters'
import { applicantPipelineTabs, getPipelineGroup } from '../config/rentalJourney'
import { isRoomListing } from '../config/listingCategories'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate, getFutureViewingSlots } from '../utils/dateUtils'

export default function Applicants() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { landlordEnquiries, landlordProperties, updateEnquiryStatus, openConversationForEnquiry, proposeViewing } = useAppState()
  const [activePipeline, setActivePipeline] = useState('new')
  const [confirmRejectId, setConfirmRejectId] = useState(null)
  const activePropertyId = getValidApplicantPropertyId(searchParams.get('property'), landlordProperties)
  const activeProperty = landlordProperties.find((property) => property.id === activePropertyId)
  const scopedEnquiries = useMemo(() => filterApplicantsByProperty(landlordEnquiries, activePropertyId), [activePropertyId, landlordEnquiries])
  const pipelineCounts = useMemo(
    () =>
      applicantPipelineTabs.reduce((acc, tab) => {
        acc[tab.id] = scopedEnquiries.filter((enquiry) => getPipelineGroup(enquiry.status) === tab.id).length
        return acc
      }, {}),
    [scopedEnquiries],
  )
  const filteredEnquiries = useMemo(
    () => scopedEnquiries.filter((enquiry) => getPipelineGroup(enquiry.status) === activePipeline),
    [activePipeline, scopedEnquiries],
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
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {activeProperty ? `Showing applicants for ${activeProperty.title}.` : 'Start with the strongest rental fit, then message or arrange a viewing.'}
        </p>
        {searchParams.get('property') && !activeProperty ? (
          <p className="mt-2 text-sm font-medium text-amber-700">That listing is not available, so all applicants are shown.</p>
        ) : null}
        {activeProperty ? (
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setSearchParams({})}>
            All properties
          </Button>
        ) : null}
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

      {landlordProperties.filter((property) => !activePropertyId || property.id === activePropertyId).map((property) => {
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
                {propertyApplicants.length} {propertyApplicants.length === 1 ? 'applicant' : 'applicants'}
              </span>
            </div>

            {propertyApplicants.map((enquiry, index) => {
              const tenant = enquiry.tenant
              const roomListing = isRoomListing(property.listingCategory)
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
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">#{index + 1}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-soft">{enquiry.statusLabel}</span>
                        {isMutual ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Mutual interest</span> : null}
                      </div>
                      <h3 className="mt-3 truncate text-xl font-semibold text-slate-950">{tenant.name || 'Tenant applicant'}</h3>
                    </div>
                    <div className="shrink-0 scale-90">
                      <MatchBadge score={enquiry.match.score} compact />
                    </div>
                  </div>

                  <ApplicantText message={enquiry.message} bio={tenant.bio} />

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                    <Info label="Budget" value={`${formatCurrency(tenant.budgetMin)}-${formatCurrency(tenant.budgetMax)}`} />
                    <Info label="Move-in" value={formatDate(tenant.moveInDate)} />
                    <Info label="Household" value={`${tenant.householdSize}`} />
                    {roomListing ? <Info label="Applicants" value={`${tenant.householdSize}`} /> : null}
                    {roomListing ? <Info label="Couple" value={tenant.applyingAsCouple ?? tenant.coupleRequirement ? 'Yes' : 'No'} /> : null}
                    <Info label="Readiness" value={`${docsReady}/3 ready`} />
                  </div>

                  <div className="mt-4 rounded-[20px] border border-slate-100 bg-slate-50/78 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">Why this tenant is ranked here</p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                      {enquiry.match.reasons.slice(0, 2).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 grid gap-2 min-[380px]:grid-cols-2 md:grid-cols-3">
                    {getApplicationActions(enquiry.status)
                      .filter((action) => action.status !== 'viewing proposed' && !action.destructive && action.status !== 'closed')
                      .map((action) => (
                        <Button key={action.status} variant="secondary" onClick={() => handleStatusChange(action.status)}>
                          {action.label}
                        </Button>
                      ))}
                    <Button variant="dark" onClick={() => navigate(`/messages/${openConversationForEnquiry(enquiry.id)}`)}>
                      Message
                    </Button>
                    {getApplicationActions(enquiry.status).some((action) => action.status === 'viewing proposed') ? (
                      <Button
                        variant="secondary"
                        onClick={() => proposeViewing(enquiry.id, property.viewingSlots?.length ? property.viewingSlots : getFutureViewingSlots())}
                      >
                        Arrange viewing
                      </Button>
                    ) : null}
                  </div>
                  {getApplicationActions(enquiry.status).some((action) => action.destructive) && confirmRejectId !== enquiry.id ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRejectId(enquiry.id)}
                      className="mt-3 min-h-11 rounded-2xl px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
                    >
                      Not suitable
                    </button>
                  ) : null}
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

function ApplicantText({ bio, message }) {
  const [expanded, setExpanded] = useState(false)
  const text = String(message || bio || '').trim()
  const secondary = message && bio && message.trim() !== bio.trim() ? bio.trim() : ''
  const isLong = text.length > 180 || secondary.length > 120

  if (!text && !secondary) return null

  return (
    <div className="mt-4 rounded-[20px] border border-slate-100 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Applicant message</p>
      <p className={`mt-2 text-sm leading-6 text-slate-700 ${!expanded && isLong ? 'line-clamp-4' : ''}`}>
        {text}
      </p>
      {secondary ? (
        <p className={`mt-2 text-sm leading-6 text-slate-600 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
          {secondary}
        </p>
      ) : null}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 min-h-10 rounded-full px-3 text-sm font-semibold text-indigo-900 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}
