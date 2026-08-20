import { useContext } from 'react'
import ListingAnalyticsContext from './ListingAnalyticsContext'

export default function useListingAnalytics() {
  const context = useContext(ListingAnalyticsContext)

  if (!context) {
    throw new Error('useListingAnalytics must be used within ListingAnalyticsProvider')
  }

  return context
}
