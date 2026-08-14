import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ApplicationStatus from '../components/ApplicationStatus'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import { isClosedStatus, isLandlordEngagedStatus } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { getFutureViewingSlots } from '../utils/dateUtils'

export default function Messages() {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { conversations, dismissToast, role, toast, unarchiveConversation } = useAppState()
  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations],
  )

  if (conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) {
      return (
        <div className="mx-auto w-full max-w-[480px]">
          <EmptyState
            eyebrow="Messages"
            title="Conversation not available"
            description="This conversation could not be opened. Return to your message list or browse properties."
            actions={
              <>
                <Button onClick={() => navigate('/messages')}>Back to messages</Button>
                <Button variant="secondary" onClick={() => navigate('/properties')}>Browse properties</Button>
              </>
            }
          />
        </div>
      )
    }
    return <ChatThread conversation={conversation} />
  }

  if (!sortedConversations.length) {
    return (
      <div className="mx-auto w-full max-w-[480px]">
        <EmptyState
          eyebrow="Messages"
          title="No conversations yet"
          description="When you send an enquiry or receive a reply, the conversation will appear here."
          actions={<Button onClick={() => navigate('/properties')}>Browse properties</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {toast?.action === 'undo-archive' ? (
        <div className="toast-enter rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-700">{toast.message}</span>
            <button
              type="button"
              className="min-h-10 rounded-full px-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
              onClick={() => {
                unarchiveConversation(toast.conversationId)
                dismissToast()
              }}
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}

      <section className="card-surface card-shadow rounded-[28px] p-5">
        <p className="text-sm font-semibold text-emerald-600">Messages</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Conversations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enquiries, landlord replies and viewing updates in one place.</p>
      </section>

      <section className="space-y-3">
        {sortedConversations.map((conversation) => {
          const property = conversation.property
          const lastMessage = conversation.messages[conversation.messages.length - 1] || {
            sender: '',
            body: 'No messages yet.',
            createdAt: conversation.updatedAt || conversation.createdAt,
          }
          const hasUnread = conversation.unreadFor === role
          const statusChip = getConversationStatusChip(conversation)

          return (
            <article
              key={conversation.id}
              className={`card-surface card-shadow flex w-full items-center gap-3 rounded-[24px] p-3 text-left transition duration-200 hover:-translate-y-0.5 ${
                hasUnread ? 'border-indigo-200 bg-white' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => navigate(`/messages/${conversation.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
              >
                <div className="h-18 w-18 shrink-0 overflow-hidden rounded-[18px] bg-slate-100">
                  <ThumbnailImage src={property.images[0]} />
                </div>
                <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className={`truncate text-base text-slate-950 ${hasUnread ? 'font-bold' : 'font-semibold'}`}>{property.title}</h2>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">
                      {property.area} · {formatCurrency(property.rent)}/mo
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-400">{formatMessageTime(lastMessage.createdAt)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
                  {lastMessage.sender === role ? 'You: ' : ''}
                  {lastMessage.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {hasUnread ? <span className="h-2 w-2 rounded-full bg-indigo-950" aria-label="Unread conversation" /> : null}
                  {statusChip ? (
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {statusChip}
                    </span>
                  ) : null}
                </div>
                </div>
              </button>
              <ConversationRowMenu conversation={conversation} />
            </article>
          )
        })}
      </section>
    </div>
  )
}

function ChatThread({ conversation }) {
  const navigate = useNavigate()
  const {
    archiveConversation,
    blockConversation,
    chooseViewing,
    muteConversation,
    proposeViewing,
    reportConversation,
    role,
    sendMessage,
  } = useAppState()
  const [draftMessage, setDraftMessage] = useState('')
  const textareaRef = useRef(null)
  const property = conversation.property
  const enquiry = conversation.enquiry
  const viewingStatus = enquiry?.viewing?.status
  const tenantWaitingForLandlord = role === 'tenant' && !canCurrentRoleMessage(conversation, role)
  const messagingBlocked = Boolean(conversation.blockedBy)
  const composerDisabled = tenantWaitingForLandlord || messagingBlocked || isClosedStatus(enquiry?.status)

  useEffect(() => {
    resizeComposer(textareaRef.current)
  }, [draftMessage])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!draftMessage.trim() || composerDisabled) return
    sendMessage(conversation.id, draftMessage)
    setDraftMessage('')
    window.requestAnimationFrame(() => resizeComposer(textareaRef.current))
  }

  const handleComposerKeyDown = (event) => {
    const isDesktopKeyboard = window.matchMedia('(pointer: fine)').matches
    if (event.key !== 'Enter' || event.shiftKey || !isDesktopKeyboard || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div className="flex min-h-[calc(100dvh-10.75rem-env(safe-area-inset-bottom))] flex-col">
      <CompactPropertyHeader conversation={conversation} onBack={() => navigate('/messages')} />

      <section className="flex-1 space-y-3 px-1 py-4">
        {enquiry ? <ApplicationStatus enquiry={enquiry} compact /> : null}

        {viewingStatus === 'viewing proposed' ? (
          <ViewingProposedCard
            enquiry={enquiry}
            canChoose={role === 'tenant'}
            onChoose={(slot) => chooseViewing(enquiry.id, slot)}
          />
        ) : null}

        {viewingStatus === 'viewing confirmed' ? (
          <ViewingConfirmedCard property={property} selectedSlot={enquiry.viewing.selectedSlot} />
        ) : null}

        {role === 'landlord' && enquiry ? (
          <LandlordViewingCard
            onArchive={() => archiveConversation(conversation.id)}
            onPropose={(slots) => proposeViewing(enquiry.id, slots)}
          />
        ) : null}

        <div className="space-y-2.5">
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} isOutgoing={message.sender === role} />
          ))}
        </div>
      </section>

      {tenantWaitingForLandlord ? (
        <StatusCard tone="plain" title="Waiting for the landlord to reply">
          <p className="text-sm leading-6 text-slate-600">
            Your enquiry has been sent. You can continue once the landlord replies or engages with your application.
          </p>
        </StatusCard>
      ) : null}

      {messagingBlocked ? (
        <StatusCard tone="plain" title="Messaging blocked">
          <p className="text-sm leading-6 text-slate-600">Conversation history is still available, but new messages are disabled.</p>
        </StatusCard>
      ) : null}

      <ConversationSafetyMenu
        conversation={conversation}
        onArchive={() => archiveConversation(conversation.id)}
        onBlock={() => blockConversation(conversation.id)}
        onMute={() => muteConversation(conversation.id)}
        onReport={(reason) => reportConversation(conversation.id, reason)}
      />

      <form
        id="message-composer"
        onSubmit={handleSubmit}
        className="sticky bottom-[calc(5.35rem+env(safe-area-inset-bottom))] z-20 rounded-[24px] border border-slate-200 bg-white/96 p-2 shadow-soft backdrop-blur-md"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draftMessage}
            onChange={(event) => {
              setDraftMessage(event.target.value)
              resizeComposer(event.target)
            }}
            onKeyDown={handleComposerKeyDown}
            disabled={composerDisabled}
            maxLength={1200}
            placeholder={composerDisabled ? 'Waiting for the landlord to reply' : 'Write a message'}
            className="max-h-36 min-h-12 flex-1 resize-none overflow-y-auto rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-200 focus:bg-white focus:ring-4 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={!draftMessage.trim() || composerDisabled}
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-950 text-lg font-semibold text-white shadow-soft transition duration-200 hover:bg-indigo-900 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  )
}

function CompactPropertyHeader({ conversation, onBack }) {
  const property = conversation.property
  const enquiry = conversation.enquiry

  return (
    <section className="card-surface card-shadow sticky top-[calc(env(safe-area-inset-top)+5.25rem)] z-20 overflow-hidden rounded-[24px]">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl leading-none text-slate-700 transition hover:bg-slate-200 active:scale-[0.96] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          ‹
        </button>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px] bg-slate-100">
          <ThumbnailImage src={property.images[0]} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-slate-950">{property.title}</h1>
            <MatchBadge score={property.match.score} compact />
          </div>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {property.area} · {formatCurrency(property.rent)}/mo
          </p>
        </div>
      </div>
      {enquiry ? (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-500">{enquiry.statusLabel}</span>
        </div>
      ) : null}
    </section>
  )
}

function MessageBubble({ message, isOutgoing }) {
  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-[22px] px-4 py-3 ${
          isOutgoing
            ? 'rounded-br-md bg-indigo-950 text-white'
            : 'rounded-bl-md border border-slate-100 bg-white text-slate-700 shadow-soft'
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
        <p className={`mt-1 text-[11px] font-medium ${isOutgoing ? 'text-indigo-100' : 'text-slate-400'}`}>
          {formatMessageTime(message.createdAt)}
          {isOutgoing ? ' · Sent' : ''}
        </p>
      </div>
    </div>
  )
}

function ViewingProposedCard({ enquiry, canChoose, onChoose }) {
  const [isConfirming, setIsConfirming] = useState(false)

  return (
    <StatusCard tone="neutral" title="Viewing proposed">
      <p className="text-sm leading-6 text-slate-600">
        Choose a time that works. The viewing will be confirmed in this conversation.
      </p>
      {canChoose ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {enquiry.viewing.proposedSlots.map((slot) => (
            <Button
              key={slot}
              variant="secondary"
              className="bg-white"
              disabled={isConfirming}
              onClick={() => {
                setIsConfirming(true)
                onChoose(slot)
              }}
            >
              {slot}
            </Button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {enquiry.viewing.proposedSlots.map((slot) => (
            <span key={slot} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-soft">
              {slot}
            </span>
          ))}
        </div>
      )}
    </StatusCard>
  )
}

function ViewingConfirmedCard({ property, selectedSlot }) {
  return (
    <StatusCard tone="success" title="Viewing confirmed">
      <p className="text-sm leading-6 text-emerald-900">
        {selectedSlot} · {property.area}
      </p>
      <p className="mt-1 text-sm leading-6 text-emerald-800">Keep this conversation open for any access details or timing changes.</p>
    </StatusCard>
  )
}

function LandlordViewingCard({ onArchive, onPropose }) {
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [isProposing, setIsProposing] = useState(false)

  const proposeOnce = (slots) => {
    if (isProposing) return
    setIsProposing(true)
    onPropose(slots)
    window.setTimeout(() => setIsProposing(false), 250)
  }

  return (
    <StatusCard tone="plain" title="Arrange viewing">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" className="bg-white" disabled={isProposing} onClick={() => proposeOnce(getFutureViewingSlots())}>
          Next available
        </Button>
        <Button variant="secondary" className="bg-white" disabled={isProposing} onClick={() => proposeOnce(getFutureViewingSlots(new Date(Date.now() + 2 * 86400000)))}>
          Later times
        </Button>
      </div>
      {confirmArchive ? (
        <div className="mt-3 rounded-[18px] border border-amber-100 bg-amber-50 px-3 py-3">
          <p className="text-sm font-semibold text-amber-950">Archive this conversation?</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">It will leave the active message list.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="bg-white" onClick={() => setConfirmArchive(false)}>Keep</Button>
            <Button variant="dark" onClick={onArchive}>Archive</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3 min-h-11 bg-white text-slate-600" onClick={() => setConfirmArchive(true)}>
          Archive conversation
        </Button>
      )}
    </StatusCard>
  )
}

function ConversationSafetyMenu({ conversation, onArchive, onBlock, onMute, onReport }) {
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const reported = Boolean(conversation.reported)

  return (
    <details className="group mb-3 self-end">
      <summary className="ml-auto flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-semibold text-slate-600 shadow-soft transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
        <span aria-label="Conversation actions">•••</span>
      </summary>
      <div className="mt-2 grid min-w-[16rem] gap-2 rounded-[22px] border border-slate-200 bg-white p-2 shadow-soft">
        <Button variant="secondary" className="justify-start text-slate-600" onClick={onMute}>
          {conversation.muted ? 'Unmute conversation' : 'Mute conversation'}
        </Button>
        <Button variant="secondary" className="justify-start text-slate-600" onClick={onArchive}>Archive conversation</Button>
        <label className="px-2 py-1">
          <span className="mb-2 block text-xs font-semibold text-slate-500">Report reason</span>
          <select
            value={reportReason}
            disabled={reported}
            onChange={(event) => setReportReason(event.target.value)}
            className="min-h-11 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">Choose reason</option>
            <option value="Suspicious listing or user">Suspicious listing or user</option>
            <option value="Harassment or pressure">Harassment or pressure</option>
            <option value="Payment request outside Gafflo">Payment request outside Gafflo</option>
          </select>
        </label>
        <Button variant="secondary" className="justify-start text-slate-600" disabled={reported || !reportReason} onClick={() => onReport(reportReason)}>
          {reported ? 'Report sent' : 'Send report'}
        </Button>
        {confirmBlock ? (
          <div className="rounded-[18px] border border-amber-100 bg-amber-50 px-3 py-3">
            <p className="text-sm font-semibold text-amber-950">Block this user?</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">Messaging will stop, but the conversation history stays visible.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="bg-white" onClick={() => setConfirmBlock(false)}>Cancel</Button>
              <Button variant="dark" disabled={Boolean(conversation.blockedBy)} onClick={onBlock}>Block</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="justify-start text-slate-600" disabled={Boolean(conversation.blockedBy)} onClick={() => setConfirmBlock(true)}>
            {conversation.blockedBy ? 'Blocked' : 'Block user'}
          </Button>
        )}
      </div>
    </details>
  )
}

function ConversationRowMenu({ conversation }) {
  const { archiveConversation } = useAppState()

  return (
    <details className="relative shrink-0">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-lg font-semibold text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
        <span aria-label="Conversation actions">•••</span>
      </summary>
      <div className="absolute right-0 top-11 z-10 w-36 rounded-[18px] border border-slate-200 bg-white p-2 shadow-soft">
        <Button variant="secondary" className="min-h-10 w-full justify-start text-slate-600" onClick={() => archiveConversation(conversation.id)}>
          Archive
        </Button>
      </div>
    </details>
  )
}

function canCurrentRoleMessage(conversation, role) {
  if (conversation.blockedBy) return false
  if (role === 'landlord') return true
  const enquiry = conversation.enquiry
  if (!enquiry) return true
  if (isClosedStatus(enquiry.status)) return false
  const landlordReplied = conversation.messages.some((message) => message.sender === 'landlord')
  return landlordReplied || isLandlordEngagedStatus(enquiry.status)
}

function getConversationStatusChip(conversation) {
  if (conversation.blockedBy) return 'Blocked'
  if (conversation.enquiry?.viewing?.status === 'viewing confirmed') return `Viewing ${conversation.enquiry.viewing.selectedSlot}`
  if (conversation.enquiry?.viewing?.status === 'viewing proposed') return 'Viewing proposed'
  if (!canCurrentRoleMessage(conversation, 'tenant')) return 'Awaiting reply'
  return conversation.enquiry?.statusLabel || ''
}

function StatusCard({ children, title, tone }) {
  const tones = {
    success: 'border-emerald-100 bg-emerald-50/85 text-emerald-950',
    neutral: 'border-indigo-100 bg-indigo-50/65 text-slate-950',
    plain: 'border-slate-200 bg-white text-slate-950',
  }

  return (
    <article className={`rounded-[22px] border px-4 py-3 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-indigo-950 text-white'
          }`}
          aria-hidden="true"
        >
          {tone === 'success' ? '✓' : '•'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </article>
  )
}

function resizeComposer(textarea) {
  if (!textarea) return
  textarea.style.height = 'auto'
  const maxHeight = 144
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-IE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function ThumbnailImage({ src }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)

  if (hasFailed) {
    return <div className="h-full w-full bg-slate-200" />
  }

  return (
    <div className="relative h-full w-full">
      {!isLoaded ? <div className="skeleton absolute inset-0" /> : null}
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setHasFailed(true)}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  )
}
