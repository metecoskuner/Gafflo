import { useContext } from 'react'
import AccountProfileContext from './AccountProfileContext'

export default function useAccountProfile() {
  const context = useContext(AccountProfileContext)

  if (!context) {
    throw new Error('useAccountProfile must be used within AccountProfileProvider')
  }

  return context
}
