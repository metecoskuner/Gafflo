import { useContext } from 'react'
import ListingsContext from './ListingsContext'

export default function useListings() {
  const context = useContext(ListingsContext)

  if (!context) {
    throw new Error('useListings must be used within ListingsProvider')
  }

  return context
}
