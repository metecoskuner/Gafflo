import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'

export default function Messages() {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { conversations } = useAppState()
  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations],
  )

  if (conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) return <Navigate to="/messages" replace />
    return <ChatThread conversation={conversation} />
  }

  if (!sortedConversations.length) {
    return (
      <div className="mx-auto w-full max-w-[480px]">
        <EmptyState
          eyebrow="Messages"
          title="No conversations yet"
          description="Open a room detail and message the listing owner when you’re ready to ask a question."
          actions={<Button onClick={() => navigate('/rooms')}>Browse rooms</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[30px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Messages</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Conversations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep room questions and host replies together with the listing context.
        </p>
      </section>

      <section className="space-y-3">
        {sortedConversations.map((conversation) => {
          const room = conversation.room
          const lastMessage = conversation.messages[conversation.messages.length - 1]

          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => navigate(`/messages/${conversation.id}`)}
              className="card-surface card-shadow flex w-full items-center gap-3 rounded-[26px] p-3 text-left transition active:scale-[0.99]"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-slate-200">
                <img src={room.images[0]} alt={room.title} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950">{room.title}</h2>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">
                      {room.area}, {room.city} · {formatCurrency(room.rent)}/mo
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatMessageTime(lastMessage.createdAt)}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">
                  {lastMessage.sender === 'user' ? 'You: ' : ''}
                  {lastMessage.body}
                </p>
              </div>
            </button>
          )
        })}
      </section>
    </div>
  )
}

function ChatThread({ conversation }) {
  const navigate = useNavigate()
  const { sendMessage } = useAppState()
  const [draftMessage, setDraftMessage] = useState('')
  const room = conversation.room

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!draftMessage.trim()) return
    sendMessage(conversation.id, draftMessage)
    setDraftMessage('')
  }

  return (
    <div className="flex min-h-[calc(100dvh-15.25rem-env(safe-area-inset-bottom))] flex-col">
      <section className="card-surface card-shadow sticky top-[calc(env(safe-area-inset-top)+5.25rem)] z-20 overflow-hidden rounded-[28px]">
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => navigate('/messages')}
            aria-label="Back to conversations"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700"
          >
            ‹
          </button>
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[20px] bg-slate-200">
            <img src={room.images[0]} alt={room.title} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-slate-950">{room.title}</h1>
              <MatchBadge score={room.match.score} />
            </div>
            <p className="mt-1 truncate text-xs font-medium text-slate-500">
              {room.area}, {room.city} · {formatCurrency(room.rent)}/mo
            </p>
          </div>
        </div>
      </section>

      <section className="flex-1 space-y-3 px-1 py-4">
        {conversation.messages.map((message) => {
          const isUser = message.sender === 'user'

          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] rounded-[24px] px-4 py-3 shadow-soft ${
                  isUser
                    ? 'rounded-br-[8px] bg-gradient-to-br from-emerald-400 to-emerald-600 text-white'
                    : 'rounded-bl-[8px] bg-white text-slate-700'
                }`}
              >
                <p className="text-sm leading-6">{message.body}</p>
                <p className={`mt-1 text-[11px] font-medium ${isUser ? 'text-emerald-50' : 'text-slate-400'}`}>
                  {formatMessageTime(message.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
      </section>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-[calc(5.45rem+env(safe-area-inset-bottom))] z-20 rounded-[28px] border border-white/70 bg-white/94 p-2 shadow-soft backdrop-blur-xl"
      >
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder="Write a message..."
            className="min-h-12 flex-1 resize-none rounded-[22px] border border-orange-100 bg-slate-50 px-4 py-3 text-base text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={!draftMessage.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-semibold text-white shadow-pressable transition active:scale-[0.96] disabled:opacity-45"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  )
}

function formatMessageTime(value) {
  return new Intl.DateTimeFormat('en-IE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
