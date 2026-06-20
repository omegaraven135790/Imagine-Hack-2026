import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Bell, CheckCircle2, Droplets, ShoppingBag, Users, Zap,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { api, AnomalyEvent } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useStoreId } from '@/context/StoreContext'

// ── constants ─────────────────────────────────────────────────────────────────

const METRIC_OPTS = [
  { value: '',             label: 'All Metrics' },
  { value: 'electricity',  label: 'Electricity' },
  { value: 'water',        label: 'Water' },
  { value: 'footfall',     label: 'Footfall' },
  { value: 'sales',        label: 'Sales' },
] as const

const SEV_STYLES = {
  HIGH: {
    card:   'bg-red-950/30 border-red-800/50',
    badge:  'bg-red-900/70 text-red-300',
    sigma:  'text-red-400',
    dot:    'bg-red-500',
  },
  MEDIUM: {
    card:   'bg-amber-950/30 border-amber-800/50',
    badge:  'bg-amber-900/70 text-amber-300',
    sigma:  'text-amber-400',
    dot:    'bg-amber-500',
  },
  LOW: {
    card:   'bg-blue-950/20 border-blue-800/40',
    badge:  'bg-blue-900/70 text-blue-300',
    sigma:  'text-blue-400',
    dot:    'bg-blue-500',
  },
} as const

type Sev = keyof typeof SEV_STYLES

const METRIC_ICON: Record<string, React.ReactNode> = {
  electricity: <Zap      className="h-4 w-4 text-yellow-400" />,
  water:       <Droplets className="h-4 w-4 text-blue-400" />,
  footfall:    <Users    className="h-4 w-4 text-amber-400" />,
  sales:       <ShoppingBag className="h-4 w-4 text-violet-400" />,
}

const METRIC_LABEL: Record<string, string> = {
  electricity: 'Electricity',
  water:       'Water',
  footfall:    'Footfall',
  sales:       'Sales',
}


// ── components ────────────────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: Sev }) {
  const s = SEV_STYLES[severity]
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${s.badge}`}>
      {severity}
    </span>
  )
}

function AnomalyCard({
  event,
  onResolve,
  resolving,
}: {
  event: AnomalyEvent
  onResolve: (id: string) => void
  resolving: boolean
}) {
  const sev     = (event.severity as Sev) in SEV_STYLES ? (event.severity as Sev) : 'LOW'
  const styles  = SEV_STYLES[sev]
  const timeAgo = formatDistanceToNow(parseISO(event.ts), { addSuffix: true })
  const zSign   = event.z_score > 0 ? '+' : ''

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-opacity ${styles.card} ${event.resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {METRIC_ICON[event.metric] ?? <AlertTriangle className="h-4 w-4 text-gray-400" />}
              <span className="text-sm font-semibold text-gray-100">
                {METRIC_LABEL[event.metric] ?? event.metric}
              </span>
              {event.zone && (
                <span className="text-xs text-gray-500">
                  — {event.zone.replace(/_/g, ' ')}
                </span>
              )}
              <SeverityPill severity={sev} />
            </div>
            <p className="text-xs text-gray-500">{timeAgo}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${styles.sigma}`}>
            {zSign}{event.z_score.toFixed(1)}σ
          </span>
          {!event.resolved ? (
            <button
              onClick={() => onResolve(event.id)}
              disabled={resolving}
              className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:border-brand-600 hover:text-brand-400 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              Resolve
            </button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-brand-400">
              <CheckCircle2 className="h-3 w-3" />
              Resolved
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed pl-5">{event.description}</p>
    </div>
  )
}


// ── page ──────────────────────────────────────────────────────────────────────

export default function Anomalies() {
  const storeId = useStoreId()
  const qc      = useQueryClient()
  const [metric,       setMetric]       = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['anomalies', storeId, metric, showResolved],
    queryFn:  () => api.anomalies.list({
      metric:   metric || undefined,
      resolved: showResolved,
    }),
    enabled:   !!storeId,
    staleTime: 30_000,
  })

  const { mutate: resolve, isPending: resolving } = useMutation({
    mutationFn: (id: string) => api.anomalies.resolve(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['anomalies', storeId] })
      toast.success('Anomaly resolved')
    },
    onError: () => toast.error('Failed to resolve anomaly'),
  })

  // Realtime: subscribe to new anomalies for this store
  useEffect(() => {
    if (!storeId) return
    const ch = supabase
      .channel(`anomalies-${storeId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'anomaly_events',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const ev = payload.new as AnomalyEvent
          const label = METRIC_LABEL[ev.metric] ?? ev.metric
          toast.warning(`${ev.severity} anomaly — ${label}${ev.zone ? ` (${ev.zone.replace(/_/g, ' ')})` : ''}`, {
            description: ev.description.slice(0, 100),
          })
          qc.invalidateQueries({ queryKey: ['anomalies', storeId] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [storeId, qc])

  const sevCounts = {
    HIGH:   events.filter((e) => e.severity === 'HIGH').length,
    MEDIUM: events.filter((e) => e.severity === 'MEDIUM').length,
    LOW:    events.filter((e) => e.severity === 'LOW').length,
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Anomaly Feed</h1>
            <p className="text-sm text-gray-400">Detected deviations across all metrics</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {sevCounts.HIGH > 0 && (
            <span className="rounded-full bg-red-900/60 px-2.5 py-0.5 text-xs font-bold text-red-300">
              {sevCounts.HIGH} HIGH
            </span>
          )}
          {sevCounts.MEDIUM > 0 && (
            <span className="rounded-full bg-amber-900/60 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              {sevCounts.MEDIUM} MEDIUM
            </span>
          )}
          {sevCounts.LOW > 0 && (
            <span className="rounded-full bg-blue-900/60 px-2.5 py-0.5 text-xs font-bold text-blue-300">
              {sevCounts.LOW} LOW
            </span>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
          {METRIC_OPTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMetric(opt.value)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                metric === opt.value
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowResolved((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            showResolved
              ? 'border-brand-500/50 bg-brand-900/20 text-brand-300'
              : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300'
          }`}
        >
          {showResolved ? 'Showing Resolved' : 'Show Resolved'}
        </button>
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-brand-400/40" />
          <p className="font-medium text-gray-400">
            No {showResolved ? 'resolved' : 'unresolved'} anomalies
          </p>
          <p className="text-sm text-gray-600">
            {showResolved
              ? 'Resolved anomalies will appear here.'
              : 'All metrics are within normal operating range.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <AnomalyCard
              key={ev.id}
              event={ev}
              onResolve={(id) => resolve(id)}
              resolving={resolving}
            />
          ))}
        </div>
      )}
    </div>
  )
}
