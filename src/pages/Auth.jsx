import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import useAuth from '../context/useAuth'

function isValidEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value)
}

function humanizeAuthError(error) {
  const message = error?.message || ''
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a moment and try again.'
  if (/email/i.test(message) && /invalid/i.test(message)) return 'Enter a valid email address.'
  return 'Something went wrong sending your sign-in link. Please try again.'
}

// The real authentication entry point. Signed-out visitors land here (see AuthGate) and never
// see the marketplace until Supabase confirms a session — this screen itself never claims a
// login succeeded, verifies an email, or shows account details; it only starts the magic-link
// flow and reports Supabase's own outcome.
export default function Auth() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setStatus('error')
      setError('Enter a valid email address.')
      return
    }
    setStatus('sending')
    setError('')
    try {
      await signInWithEmail(trimmed)
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(humanizeAuthError(err))
    }
  }

  const editEmail = () => {
    setStatus('idle')
    setError('')
    setEmail('')
  }

  return (
    <div className="page-shell mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-4 py-8 md:px-6">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] md:rounded-[34px]">
        <div className="bg-[var(--gafflo-brand-ink)] px-5 py-7 text-white md:px-8">
          <BrandLogo size="lg" theme="dark" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Sign in</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">
            {status === 'sent' ? 'Check your email' : 'Welcome to Gafflo'}
          </h1>
        </div>

        <div className="p-4 min-[390px]:p-5 md:p-8">
          {status === 'sent' ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                We sent a sign-in link to <span className="font-semibold text-slate-950">{email.trim()}</span>.
                Open it on this device to continue.
              </p>
              <Button type="button" variant="secondary" className="w-full" onClick={editEmail}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <p className="text-sm leading-6 text-slate-600">
                Enter your email and we’ll send you a link to sign in. No password needed.
              </p>
              <FormInput
                id="auth-email"
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                error={status === 'error' ? error : ''}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (status === 'error') {
                    setStatus('idle')
                    setError('')
                  }
                }}
              />
              <Button type="submit" className="w-full" isLoading={status === 'sending'} disabled={status === 'sending'}>
                Send sign-in link
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
