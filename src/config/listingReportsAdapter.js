// Stage J1 — pure label mapping for the report-listing reason enum. Keep in sync with
// listing_report_reason_t in supabase/migrations/20260821130000_legal_trust_safety.sql.

export const LISTING_REPORT_REASONS = [
  { value: 'discriminatory_language', label: 'Discriminatory or exclusionary language' },
  { value: 'scam_or_fraud', label: 'Scam or fraud concern' },
  { value: 'inaccurate_listing', label: 'Listing looks inaccurate or misleading' },
  { value: 'inappropriate_content', label: 'Inappropriate content or photos' },
  { value: 'harassment', label: 'Harassment or abusive behaviour' },
  { value: 'other', label: 'Something else' },
]

export function listingReportReasonLabel(value) {
  return LISTING_REPORT_REASONS.find((entry) => entry.value === value)?.label || 'Other'
}
