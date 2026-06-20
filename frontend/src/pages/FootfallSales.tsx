import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import {
  Users, ShoppingBag, ArrowRightLeft,
  TrendingUp, TrendingDown, Minus, Flame, Sparkles,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'
import type { HeatmapCell } from '@/lib/api'

// ── helpers ───────────────────────────────────────────────────────────────────

function Delta({ pct, suffix = '%' }: { pct: number; suffix?: string }) {
  const abs = Math.abs(pct)
  if (abs < 0.1)
    return <span className="flex items-center gap-1 text-gray-500 text-xs"><Minus className="h-3 w-3" /> 0{suffix}</span>
  if (pct < 0)
    return <span className="flex items-center gap-1 text-brand-400 text-xs"><TrendingDown className="h-3 w-3" />−{abs.toFixed(1)}{suffix}</span>
  return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingUp className="h-3 w-3" />+{abs.toFixed(1)}{suffix}</span>
}

function KpiCard({
  icon, label, primary, secondary, delta, deltaLabel = 'vs prior period', deltaSuffix = '%',
}: {
  icon: React.ReactNode
  label: string
  primary: string
  secondary: string
  delta: number
  deltaLabel?: string
  deltaSuffix?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {icon}
          {label}
        </div>
        <Delta pct={delta} suffix={deltaSuffix} />
      </div>
      <p className="text-2xl font-bold text-gray-100">{primary}</p>
      <p className="text-xs text-gray-500">{secondary} · {deltaLabel}</p>
    </div>
  )
}

// ── heatmap helpers ───────────────────────────────────────────────────────────

const DOW_LABELS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS_SHOWN = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

function buildHeatmapGrid(cells: HeatmapCell[]) {
  const map: Record<string, number> = {}
  for (const c of cells) map[`${c.dow}-${c.hour}`] = c.avg_count
  const max = Math.max(...cells.map((c) => c.avg_count), 1)
  return { map, max }
}

function heatmapColor(value: number, max: number): string {
  const intensity = value / max
  if (intensity <= 0) return '#111827'
  // interpolate gray → brand green
  const r = Math.round(17  + (34  - 17)  * intensity)
  const g = Math.round(24  + (197 - 24)  * intensity)
  const b = Math.round(39  + (94  - 39)  * intensity)
  return `rgb(${r},${g},${b})`
}

const DAY_OPTIONS = [7, 14, 30] as const

const TODAY = new Date().toISOString().split('T')[0]

// ── page ──────────────────────────────────────────────────────────────────────

export default function FootfallSales() {
  const storeId = useStoreId()
  const [days, setDays] = useState<number>(14)
  const [showForecast, setShowForecast] = useState(false)
  const enabled = !!storeId

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['footfall-summary', storeId, days],
    queryFn:  () => api.footfall.summary(days),
    enabled,
    staleTime: 60_000,
  })

  const { data: trend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['footfall-trend', storeId, days],
    queryFn:  () => api.footfall.trend(days),
    enabled,
    staleTime: 60_000,
  })

  // Heatmap uses a longer window (28d) for stable averages — fixed
  const { data: heatmapCells = [], isLoading: heatLoading } = useQuery({
    queryKey: ['footfall-heatmap', storeId],
    queryFn:  () => api.footfall.heatmap(28),
    enabled,
    staleTime: 5 * 60_000,
  })

  const { data: peaks = [], isLoading: peaksLoading } = useQuery({
    queryKey: ['footfall-peaks', storeId],
    queryFn:  () => api.footfall.peaks(28, 5),
    enabled,
    staleTime: 5 * 60_000,
  })

  const { data: fcFootfall } = useQuery({
    queryKey: ['forecast', 'footfall', storeId],
    queryFn:  () => api.forecast.get('footfall', 7),
    enabled:  enabled && showForecast,
    staleTime: 30 * 60_000,
  })

  const trendData = useMemo(() => {
    if (!showForecast || !fcFootfall) return trend
    const hist = trend.map((p, idx) => ({
      ...p,
      ...(idx === trend.length - 1
        ? { predicted_footfall: p.footfall, fc_lower: p.footfall, fc_upper: p.footfall }
        : {}),
    }))
    const fcast = fcFootfall.points.map((pt) => ({
      date:               pt.ts.split('T')[0],
      footfall:           undefined as number | undefined,
      revenue_myr:        undefined as number | undefined,
      transactions:       undefined as number | undefined,
      conversion_pct:     undefined as number | undefined,
      predicted_footfall: pt.predicted,
      fc_lower:           pt.lower,
      fc_upper:           pt.upper,
    }))
    return [...hist, ...fcast]
  }, [trend, fcFootfall, showForecast])

  const ff   = summary?.footfall
  const sale = summary?.sales
  const conv = summary?.conversion

  const { map: heatMap, max: heatMax } = buildHeatmapGrid(heatmapCells)

  return (
    <div className="space-y-6">

      {/* ── Header + time selector ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Footfall & Sales</h1>
            <p className="text-sm text-gray-400">Visitor traffic, revenue & conversion</p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      {sumLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            icon={<Users className="h-4 w-4 text-blue-400" />}
            label="Footfall"
            primary={(ff?.total ?? 0).toLocaleString()}
            secondary={`${(ff?.avg_daily ?? 0).toLocaleString()} visitors/day`}
            delta={ff?.delta_pct ?? 0}
          />
          <KpiCard
            icon={<ShoppingBag className="h-4 w-4 text-yellow-400" />}
            label="Sales Revenue"
            primary={`RM ${(sale?.revenue_myr ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`}
            secondary={`${(sale?.transactions ?? 0).toLocaleString()} transactions · avg RM ${(sale?.avg_transaction_myr ?? 0).toFixed(2)}`}
            delta={sale?.delta_pct ?? 0}
          />
          <KpiCard
            icon={<ArrowRightLeft className="h-4 w-4 text-brand-400" />}
            label="Conversion Rate"
            primary={`${(conv?.rate_pct ?? 0).toFixed(1)}%`}
            secondary="visitors who made a purchase"
            delta={conv?.delta_pp ?? 0}
            deltaLabel="vs prior period"
            deltaSuffix=" pp"
          />
        </div>
      )}

      {/* ── Footfall vs Sales trend (dual axis) ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Daily Footfall vs Revenue</h2>
          <button
            onClick={() => setShowForecast((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              showForecast
                ? 'border-brand-500/50 bg-brand-900/20 text-brand-300'
                : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Forecast
          </button>
        </div>

        {trendLoading ? (
          <div className="h-56 animate-pulse rounded-lg bg-gray-800" />
        ) : trend.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-gray-500">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={trendData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), 'd MMM')}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                label={{ value: 'Visitors', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10, dy: 40 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) => `RM${(v / 1000).toFixed(0)}k`}
                label={{ value: 'Revenue', angle: 90, position: 'insideRight', fill: '#4b5563', fontSize: 10, dy: -30 }}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
                labelFormatter={(v) => format(parseISO(v as string), 'EEEE, d MMM yyyy')}
                formatter={(v: number, name: string) => {
                  if (name === 'footfall') return [`${v.toLocaleString()} visitors`, 'Footfall']
                  if (name === 'revenue_myr') return [`RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`, 'Revenue']
                  return [v, name]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }}
                formatter={(value) => value === 'footfall' ? 'Footfall' : 'Revenue (RM)'}
              />
              {showForecast && (
                <ReferenceLine
                  x={TODAY}
                  stroke="#374151"
                  strokeDasharray="4 4"
                  yAxisId="left"
                  label={{ value: 'Today', position: 'top', fill: '#6b7280', fontSize: 10 }}
                />
              )}
              {showForecast && (
                <>
                  <Area yAxisId="left" type="monotone" dataKey="fc_upper" fill="#a78bfa" fillOpacity={0.12} stroke="none" legendType="none" isAnimationActive={false} />
                  <Area yAxisId="left" type="monotone" dataKey="fc_lower" fill="#111827" fillOpacity={1} stroke="none" legendType="none" isAnimationActive={false} />
                  <Line yAxisId="left" type="monotone" dataKey="predicted_footfall" stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 4" dot={false} opacity={0.85} connectNulls={false} />
                </>
              )}
              <Bar
                yAxisId="left"
                dataKey="footfall"
                fill="#3b82f6"
                fillOpacity={0.7}
                radius={[2, 2, 0, 0]}
                maxBarSize={24}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue_myr"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#22c55e' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Heatmap + Peak hours ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Busyness heatmap — takes 2/3 width on large screens */}
        <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Busyness Heatmap</h2>
            <span className="text-xs text-gray-500">avg visitors/hr · last 28 days</span>
          </div>

          {heatLoading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-800" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[420px]">
                {/* Day headers */}
                <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-0.5 mb-1">
                  <div />
                  {DOW_LABELS.map((d) => (
                    <div key={d} className="text-center text-xs text-gray-500 pb-1">{d}</div>
                  ))}
                </div>

                {/* Hour rows */}
                {HOURS_SHOWN.map((hour) => (
                  <div key={hour} className="grid grid-cols-[40px_repeat(7,1fr)] gap-0.5 mb-0.5">
                    <div className="text-right pr-2 text-xs text-gray-600 leading-5">
                      {hour === 12 ? '12pm' : hour < 12 ? `${hour}am` : `${hour - 12}pm`}
                    </div>
                    {DOW_LABELS.map((_, dow) => {
                      const val = heatMap[`${dow}-${hour}`] ?? 0
                      return (
                        <div
                          key={dow}
                          title={`${DOW_LABELS[dow]} ${hour}:00 — avg ${val.toFixed(0)} visitors`}
                          className="rounded-sm h-5"
                          style={{ background: heatmapColor(val, heatMax) }}
                        />
                      )
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div className="flex items-center gap-2 mt-3 justify-end">
                  <span className="text-xs text-gray-600">Low</span>
                  <div className="flex gap-0.5">
                    {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => (
                      <div
                        key={t}
                        className="h-3 w-5 rounded-sm"
                        style={{ background: heatmapColor(t * heatMax, heatMax) }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-600">High</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Peak hours — 1/3 width */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-gray-200">Peak Hours</h2>
          </div>
          <p className="text-xs text-gray-500">Top slots by average footfall (last 28 days)</p>

          {peaksLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
              ))}
            </div>
          ) : peaks.length === 0 ? (
            <p className="text-sm text-gray-500">No data available</p>
          ) : (
            <ol className="space-y-2.5">
              {peaks.map((p, i) => (
                <li key={`${p.dow}-${p.hour}`} className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                      i === 0
                        ? 'bg-orange-500 text-white'
                        : i === 1
                        ? 'bg-orange-400/60 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-300">{p.label}</span>
                  <span className="text-sm font-medium text-gray-100 tabular-nums">
                    {p.avg_count.toFixed(0)}
                    <span className="text-xs text-gray-500 ml-1">avg</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Conversion mini-summary */}
          {!sumLoading && conv && (
            <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Conversion</p>
              <p className="text-lg font-bold text-gray-100">{conv.rate_pct.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">
                {(sale?.transactions ?? 0).toLocaleString()} of {(ff?.total ?? 0).toLocaleString()} visitors bought
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
