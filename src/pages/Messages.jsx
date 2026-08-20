import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { filterConversationsByRole, isTenantWaitingForLandlordReply } from '../config/messageAdapter'
import useAccountProfile from '../context/useAccountProfile'
import useMessaging from '../context/useMessaging'
import { formatCurrency } from '../utils/formatCurrency'
import { sanitizeMessageBody } from '../utils/messagingRules'

// Local, frontend-only starter set — free for every landlord (see pricingPlans.js). Tapping one
// replaces the composer draft so it's always reviewed and edited before sending; nothing here
// ever sends on its own.
const landlordQuickReplies = [
  { id: 'move-in', label: 'Confirm move-in', body: 'Thanks for your interest. Could you confirm your preferred move-in date?' },
  { id: 'viewing', label: 'Ask about viewing', body: 'Thanks for applying. Would you be available for a viewing?' },
  { id: 'reviewing', label: 'Still reviewing', body: "Thanks for your interest. I'm reviewing applications and will get back to you shortly." },
]

export default function Messages() {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { conversations } = useMessaging()
  const { activeRole: role } = useAccountProfile()
  const [undoToast, setUndoToast] = useState(null)

  // Inbox list is scoped to the currently active role — a dual-role account's tenant-side and
  // landlord-side threads are the same real conversations table, never duplicated per role, so
  // this is presentation-only filtering by which side of each real conversation this account is
  // on (see config/messageAdapter.js's filterConversationsByRole).
  const sortedConversations = useMemo(
    () =>
      filterConversationsByRole(conversations, role)
        .filter((conversation) => !conversation.archived)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations, role],
  )

  if (conversationId) {
    // Deliberately searched in the full, unscoped `conversations` list, not sortedConversations:
    // a direct link to a conversation this account legitimately participates in (proven by RLS)
    // must still open even if it belongs to the account's other role. ChatThread itself renders
    // correctly either way since it derives its own role context from the conversation
    // (conversation.isTenant), never from the activeRole toggle — no cross-role mix-up results.
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
    return <ChatThread key={conversation.id} conversation={conversation} />
  }

  const archiveToast = undoToast ? (
    <ArchiveUndoToast conversationId={undoToast.conversationId} onDismiss={() => setUndoToast(null)} onUndo={() => setUndoToast(null)} />
  ) : null

  if (!sortedConversations.length) {
    return (
      <div className="mx-auto w-full max-w-[480px] space-y-4">
        {archiveToast}
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
      {archiveToast}

      <section className="card-surface card-shadow rounded-[28px] p-5">
        <p className="text-sm font-semibold text-emerald-600">Messages</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Conversations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enquiries and landlord replies in one place.</p>
      </section>

      <section className="space-y-3">
        {sortedConversations.map((conversation) => (
          <ConversationListRow
            key={conversation.id}
            conversation={conversation}
            onOpen={() => navigate(`/messages/${conversation.id}`)}
            onArchived={() => setUndoToast({ conversationId: conversation.id })}
          />
        ))}
      </section>
    </div>
  )
}

function ArchiveUndoToast({ conversationId, onDismiss, onUndo }) {
  const { setArchived } = useMessaging()
  return (
    <div className="toast-enter rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-700">Conversation archived.</span>
        <button
          type="button"
          className="min-h-10 rounded-full px-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
          onClick={async () => {
            await setArchived(conversationId, false)
            onUndo()
          }}
        >
          Undo
        </button>
        <button type="button" className="sr-only" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}

function ConversationListRow({ conversation, onOpen, onArchived }) {
  const { setArchived } = useMessaging()
  const [offset, setOffset] = useState(0)
  const start = useRef(null)
  const listing = conversation.listing
  const lastMessage = conversation.lastMessage
  const waiting = isTenantWaitingForLandlordReply(conversation)
  const revealed = offset < -64

  const handlePointerDown = (event) => {
    if (window.matchMedia('(pointer: fine)').matches) return
    start.current = { x: event.clientX, y: event.clientY, active: true }
  }

  const handlePointerMove = (event) => {
    if (!start.current?.active) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
      start.current = null
      setOffset(0)
      return
    }
    if (dx < 0) setOffset(Math.max(dx, -96))
  }

  const handlePointerUp = () => {
    setOffset(offset < -76 ? -96 : 0)
    start.current = null
  }

  const archive = () => {
    setArchived(conversation.id, true)
    onArchived()
  }

  return (
    <div className="relative overflow-hidden rounded-[24px]">
      <div className={`absolute inset-y-0 right-0 z-10 flex items-center pr-2 transition-opacity md:hidden ${revealed ? 'opacity-100' : 'opacity-0'}`}>
        <Button variant="secondary" className="min-h-10 bg-white text-rose-700" onClick={archive}>
          Archive
        </Button>
      </div>
      <article
        className={`card-surface card-shadow flex w-full items-center gap-3 rounded-[24px] p-3 text-left transition duration-200 hover:-translate-y-0.5 ${
          conversation.unread ? 'border-indigo-200 bg-white' : ''
        }`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setOffset(0)}
      >
        <button
          type="button"
          onClick={() => {
            if (revealed) {
              setOffset(0)
              return
            }
            onOpen()
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          <div className="h-18 w-18 shrink-0 overflow-hidden rounded-[18px] bg-slate-100">
            <ThumbnailImage src={listing?.images?.[0]} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className={`truncate text-base text-slate-950 ${conversation.unread ? 'font-bold' : 'font-semibold'}`}>
                  {listing?.title || 'Listing no longer available'}
                </h2>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                  {conversation.counterpart.displayName || (conversation.isTenant ? 'Landlord' : 'Tenant')}
                  {listing ? ` · ${listing.area} · ${formatCurrency(listing.rent)}/mo` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-400">{formatMessageTime(lastMessage?.createdAt)}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
              {lastMessage?.isOutgoing ? 'You: ' : ''}
              {lastMessage?.body || 'No messages yet.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {conversation.unread ? <span className="h-2 w-2 rounded-full bg-indigo-950" aria-label="Unread conversation" /> : null}
              {conversation.blockedByMe ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Blocked</span>
              ) : waiting ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Awaiting reply</span>
              ) : null}
            </div>
          </div>
        </button>
        <ConversationRowMenu conversation={conversation} onArchive={archive} />
      </article>
    </div>
  )
}

function ChatThread({ conversation }) {
  const navigate = useNavigate()
  const { blockUser, markRead, setArchived, setMuted, sendMessage, unblockUser } = useMessaging()
  const [draftMessage, setDraftMessage] = useState('')
  const [sendPending, setSendPending] = useState(false)
  const [sendError, setSendError] = useState('')
  const bodyRef = useRef(null)
  const textareaRef = useRef(null)
  const waiting = isTenantWaitingForLandlordReply(conversation)
  const composerDisabled = waiting || conversation.blockedByMe || sendPending

  useEffect(() => {
    resizeComposer(textareaRef.current)
  }, [draftMessage])

  useEffect(() => {
    if (!conversation.unread) return
    markRead(conversation.id)
    // conversation.unread is intentionally excluded: it flips to false as soon as this fires and
    // refreshMessaging() completes, which must not immediately re-trigger this same effect — the
    // dependency on conversation.id alone is what makes this fire once per thread visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, markRead])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    window.requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight
    })
  }, [conversation.id, conversation.messages.length])

  const archiveAndReturn = async () => {
    await setArchived(conversation.id, true)
    navigate('/messages', { replace: true })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const body = sanitizeMessageBody(draftMessage)
    if (!body || composerDisabled) return
    setSendPending(true)
    setSendError('')
    const { error } = await sendMessage(conversation.id, body)
    setSendPending(false)
    if (error) {
      setSendError(error)
      return
    }
    setDraftMessage('')
    window.requestAnimationFrame(() => resizeComposer(textareaRef.current))
  }

  const handleComposerKeyDown = (event) => {
    const isDesktopKeyboard = window.matchMedia('(pointer: fine)').matches
    if (event.key !== 'Enter' || event.shiftKey || !isDesktopKeyboard || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const insertQuickReply = (body) => {
    setDraftMessage(body)
    window.requestAnimationFrame(() => {
      resizeComposer(textareaRef.current)
      textareaRef.current?.focus()
    })
  }

  return (
    <div className="flex h-[calc(100dvh-var(--gafflo-app-header-offset)-var(--gafflo-bottom-nav-offset)-0.75rem)] min-h-[34rem] flex-col overflow-hidden">
      <CompactPropertyHeader
        conversation={conversation}
        onArchive={archiveAndReturn}
        onBack={() => navigate('/messages')}
        onBlock={() => blockUser(conversation.counterpartId)}
        onUnblock={() => unblockUser(conversation.counterpartId)}
        onMute={() => setMuted(conversation.id, !conversation.muted)}
      />

      <section ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 pb-4 pt-3">
        <div className="space-y-2.5">
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </section>

      {waiting ? (
        <LockedComposerState
          title="Waiting for the landlord to reply"
          description="Your message has been sent. You can send another once the landlord replies."
        />
      ) : conversation.blockedByMe ? (
        <LockedComposerState
          title="You blocked this user"
          description="Conversation history is still available, but new messages are disabled until you unblock them."
        />
      ) : (
        <div className="-mx-4 shrink-0 md:mx-0">
          {!conversation.isTenant ? (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 md:px-0" aria-label="Quick replies">
              {landlordQuickReplies.map((reply) => (
                <button
                  key={reply.id}
                  type="button"
                  onClick={() => insertQuickReply(reply.body)}
                  className="min-h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-soft transition hover:border-indigo-200 hover:text-indigo-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                >
                  {reply.label}
                </button>
              ))}
            </div>
          ) : null}
          {sendError ? <p className="px-4 pb-1 text-sm font-medium text-rose-600 md:px-0">{sendError}</p> : null}
          <form
            id="message-composer"
            onSubmit={handleSubmit}
            className="border-t border-slate-200 bg-white/97 px-4 pb-3 pt-2 shadow-[0_-18px_34px_-28px_rgba(15,23,42,0.35)] backdrop-blur-md md:rounded-[24px] md:border md:p-2"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draftMessage}
                onChange={(event) => {
                  setDraftMessage(event.target.value)
                  setSendError('')
                  resizeComposer(event.target)
                }}
                onKeyDown={handleComposerKeyDown}
                maxLength={1200}
                placeholder="Write a message"
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
      )}
    </div>
  )
}

function CompactPropertyHeader({ conversation, onArchive, onBack, onBlock, onMute, onUnblock }) {
  const listing = conversation.listing

  return (
    <section className="card-surface card-shadow z-30 shrink-0 overflow-visible rounded-[22px]">
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
          <ThumbnailImage src={listing?.images?.[0]} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-950">{listing?.title || 'Listing no longer available'}</h1>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {conversation.counterpart.displayName || 'Gafflo user'}
            {listing ? ` · ${listing.area} · ${formatCurrency(listing.rent)}/mo` : ''}
          </p>
        </div>
        <ConversationSafetyMenu conversation={conversation} onArchive={onArchive} onBlock={onBlock} onMute={onMute} onUnblock={onUnblock} />
      </div>
    </section>
  )
}

function LockedComposerState({ description, title }) {
  return (
    <div className="-mx-4 shrink-0 border-t border-slate-200 bg-white/97 px-4 pb-3 pt-3 shadow-[0_-18px_34px_-28px_rgba(15,23,42,0.35)] backdrop-blur-md md:mx-0 md:rounded-[24px] md:border">
      <div className="rounded-[18px] bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  return (
    <div className={`flex ${message.isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-[22px] px-4 py-3 ${
          message.isOutgoing
            ? 'rounded-br-md bg-indigo-950 text-white'
            : 'rounded-bl-md border border-slate-100 bg-white text-slate-700 shadow-soft'
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
        <p className={`mt-1 text-[11px] font-medium ${message.isOutgoing ? 'text-indigo-100' : 'text-slate-400'}`}>
          {formatMessageTime(message.createdAt)}
          {message.isOutgoing ? ' · Sent' : ''}
        </p>
      </div>
    </div>
  )
}

// Report is deliberately not offered here: there is no real Reports backend in Stage E (no
// schema, no moderation review), and a local-only write that merely persists to this device would
// look like a submitted safety report without actually reaching Gafflo — see the Stage E
// pre-merge audit. Block/unblock is real (backed by block_user()/unblock_user()) and stays as
// the only safety action on a real conversation.
function ConversationSafetyMenu({ conversation, onArchive, onBlock, onMute, onUnblock }) {
  const [confirmBlock, setConfirmBlock] = useState(false)

  return (
    <details className="group relative shrink-0">
      <summary
        role="button"
        aria-label="Conversation actions"
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
      >
        <span aria-hidden="true">•••</span>
      </summary>
      <div className="absolute right-0 top-12 z-40 grid min-w-[16rem] gap-2 rounded-[22px] border border-slate-200 bg-white p-2 shadow-soft">
        <Button variant="secondary" className="justify-start text-slate-600" onClick={onMute}>
          {conversation.muted ? 'Unmute conversation' : 'Mute conversation'}
        </Button>
        <Button variant="secondary" className="justify-start text-slate-600" onClick={onArchive}>Archive conversation</Button>
        {confirmBlock ? (
          <div className="rounded-[18px] border border-amber-100 bg-amber-50 px-3 py-3">
            <p className="text-sm font-semibold text-amber-950">Block this user?</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">Messaging will stop, but the conversation history stays visible.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="bg-white" onClick={() => setConfirmBlock(false)}>Cancel</Button>
              <Button variant="dark" onClick={() => { onBlock(); setConfirmBlock(false) }}>Block</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="justify-start text-slate-600"
            onClick={() => (conversation.blockedByMe ? onUnblock() : setConfirmBlock(true))}
          >
            {conversation.blockedByMe ? 'Unblock user' : 'Block user'}
          </Button>
        )}
      </div>
    </details>
  )
}

function ConversationRowMenu({ onArchive }) {
  return (
    <div className="relative hidden shrink-0 md:block">
      <details className="relative">
        <summary
          role="button"
          aria-label="Conversation actions"
          className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-lg font-semibold text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          <span aria-hidden="true">•••</span>
        </summary>
        <div className="absolute right-0 top-11 z-10 w-36 rounded-[18px] border border-slate-200 bg-white p-2 shadow-soft">
          <Button variant="secondary" className="min-h-10 w-full justify-start text-slate-600" onClick={onArchive}>
            Archive
          </Button>
        </div>
      </details>
    </div>
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
  if (!value) return ''
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

  if (hasFailed || !src) {
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
