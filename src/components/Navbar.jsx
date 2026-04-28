import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/profile', label: 'Profile' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/saved', label: 'Saved' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-orange-100/80 bg-[#fff7ed]/88 backdrop-blur-md md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-lg font-semibold text-white shadow-[0_18px_42px_-22px_rgba(16,185,129,0.9)]">
            G
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight text-slate-950">Gafflo</div>
            <p className="text-sm text-slate-500">Room matching for renters in Ireland.</p>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'
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
