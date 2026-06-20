import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Zap,
  ShoppingCart,
  Users,
  TrendingUp,
  AlertTriangle,
  Trash2,
  Calendar,
  Lightbulb,
  Truck,
  Settings,
  ShoppingBag,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { to: '/',               label: 'Dashboard',        Icon: LayoutDashboard },
  { to: '/energy',         label: 'Energy & Water',   Icon: Zap },
  { to: '/inventory',      label: 'Inventory',        Icon: ShoppingCart },
  { to: '/footfall',       label: 'Footfall & Sales', Icon: Users },
  { to: '/forecasts',      label: 'Forecasts',        Icon: TrendingUp },
  { to: '/anomalies',      label: 'Anomalies',        Icon: AlertTriangle },
  { to: '/waste',          label: 'Waste & Savings',  Icon: Trash2 },
  { to: '/schedule',       label: 'Schedule',         Icon: Calendar },
  { to: '/insights',       label: 'Insights',         Icon: Lightbulb },
  { to: '/transportation', label: 'Transportation',   Icon: Truck },
  { to: '/settings',       label: 'Settings',         Icon: Settings },
] as const

export default function Sidebar() {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
          <ShoppingBag className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-bold text-gray-100">ResWatch Retail</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-r-2 border-brand-500 bg-brand-950 font-medium text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-4 py-3">
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
        >
          Sign out
        </button>
        <p className="mt-1 text-xs text-gray-700">ImagineHack 2026 · Track 3</p>
      </div>
    </aside>
  )
}
