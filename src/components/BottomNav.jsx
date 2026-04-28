import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/profile', label: 'Profile', icon: '◎' },
  { to: '/rooms', label: 'Rooms', icon: '⇄' },
  { to: '/saved', label: 'Saved', icon: '♥' },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-semibold transition ${
                isActive ? 'bg-emerald-500 text-white shadow-soft' : 'text-slate-500'
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
