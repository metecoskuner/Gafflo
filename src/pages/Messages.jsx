import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'

export default function Messages() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <EmptyState
        eyebrow="Messaging"
        title="Messages"
        description="Messaging between renters and listing owners will appear here soon."
        actions={<Button onClick={() => navigate('/rooms')}>Browse rooms</Button>}
      />
    </div>
  )
}
