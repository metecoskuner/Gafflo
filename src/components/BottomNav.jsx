import { NavLink } from 'react-router-dom'
import useAppState from '../context/useAppState'

const renterItems = [
  { to: '/profile', label: 'Profile', icon: '◎' },
  { to: '/rooms', label: 'Rooms', icon: '⇄' },
  { to: '/saved', label: 'Saved', icon: '♥' },
  { to: '/messages', label: 'Messages', icon: '✉' },
]

const hostItems = [
  { to: '/profile', label: 'Profile', icon: '◎' },
  { to: '/rooms', label: 'Rooms', icon: '⇄' },
  { to: '/create', label: 'Create', icon: '+' },
  { to: '/saved', label: 'Saved', icon: '♥' },
  { to: '/messages', label: 'Messages', icon: '✉' },
]

export default function BottomNav() {
  const { onboarding, savedRoomIds } = useAppState()
  const items = onboarding?.userType === 'offering' ? hostItems : renterItems

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-0 pb-[env(safe-area-inset-bottom)] pt-0 md:hidden">
      <div
        className="card-surface card-shadow mx-auto grid max-w-none gap-1 rounded-none border-x-0 border-b-0 px-2 py-2 backdrop-blur-xl"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-15 flex-col items-center justify-center rounded-[22px] text-xs font-semibold transition ${
                isActive
                  ? 'shadow-pressable bg-gradient-to-br from-emerald-400 to-emerald-600 text-white'
                  : 'text-slate-500 active:bg-slate-50'
              }`
            }
          >
            <span className="relative text-base leading-none">
              {item.icon}
              {item.to === '/saved' && savedRoomIds.length > 0 ? (
                <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                  {savedRoomIds.length}
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
