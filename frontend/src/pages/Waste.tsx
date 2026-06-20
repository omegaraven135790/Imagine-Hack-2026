import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive, Droplets, Leaf, PackageX, TrendingDown, Users, Zap,
} from 'lucide-react'
import { api, WasteEvent } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

// ── constants ─────────────────────────────────────────────────────────────────

type Category = WasteEvent['category'] | ''

const CAT_OPTS: { value: Category; label: string }[] = [
  { value: '',               label: 'All' },
  { value: 'energy_idle',    label: 'Energy Idle' },
  { value: 'water_leak',     label: 'Water Leak' },
  { value: 'stock_spoilage', label: 'Stock Spoilage' },
  { value: 'overstock',      label: 'Overstock' },
]

const CAT_META: Record<
  string,
  { label: string; icon: React.ElementType; card: string; badge: string; iconCls: string }
> = {
  energy_idle: {
    label:   'Energy Idle',
    icon:    Zap,
    card:    'bg-amber-950/30 border-amber-800/50',
    badge:   'bg-amber-900/70 text-amber-300',
    iconCls: 'text-yellow-400',
  },
  water_leak: {
    label:   'Water Leak',
    icon:    Droplets,
    card:    'bg-blue-950/20 border-blue-800/40',
    badge:   'bg-blue-900/70 text-blue-300',
    iconCls: 'text-blue-400',
  },
  stock_spoilage: {
    label:   'Stock Spoilage',
    icon:    PackageX,
    card:    'bg-red-950/30 border-red-800/50',
    badge:   'bg-red-900/70 text-red-300',
    iconCls: 'text-red-400',
  },
  overstock: {
    label:   'Overstock',
    icon:    Archive,
    card:    'bg-violet-950/30 border-violet-800/50',
    badge:   'bg-violet-900/70 text-violet-300',
    iconCls: 'text-violet-400',
  },
  overstaffing: {
    label:   'Overstaffing',
    icon:    Users,
    card:    'bg-teal-950/30 border-teal-800/40',
    badge:   'bg-teal-900/70 text-teal-300',
    iconCls: 'text-teal-400',
  },
}

const DEFAULT_META = {
  label:   'Waste',
  icon:    TrendingDown,
  card:    'bg-gray-900 border-gray-700',
  badge:   'bg-gray-800 text-gray-300',
  iconCls: 'text-gray-400',
}


// ── components ────────────────────────────────────────────────────────────────

function WasteCard({ event }: { event: WasteEvent }) {
  const meta    = CAT_META[event.category] ?? DEFAULT_META
  const Icon    = meta.icon
  const zoneLbl = event.zone?.replace(/_/g, ' ')

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${meta.card}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${meta.iconCls}`} />
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${meta.badge}`}>
                {meta.label}
              </span>
              {zoneLbl && (
                <span className="text-xs text-gray-500 capitalize">{zoneLbl}</span>
              )}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{event.description}</p>
          </div>
        </div>

        <div className="shrink-0 text-right space-y-0.5">
          <p className="text-lg font-bold tabular-nums text-gray-100">
            RM {event.cost_myr.toFixed(2)}
          </p>
          {event.co2e_kg != null && event.co2e_kg > 0 && (
            <p className="flex items-center justify-end gap-1 text-xs text-green-400">
              <Leaf className="h-3 w-3" />
              {event.co2e_kg.toFixed(1)} kg CO₂e
            </p>
          )}
        </div>
      </div>

      <div className="ml-8 rounded-lg border border-gray-700/50 bg-gray-900/40 px-3 py-2">
        <p className="text-xs font-medium text-brand-400 mb-0.5">Recommended action</p>
        <p className="text-xs text-gray-400 leading-relaxed">{event.action}</p>
      </div>
    </div>
  )
}


// ── page ──────────────────────────────────────────────────────────────────────

export default function Waste() {
  const storeId  = useStoreId()
  const [category, setCategory] = useState<Category>('')

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['waste', storeId],
    queryFn:  () => api.waste.list(),
    enabled:  !!storeId,
    staleTime: 60_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['waste-summary', storeId],
    queryFn:  () => api.waste.summary(),
    enabled:  !!storeId,
    staleTime: 60_000,
  })

  const filtered = category ? events.filter((e) => e.category === category) : events

  const catCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Waste & Savings</h1>
            <p className="text-sm text-gray-400">
              Identified waste ranked by cost — with actionable recommendations
            </p>
          </div>
        </div>

        {summary && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Total identified waste</p>
            <p className="text-2xl font-bold text-gray-100 tabular-nums">
              RM {summary.total_cost_myr.toFixed(2)}
            </p>
            {summary.total_co2e_kg > 0 && (
              <p className="flex items-center justify-end gap-1 text-xs text-green-400 mt-0.5">
                <Leaf className="h-3 w-3" />
                {summary.total_co2e_kg.toFixed(1)} kg CO₂e avoidable
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Summary tiles ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(summary.categories).map(([cat, info]) => {
            const meta = CAT_META[cat] ?? DEFAULT_META
            const Icon = meta.icon
            return (
              <button
                key={cat}
                onClick={() => setCategory(category === cat ? '' : (cat as Category))}
                className={`rounded-xl border p-3 text-left transition-all ${
                  category === cat
                    ? meta.card + ' ring-1 ring-inset ring-white/10'
                    : 'border-gray-700/50 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${meta.iconCls}`} />
                  <span className="text-xs text-gray-400">{meta.label}</span>
                </div>
                <p className="text-base font-bold text-gray-100 tabular-nums">
                  RM {info.cost_myr.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">{info.count} event{info.count !== 1 ? 's' : ''}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Category filter tabs ── */}
      <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1 w-fit">
        {CAT_OPTS.filter((o) => o.value === '' || catCounts[o.value]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setCategory(opt.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              category === opt.value
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {opt.label}
            {opt.value && catCounts[opt.value] ? (
              <span className="ml-1.5 text-xs opacity-60">{catCounts[opt.value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Event list ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <TrendingDown className="h-10 w-10 text-brand-400/30" />
          <p className="font-medium text-gray-400">No waste events in this category</p>
          <p className="text-sm text-gray-600">Select a different filter to see events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev, i) => (
            <WasteCard key={`${ev.category}-${ev.zone}-${i}`} event={ev} />
          ))}
        </div>
      )}
    </div>
  )
}
