import { Component } from 'react'
import BrandLogo from './BrandLogo'
import Button from './Button'

// A last-resort net for a genuine React render crash — never routing, data-loading, or auth
// state, all of which already have their own calm empty/error states elsewhere. Deliberately a
// class component: getDerivedStateFromError/componentDidCatch have no hook equivalent in React.
// Never renders the error/stack trace itself — that's for the console (still normal in dev),
// never the screen, since a caught error can carry request/user details this fallback must not
// surface to whoever is looking at the screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[Gafflo] Unhandled render error caught by ErrorBoundary:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="page-shell mx-auto flex min-h-screen w-full max-w-[520px] items-center px-4 py-4">
        <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] text-center md:rounded-[34px]">
          <div className="bg-[var(--gafflo-brand-ink)] px-5 py-7 text-white md:px-8">
            <BrandLogo size="lg" theme="dark" className="mx-auto" />
          </div>
          <div className="p-4 min-[390px]:p-5 md:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This screen ran into a problem and couldn&rsquo;t continue. Reloading usually fixes it — nothing you did
              caused this, and none of your saved information was lost.
            </p>
            <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
              Reload Gafflo
            </Button>
          </div>
        </section>
      </div>
    )
  }
}
