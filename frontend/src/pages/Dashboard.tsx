import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Zap, Droplets, Users, ShoppingCart, AlertTriangle,
  Trash2, Calendar, TrendingUp, TrendingDown, Minus,
  Leaf, ShoppingBag, ArrowRight,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

// ── helpers ───────────────────────────────────────────────────────────────────

function Delta({ pct, invertGood = false }: { pct: number; invertGood?: boolean }) {
  const abs = Math.abs(pct)
  if (abs < 0.1) return <span className="text-gray-500 text-xs">0%</span>
  const isGood = invertGood ? pct < 0 : pct > 0
  if (pct < 0)
    return <span className={`flex items-center gap-0.5 text-xs ${isGood ? 'text-brand-400' : 'text-red-400'}`}>
      <TrendingDown className="h-3 w-3" />−{abs.toFixed(1)}%
    </span>
  return <span className={`flex items-center gap-0.5 text-xs ${isGood ? 'text-red-400' : 'text-brand-400'}`}>
    <TrendingUp className="h-3 w-3" />+{abs.toFixed(1)}%
  </span>
}

function KpiCard({
  icon, label, primary, secondary, delta, invertGood = false, to,
}: {
  icon: React.ReactNode; label: string; primary: string
  secondary?: string; delta?: number; invertGood?: boolean; to: string
}) {
  return (
    <Link to={to} className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition-colors block">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">{icon}{label}</div>
        {delta !== undefined && <Delta pct={delta} invertGood={invertGood} />}
      </div>
      <p className="text-2xl font-bold text-gray-100 tabular-nums">{primary}</p>
      {secondary && <p className="text-xs text-gray-500 mt-1">{secondary}</p>}
    </Link>
  )
}

const SEV_DOT: Record<string, string> = {
  HIGH:   'bg-red-500',
  MEDIUM: 'bg-amber-400',
  LOW:    'bg-yellow-600',
}
const SEV_TEXT: Record<string, string> = {
  HIGH:   'text-red-400',
  MEDIUM: 'text-amber-400',
  LOW:    'text-yellow-600',
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const storeId = useStoreId()
  const enabled  = !!storeId

  const { data: energy }    = useQuery({ queryKey: ['energy-summary', storeId],    queryFn: () => api.energy.summary(7),         enabled, staleTime: 60_000 })
  const { data: footfall }  = useQuery({ queryKey: ['footfall-summary', storeId],  queryFn: () => api.footfall.summary(7),       enabled, staleTime: 60_000 })
  const { data: inventory } = useQuery({ queryKey: ['inventory-summary', storeId], queryFn: () => api.inventory.summary(),        enabled, staleTime: 60_000 })
  const { data: waste }     = useQuery({ queryKey: ['waste-summary', storeId],     queryFn: () => api.waste.summary(),           enabled, staleTime: 60_000 })
  const { data: anomalies } = useQuery({ queryKey: ['anomaly-counts', storeId],    queryFn: () => api.anomalies.counts(),        enabled, staleTime: 30_000 })
  const { data: alerts = [] } = useQuery({
    queryKey: ['anomalies-list-dash', storeId],
    queryFn:  () => api.anomalies.list({ resolved: false, limit: 5 }),
    enabled,
    staleTime: 30_000,
  })
  const { data: schedule }  = useQuery({
    queryKey: ['schedule-dash', storeId],
    queryFn:  () => api.schedule.get(),
    enabled,
    staleTime: 120_000,
  })

  const activeAlerts = (anomalies?.total ?? 0)
  const highAlerts   = anomalies?.HIGH ?? 0

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">ResWatch Retail</h1>
          <p className="text-sm text-gray-400">Live resource overview — The Grand Bazaar</p>
        </div>
        {highAlerts > 0 && (
          <Link to="/anomalies"
            className="ml-auto flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-800/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950 transition-colors">
            <AlertTriangle className="h-3.5 w-3.5" />
            {highAlerts} HIGH {highAlerts === 1 ? 'alert' : 'alerts'} active
          </Link>
        )}
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          to="/energy"
          icon={<Zap className="h-4 w-4 text-yellow-400" />}
          label="Electricity (7d)"
          primary={energy ? `${energy.electricity.kwh.toFixed(0)} kWh` : '—'}
          secondary={energy ? `RM ${energy.electricity.cost_myr.toFixed(2)} · ${energy.electricity.co2e_kg.toFixed(1)} kg CO₂e` : undefined}
          delta={energy?.electricity.delta_pct}
          invertGood
        />
        <KpiCard
          to="/energy"
          icon={<Droplets className="h-4 w-4 text-sky-400" />}
          label="Water (7d)"
          primary={energy ? `${energy.water.m3.toFixed(1)} m³` : '—'}
          secondary={energy ? `RM ${energy.water.cost_myr.toFixed(2)}` : undefined}
          delta={energy?.water.delta_pct}
          invertGood
        />
        <KpiCard
          to="/footfall"
          icon={<Users className="h-4 w-4 text-violet-400" />}
          label="Footfall (7d)"
          primary={footfall ? footfall.footfall.total.toLocaleString() : '—'}
          secondary={footfall ? `~${footfall.footfall.avg_daily.toFixed(0)}/day · ${footfall.conversion.rate_pct}% conv.` : undefined}
          delta={footfall?.footfall.delta_pct}
        />
        <KpiCard
          to="/footfall"
          icon={<ShoppingBag className="h-4 w-4 text-emerald-400" />}
          label="Revenue (7d)"
          primary={footfall ? `RM ${footfall.sales.revenue_myr.toFixed(0)}` : '—'}
          secondary={footfall ? `${footfall.sales.transactions.toLocaleString()} transactions` : undefined}
          delta={footfall?.sales.delta_pct}
        />
        <KpiCard
          to="/inventory"
          icon={<ShoppingCart className="h-4 w-4 text-orange-400" />}
          label="Inventory alerts"
          primary={inventory ? `${(inventory.low_stock + inventory.at_risk)} items` : '—'}
          secondary={inventory ? `${inventory.low_stock} low stock · ${inventory.at_risk} at risk · RM ${inventory.spoilage_cost_myr.toFixed(0)} spoilage` : undefined}
          invertGood
        />
        <KpiCard
          to="/waste"
          icon={<Trash2 className="h-4 w-4 text-rose-400" />}
          label="Waste cost"
          primary={waste ? `RM ${waste.total_cost_myr.toFixed(2)}` : '—'}
          secondary={waste ? `${waste.events_count} events · ${waste.total_co2e_kg.toFixed(1)} kg CO₂e` : undefined}
          invertGood
        />
        <KpiCard
          to="/anomalies"
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
          label="Unresolved anomalies"
          primary={anomalies ? `${activeAlerts}` : '—'}
          secondary={anomalies ? `${anomalies.HIGH} HIGH · ${anomalies.MEDIUM} MEDIUM · ${anomalies.LOW} LOW` : undefined}
          invertGood
        />
        <KpiCard
          to="/schedule"
          icon={<Calendar className="h-4 w-4 text-brand-400" />}
          label="Schedule (this week)"
          primary={schedule?.assignments?.length ? `${schedule.assignments.length} shifts` : 'Not generated'}
          secondary={schedule?.total_cost_myr ? `RM ${schedule.total_cost_myr.toFixed(2)} labor · ${schedule.staff_count} staff` : undefined}
        />
      </div>

      {/* ── ESG snapshot ── */}
      {energy && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="h-4 w-4 text-brand-400" />
            <h2 className="text-sm font-medium text-gray-300">ESG Snapshot (7 days)</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">CO₂e Electricity</p>
              <p className="text-lg font-bold text-gray-100 tabular-nums">{energy.electricity.co2e_kg.toFixed(1)} <span className="text-xs font-normal text-gray-500">kg</span></p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Energy Cost</p>
              <p className="text-lg font-bold text-gray-100 tabular-nums">RM {(energy.electricity.cost_myr + energy.water.cost_myr).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Waste Identified</p>
              <p className="text-lg font-bold text-gray-100 tabular-nums">RM {waste?.total_cost_myr.toFixed(2) ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Active alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-medium text-gray-400">Active Anomaly Alerts</h2>
            </div>
            <Link to="/anomalies" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3">
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[a.severity] ?? 'bg-gray-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${SEV_TEXT[a.severity] ?? 'text-gray-400'}`}>{a.severity}</span>
                    <span className="text-xs text-gray-500 capitalize">{a.metric}{a.zone ? ` · ${a.zone.replace(/_/g, ' ')}` : ''}</span>
                    <span className="ml-auto text-xs text-gray-600">{formatDistanceToNow(parseISO(a.ts), { addSuffix: true })}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-300 leading-snug">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Module links ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: '/energy',    label: 'Energy & Water',   Icon: Zap,           color: 'text-yellow-400' },
          { to: '/forecasts', label: 'Forecasts',        Icon: TrendingUp,    color: 'text-brand-400'  },
          { to: '/waste',     label: 'Waste & Savings',  Icon: Trash2,        color: 'text-rose-400'   },
          { to: '/schedule',  label: 'Schedule',         Icon: Calendar,      color: 'text-violet-400' },
        ].map(({ to, label, Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
          >
            <Icon className={`h-4 w-4 ${color}`} />
            {label}
            <ArrowRight className="ml-auto h-3 w-3 opacity-40" />
          </Link>
        ))}
      </div>

    </div>
  )
}
