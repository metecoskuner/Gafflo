import { useContext } from 'react'
import MessagingContext from './MessagingContext'

export default function useMessaging() {
  const context = useContext(MessagingContext)

  if (!context) {
    throw new Error('useMessaging must be used within MessagingProvider')
  }

  return context
}
