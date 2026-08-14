import { NavLink } from 'react-router-dom'
import useAppState from '../context/useAppState'

const renterItems = [
  { to: '/discover', label: 'Discover', icon: '⌁' },
  { to: '/saved', label: 'Saved', icon: '▱' },
  { to: '/messages', label: 'Messages', icon: '✉' },
  { to: '/profile', label: 'Profile', icon: '◎' },
]

const hostItems = [
  { to: '/dashboard', label: 'Home', icon: '⌂' },
  { to: '/properties', label: 'Properties', icon: '▤' },
  { to: '/applicants', label: 'Applicants', icon: '⌁' },
  { to: '/messages', label: 'Messages', icon: '✉' },
  { to: '/profile', label: 'Profile', icon: '◎' },
]

export default function BottomNav() {
  const { role, savedPropertyIds } = useAppState()
  const items = role === 'landlord' ? hostItems : renterItems

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-0 pb-[env(safe-area-inset-bottom)] pt-0 md:hidden">
      <div
        className="card-surface card-shadow mx-auto grid max-w-none gap-1 rounded-none border-x-0 border-b-0 px-2 py-2 backdrop-blur-md"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-15 flex-col items-center justify-center rounded-[18px] text-[11px] font-semibold transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 min-[375px]:text-xs ${
                isActive
                  ? 'shadow-soft bg-indigo-950 text-white'
                  : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`
            }
          >
            <span className="relative text-lg leading-none">
              {item.icon}
              {item.to === '/saved' && savedPropertyIds.length > 0 ? (
                <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                  {savedPropertyIds.length}
                </span>
              ) : null}
            </span>
            <span className="mt-1">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
