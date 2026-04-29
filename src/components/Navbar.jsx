import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/profile', label: 'Profile' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/saved', label: 'Saved' },
]

export default function Navbar() {
  return (
    <header className="glass-topbar sticky top-0 z-30 hidden border-b border-orange-100/80 md:block">
      <div className="mx-auto flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <div className="shadow-pressable flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-semibold text-white">
            ⌂
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight text-slate-950">Gafflo</div>
            <p className="text-sm text-slate-500">Swipe rooms. Match smarter. Move better.</p>
          </div>
        </div>

        <nav className="card-surface card-shadow flex items-center gap-2 rounded-full px-2 py-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'shadow-soft bg-slate-900 text-white'
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
