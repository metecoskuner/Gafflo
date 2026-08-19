import { useContext } from 'react'
import ApplicationsContext from './ApplicationsContext'

export default function useApplications() {
  const context = useContext(ApplicationsContext)

  if (!context) {
    throw new Error('useApplications must be used within ApplicationsProvider')
  }

  return context
}
