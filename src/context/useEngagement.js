import { useContext } from 'react'
import EngagementContext from './EngagementContext'

export default function useEngagement() {
  const context = useContext(EngagementContext)

  if (!context) {
    throw new Error('useEngagement must be used within EngagementProvider')
  }

  return context
}
