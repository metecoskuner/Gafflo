import { useContext } from 'react'
import ViewingsContext from './ViewingsContext'

export default function useViewings() {
  const context = useContext(ViewingsContext)

  if (!context) {
    throw new Error('useViewings must be used within ViewingsProvider')
  }

  return context
}
