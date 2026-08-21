import { useCallback, useEffect, useState } from 'react'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SegmentedControl from '../components/SegmentedControl'
import { listingReportReasonLabel } from '../config/listingReportsAdapter'
import {
  listingSummaryLabel,
  mapListingRowToPendingListing,
  mapReportRowToReport,
} from '../config/moderationAdapter'
import { formatDate } from '../utils/dateUtils'
import {
  approveListing,
  fetchListingForModeration,
  fetchOpenReports,
  fetchPendingListings,
  rejectListing,
  removeListing,
  resolveReport,
} from '../services/moderationService'

const tabs = [
  { value: 'reports', label: 'Reports' },
  { value: 'pending', label: 'Pending listings' },
]

export default function ModeratorWorkspace() {
  const [tab, setTab] = useState('reports')

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[30px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">Moderator</p>
        <h1 className="text-balance mt-2 text-2xl font-semibold tracking-tight text-slate-950">Review workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Reports and listings genuinely waiting on a decision. Nothing here is bulk or automated —
          every action below calls the real backend directly.
        </p>
        <div className="mt-4">
          <SegmentedControl value={tab} onChange={setTab} options={tabs} />
        </div>
      </section>

      {tab === 'reports' ? <ReportsQueue /> : <PendingListingsQueue />}
    </div>
  )
}

// A short, required reason input revealed on demand — mirrors the confirm-before-destructive
// pattern already used by PropertyDetailsModal's block-user action (Stage J1).
function ReasonAction({ label, confirmLabel, variant = 'secondary', disabled, onConfirm }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) {
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div className="grid min-w-0 gap-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
      <textarea
        autoFocus
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        placeholder="Reason (required)"
        disabled={pending}
        className="w-full min-w-0 resize-none rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setOpen(false)
            setReason('')
          }}
        >
          Cancel
        </Button>
        <Button
          variant={variant}
          disabled={pending || !reason.trim()}
          isLoading={pending}
          onClick={async () => {
            setPending(true)
            await onConfirm(reason.trim())
            setPending(false)
            setOpen(false)
            setReason('')
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

function ReportsQueue() {
  const [reports, setReports] = useState([])
  const [listingsById, setListingsById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowError, setRowError] = useState({})
  const [pendingId, setPendingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchOpenReports()
      const mapped = rows.map(mapReportRowToReport)
      const uniqueListingIds = [...new Set(mapped.map((report) => report.listingId))]
      const listingResults = await Promise.all(
        uniqueListingIds.map((listingId) => fetchListingForModeration(listingId).catch(() => null)),
      )
      const nextListingsById = new Map()
      uniqueListingIds.forEach((listingId, index) => {
        if (listingResults[index]) nextListingsById.set(listingId, listingResults[index])
      })
      setReports(mapped)
      setListingsById(nextListingsById)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleResolve = async (reportId, status) => {
    setPendingId(reportId)
    setRowError((current) => ({ ...current, [reportId]: '' }))
    try {
      await resolveReport(reportId, status)
      await load()
    } catch (resolveError) {
      setRowError((current) => ({ ...current, [reportId]: resolveError.message }))
    } finally {
      setPendingId(null)
    }
  }

  const handleRemoveListing = async (report, reason) => {
    setRowError((current) => ({ ...current, [report.id]: '' }))
    try {
      await removeListing(report.listingId, reason)
      await resolveReport(report.id, 'actioned')
      await load()
    } catch (removeError) {
      setRowError((current) => ({ ...current, [report.id]: removeError.message }))
    }
  }

  if (loading) return <QueueLoading />
  if (error) return <QueueError message={error} onRetry={load} />
  if (!reports.length) {
    return (
      <EmptyState
        eyebrow="Reports"
        title="No open reports"
        description="Every report has been reviewed. Nothing is waiting on a decision right now."
      />
    )
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const listing = listingsById.get(report.listingId)
        return (
          <article key={report.id} className="card-surface card-shadow rounded-[24px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{listingSummaryLabel(listing)}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">
                  {listingReportReasonLabel(report.reason)}
                </p>
              </div>
              <p className="shrink-0 text-xs font-medium text-slate-400">{formatDate(report.createdAt)}</p>
            </div>
            {report.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{report.description}</p>
            ) : null}
            {rowError[report.id] ? (
              <p className="mt-2 text-xs font-medium text-rose-500">{rowError[report.id]}</p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
              <Button
                variant="secondary"
                disabled={pendingId === report.id}
                onClick={() => handleResolve(report.id, 'dismissed')}
              >
                Dismiss
              </Button>
              <Button
                variant="secondary"
                disabled={pendingId === report.id}
                onClick={() => handleResolve(report.id, 'reviewed')}
              >
                Mark reviewed
              </Button>
              <Button
                variant="secondary"
                disabled={pendingId === report.id}
                onClick={() => handleResolve(report.id, 'actioned')}
              >
                Mark actioned
              </Button>
              <ReasonAction
                label="Remove listing"
                confirmLabel="Confirm removal"
                variant="dark"
                disabled={pendingId === report.id}
                onConfirm={(reason) => handleRemoveListing(report, reason)}
              />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function PendingListingsQueue() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowError, setRowError] = useState({})
  const [pendingId, setPendingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchPendingListings()
      setListings(rows.map(mapListingRowToPendingListing))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleApprove = async (listingId) => {
    setPendingId(listingId)
    setRowError((current) => ({ ...current, [listingId]: '' }))
    try {
      await approveListing(listingId)
      await load()
    } catch (approveError) {
      setRowError((current) => ({ ...current, [listingId]: approveError.message }))
    } finally {
      setPendingId(null)
    }
  }

  const handleReject = async (listingId, reason) => {
    setRowError((current) => ({ ...current, [listingId]: '' }))
    try {
      await rejectListing(listingId, reason)
      await load()
    } catch (rejectError) {
      setRowError((current) => ({ ...current, [listingId]: rejectError.message }))
    }
  }

  if (loading) return <QueueLoading />
  if (error) return <QueueError message={error} onRetry={load} />
  if (!listings.length) {
    return (
      <EmptyState
        eyebrow="Pending listings"
        title="Nothing waiting for review"
        description="Every submitted listing has already been approved or rejected."
      />
    )
  }

  return (
    <div className="space-y-3">
      {listings.map((listing) => (
        <article key={listing.id} className="card-surface card-shadow rounded-[24px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{listing.title}</p>
              <p className="mt-1 text-xs text-slate-500">{[listing.area, listing.city].filter(Boolean).join(', ')}</p>
            </div>
            <p className="shrink-0 text-xs font-medium text-slate-400">{formatDate(listing.createdAt)}</p>
          </div>
          {rowError[listing.id] ? (
            <p className="mt-2 text-xs font-medium text-rose-500">{rowError[listing.id]}</p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="dark"
              disabled={pendingId === listing.id}
              isLoading={pendingId === listing.id}
              onClick={() => handleApprove(listing.id)}
            >
              Approve
            </Button>
            <ReasonAction
              label="Reject"
              confirmLabel="Confirm rejection"
              disabled={pendingId === listing.id}
              onConfirm={(reason) => handleReject(listing.id, reason)}
            />
          </div>
        </article>
      ))}
    </div>
  )
}

function QueueLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <span
        className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

function QueueError({ message, onRetry }) {
  return (
    <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3">
      <p className="text-sm font-medium text-rose-700">{message}</p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
