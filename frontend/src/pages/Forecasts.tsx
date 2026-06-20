import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, Zap, Droplets, Users, ShoppingBag, Cpu } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

// ── Metric config ─────────────────────────────────────────────────────────────

type ForecastMetric = 'electricity' | 'water' | 'footfall' | 'sales'

const METRIC_CFG: Record<ForecastMetric, {
  label: string
  unit: string
  color: string
  icon: React.ReactNode
  fmt: (v: number) => string
}> = {
  electricity: {
    label: 'Electricity',
    unit:  'kWh',
    color: '#22c55e',
    icon:  <Zap className="h-4 w-4 text-yellow-400" />,
    fmt:   (v) => `${v.toLocaleString()} kWh`,
  },
  water: {
    label: 'Water',
    unit:  'm³',
    color: '#3b82f6',
    icon:  <Droplets className="h-4 w-4 text-blue-400" />,
    fmt:   (v) => `${v.toLocaleString()} m³`,
  },
  footfall: {
    label: 'Footfall',
    unit:  'visitors',
    color: '#a78bfa',
    icon:  <Users className="h-4 w-4 text-violet-400" />,
    fmt:   (v) => `${Math.round(v).toLocaleString()} visitors`,
  },
  sales: {
    label: 'Sales Revenue',
    unit:  'RM',
    color: '#f59e0b',
    icon:  <ShoppingBag className="h-4 w-4 text-yellow-500" />,
    fmt:   (v) => `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
  },
}

const MODEL_LABELS: Record<string, string> = {
  holt_winters:   'Holt-Winters',
  seasonal_naive: 'Seasonal Naive',
  linear:         'Linear Trend',
}

const METRICS: ForecastMetric[] = ['electricity', 'water', 'footfall', 'sales']

const TODAY = new Date().toISOString().split('T')[0]

const HORIZON_OPTIONS = [
  { label: '7 Days',   value: 7   },
  { label: '1 Month',  value: 30  },
  { label: '6 Months', value: 180 },
  { label: '1 Year',   value: 365 },
] as const

type HorizonValue = typeof HORIZON_OPTIONS[number]['value']

// Scale how much history to show alongside the forecast
function histDaysFor(horizon: number): number {
  if (horizon <= 7)   return 30
  if (horizon <= 30)  return 60
  return 90   // 90d is all we have seeded; still gives meaningful context
}

// Tick formatter adapts to the data density on screen
function dateTick(horizon: number) {
  return (v: string) => {
    if (horizon <= 30)  return format(parseISO(v), 'd MMM')
    if (horizon <= 180) return format(parseISO(v), 'MMM')
    return format(parseISO(v), 'MMM yy')
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ForecastTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  fmt: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const isForecast = payload.some((p) => p.name === 'predicted')
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs space-y-1.5 shadow-xl">
      <p className="text-gray-400 font-medium">
        {label ? format(parseISO(label), 'EEEE, d MMM yyyy') : ''}
        {isForecast && <span className="ml-2 text-violet-400">forecast</span>}
      </p>
      {payload.map((p) => {
        if (p.name === 'upper' || p.name === 'lower') return null
        return (
          <p key={p.name} style={{ color: p.color }}>
            {p.name === 'historical' ? 'Actual' : 'Predicted'}: {fmt(p.value)}
          </p>
        )
      })}
      {isForecast && (() => {
        const u = payload.find((p) => p.name === 'upper')
        const l = payload.find((p) => p.name === 'lower')
        if (u && l) return (
          <p className="text-gray-500">
            Range: {fmt(l.value)} – {fmt(u.value)}
          </p>
        )
        return null
      })()}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Forecasts() {
  const storeId = useStoreId()
  const [metric, setMetric]   = useState<ForecastMetric>('footfall')
  const [horizon, setHorizon] = useState<HorizonValue>(7)
  const enabled  = !!storeId
  const cfg      = METRIC_CFG[metric]
  const isEnergy = metric === 'electricity' || metric === 'water'
  const histDays = histDaysFor(horizon)

  // ── Historical data ──
  const { data: energyTrend = [], isLoading: energyLoading } = useQuery({
    queryKey: ['energy-trend', metric, storeId, histDays],
    queryFn:  () => api.energy.trend(metric as 'electricity' | 'water', histDays),
    enabled:  enabled && isEnergy,
    staleTime: 60_000,
  })

  const { data: footfallTrend = [], isLoading: ffLoading } = useQuery({
    queryKey: ['footfall-trend', storeId, histDays],
    queryFn:  () => api.footfall.trend(histDays),
    enabled:  enabled && !isEnergy,
    staleTime: 60_000,
  })

  // ── Forecast ──
  const { data: fc, isLoading: fcLoading } = useQuery({
    queryKey: ['forecast', metric, horizon, storeId],
    queryFn:  () => api.forecast.get(metric, horizon),
    enabled,
    staleTime: 30 * 60_000,
  })

  const histLoading = isEnergy ? energyLoading : ffLoading

  // ── Merge historical + forecast into one chart array ──
  const chartData = useMemo(() => {
    const hist: Array<{ date: string; historical: number }> = isEnergy
      ? energyTrend.map((p) => ({ date: p.date, historical: p.value }))
      : footfallTrend.map((p) => ({
          date:       p.date,
          historical: metric === 'footfall' ? p.footfall : p.revenue_myr,
        }))

    const fcPoints = fc?.points ?? []

    const merged: Array<{
      date: string
      historical?: number
      predicted?: number
      lower?: number
      upper?: number
    }> = hist.map((p, idx) => {
      if (idx === hist.length - 1 && fcPoints.length > 0) {
        // last historical point also seeds the forecast line for smooth join
        return { ...p, predicted: p.historical, lower: p.historical, upper: p.historical }
      }
      return p
    })

    for (const pt of fcPoints) {
      merged.push({
        date:      pt.ts.split('T')[0],
        predicted: pt.predicted,
        lower:     pt.lower,
        upper:     pt.upper,
      })
    }

    return merged
  }, [isEnergy, energyTrend, footfallTrend, fc, metric])

  // ── Next-week summary stats ──
  const fcPoints  = fc?.points ?? []
  const fcTotal   = fcPoints.reduce((s, p) => s + p.predicted, 0)
  const fcAvgDay  = fcPoints.length > 0 ? fcTotal / fcPoints.length : 0

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Forecasts</h1>
          <p className="text-sm text-gray-400">7-day predictions with confidence bands</p>
        </div>
      </div>

      {/* ── Metric selector tabs ── */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => {
          const c = METRIC_CFG[m]
          return (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                metric === m
                  ? 'border-brand-500/50 bg-brand-900/20 text-brand-300'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              {c.icon}
              {c.label}
            </button>
          )
        })}
      </div>

      {/* ── Chart card ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">

        {/* Chart header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-200">
              {cfg.label} — Last {histDays}d history + next {
                HORIZON_OPTIONS.find((o) => o.value === horizon)?.label ?? `${horizon}d`
              }
            </h2>
            <p className="text-xs text-gray-500">
              Dashed line = forecast · Shaded area = confidence band
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Horizon selector */}
            <div className="flex items-center gap-0.5 rounded-lg border border-gray-700 bg-gray-950 p-0.5">
              {HORIZON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHorizon(opt.value)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    horizon === opt.value
                      ? 'bg-gray-700 text-gray-100'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Model badge */}
            {fc && (
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
                fc.model === 'holt_winters'
                  ? 'border-brand-500/30 bg-brand-900/20 text-brand-400'
                  : fc.model === 'seasonal_naive'
                  ? 'border-blue-500/30 bg-blue-900/20 text-blue-400'
                  : 'border-gray-600 bg-gray-800 text-gray-400'
              }`}>
                {MODEL_LABELS[fc.model] ?? fc.model}
              </span>
            )}
          </div>
        </div>

        {/* Chart */}
        {histLoading || fcLoading ? (
          <div className="h-72 animate-pulse rounded-lg bg-gray-800" />
        ) : chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tickFormatter={dateTick(horizon)}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  metric === 'sales'
                    ? `RM${(v / 1000).toFixed(0)}k`
                    : v.toLocaleString()
                }
              />
              <Tooltip
                content={<ForecastTooltip fmt={cfg.fmt} />}
              />

              {/* Today reference line */}
              <ReferenceLine
                x={TODAY}
                stroke="#374151"
                strokeDasharray="4 4"
                label={{ value: 'Today', position: 'top', fill: '#6b7280', fontSize: 10 }}
              />

              {/* Confidence band — paint upper area then erase below lower */}
              <Area
                type="monotone"
                dataKey="upper"
                fill={cfg.color}
                fillOpacity={0.12}
                stroke="none"
                legendType="none"
                name="upper"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                fill="#111827"
                fillOpacity={1}
                stroke="none"
                legendType="none"
                name="lower"
                isAnimationActive={false}
              />

              {/* Historical line (solid) */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke={cfg.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: cfg.color }}
                name="historical"
                connectNulls={false}
              />

              {/* Forecast line (dashed) */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke={cfg.color}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, fill: cfg.color }}
                name="predicted"
                connectNulls={false}
                opacity={0.85}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Next-week stats + model explanation ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {HORIZON_OPTIONS.find((o) => o.value === horizon)?.label ?? `${horizon}d`} Total (predicted)
          </p>
          <p className="text-2xl font-bold text-gray-100">
            {fcLoading ? '—' : cfg.fmt(fcTotal)}
          </p>
          <p className="text-xs text-gray-500">sum of forecast horizon</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Daily Average (predicted)</p>
          <p className="text-2xl font-bold text-gray-100">
            {fcLoading ? '—' : cfg.fmt(fcAvgDay)}
          </p>
          <p className="text-xs text-gray-500">
            mean over {HORIZON_OPTIONS.find((o) => o.value === horizon)?.label?.toLowerCase() ?? `${horizon}d`}
          </p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide">
            <Cpu className="h-3.5 w-3.5" />
            Model
          </div>
          <p className="text-lg font-bold text-gray-100">
            {fcLoading ? '—' : (MODEL_LABELS[fc?.model ?? ''] ?? '—')}
          </p>
          <p className="text-xs text-gray-500">
            {fc?.model === 'holt_winters'
              ? 'ETS with trend + weekly seasonality'
              : fc?.model === 'seasonal_naive'
              ? 'Same weekday last week ± 15%'
              : fc?.model === 'linear'
              ? 'Linear trend extrapolation ± 20%'
              : 'Detecting best model...'}
          </p>
        </div>

      </div>

      {/* ── All-metric snapshot ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-200">7-Day Outlook — All Metrics</h2>
        <p className="text-xs text-gray-500">Click a metric above for the full chart</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="rounded-lg border border-gray-800 bg-gray-800/40 p-4 text-left transition-colors hover:border-gray-600 hover:bg-gray-800/70"
            >
              <div className="flex items-center gap-2 mb-2">{METRIC_CFG[m].icon}
                <span className="text-xs text-gray-400">{METRIC_CFG[m].label}</span>
              </div>
              <p className="text-sm font-semibold text-gray-200">Next 7 days</p>
              <p className="text-xs text-gray-500 mt-1">unit: {METRIC_CFG[m].unit}</p>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
