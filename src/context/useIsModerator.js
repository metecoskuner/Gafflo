import { useContext } from 'react'
import ModeratorContext from './ModeratorContext'

export default function useIsModerator() {
  const context = useContext(ModeratorContext)

  if (!context) {
    throw new Error('useIsModerator must be used within ModeratorProvider')
  }

  return context
}
