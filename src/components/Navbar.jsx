import { NavLink, useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import useAppState from '../context/useAppState'

const tenantLinks = [
  { to: '/discover', label: 'Discover' },
  { to: '/saved', label: 'Saved' },
  { to: '/messages', label: 'Messages' },
  { to: '/profile', label: 'Profile' },
]

const landlordLinks = [
  { to: '/dashboard', label: 'Home' },
  { to: '/properties', label: 'Properties' },
  { to: '/applicants', label: 'Applicants' },
  { to: '/messages', label: 'Messages' },
  { to: '/profile', label: 'Profile' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const { role } = useAppState()
  const links = role === 'landlord' ? landlordLinks : tenantLinks
  const homeRoute = role === 'landlord' ? '/dashboard' : '/discover'

  return (
    <header className="glass-topbar sticky top-0 z-30 hidden border-b border-indigo-100/80 md:block">
      <div className="mx-auto flex items-center justify-between py-5">
        <button
          type="button"
          aria-label="Go to Gafflo home"
          onClick={() => navigate(homeRoute)}
          className="rounded-2xl outline-none transition active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          <BrandLogo />
        </button>

        <nav className="card-surface card-shadow flex items-center gap-2 rounded-full px-2 py-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'shadow-soft bg-indigo-950 text-white'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
