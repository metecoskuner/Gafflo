import { useContext } from 'react'
import AppStateContext from './AppStateContext'

export default function useAppState() {
  const context = useContext(AppStateContext)

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider')
  }

  return context
}
