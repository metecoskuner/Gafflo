import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/profile', label: 'Profile', icon: '◎' },
  { to: '/rooms', label: 'Rooms', icon: '⇄' },
  { to: '/saved', label: 'Saved', icon: '♥' },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 md:hidden">
      <div className="card-surface card-shadow mx-auto grid max-w-md grid-cols-4 gap-2 rounded-[28px] px-2 py-2 backdrop-blur-xl">
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
            <span className="text-base leading-none">{item.icon}</span>
            <span className="mt-1">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
