import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { Zap, Droplets, Leaf, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

type Resource = 'electricity' | 'water'

// ── helpers ───────────────────────────────────────────────────────────────────

function Delta({ pct }: { pct: number }) {
  const abs = Math.abs(pct)
  if (abs < 0.1)
    return <span className="flex items-center gap-1 text-gray-500 text-xs"><Minus className="h-3 w-3" /> 0%</span>
  if (pct < 0)
    return <span className="flex items-center gap-1 text-brand-400 text-xs"><TrendingDown className="h-3 w-3" />−{abs.toFixed(1)}%</span>
  return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingUp className="h-3 w-3" />+{abs.toFixed(1)}%</span>
}

function KpiCard({
  icon, label, primary, secondary, delta,
}: {
  icon: React.ReactNode
  label: string
  primary: string
  secondary: string
  delta: number
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {icon}
          {label}
        </div>
        <Delta pct={delta} />
      </div>
      <p className="text-2xl font-bold text-gray-100">{primary}</p>
      <p className="text-xs text-gray-500">{secondary}</p>
    </div>
  )
}

const ZONE_COLORS: Record<string, string> = {
  shop_floor:   '#22c55e',
  storage_room: '#3b82f6',
  office:       '#a78bfa',
  kitchen:      '#f59e0b',
  restroom:     '#64748b',
}

const ZONE_LABELS: Record<string, string> = {
  shop_floor:   'Shop Floor',
  storage_room: 'Storage Room',
  office:       'Office',
  kitchen:      'Kitchen',
  restroom:     'Restroom',
}

const DAY_OPTIONS = [7, 14, 30] as const

const TODAY = new Date().toISOString().split('T')[0]

// ── page ──────────────────────────────────────────────────────────────────────

export default function EnergyWater() {
  const storeId = useStoreId()
  const [resource, setResource] = useState<Resource>('electricity')
  const [days, setDays] = useState<number>(14)
  const [showForecast, setShowForecast] = useState(false)

  const enabled = !!storeId

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['energy-summary', storeId, days],
    queryFn: () => api.energy.summary(days),
    enabled,
    staleTime: 60_000,
  })

  const { data: trend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['energy-trend', resource, days, storeId],
    queryFn: () => api.energy.trend(resource, days),
    enabled,
    staleTime: 60_000,
  })

  const { data: zones = [], isLoading: zonesLoading } = useQuery({
    queryKey: ['energy-zones', resource, days, storeId],
    queryFn: () => api.energy.zones(resource, days),
    enabled,
    staleTime: 60_000,
  })

  const { data: fc } = useQuery({
    queryKey: ['forecast', resource, storeId],
    queryFn:  () => api.forecast.get(resource, 7),
    enabled:  enabled && showForecast,
    staleTime: 30 * 60_000,
  })

  const trendColor = resource === 'electricity' ? '#22c55e' : '#3b82f6'

  const chartData = useMemo(() => {
    if (!showForecast || !fc) return trend.map((p) => ({ date: p.date, value: p.value }))
    const hist = trend.map((p, idx) => ({
      date:  p.date,
      value: p.value,
      ...(idx === trend.length - 1 ? { predicted: p.value, lower: p.value, upper: p.value } : {}),
    }))
    const fcast = fc.points.map((pt) => ({
      date:      pt.ts.split('T')[0],
      predicted: pt.predicted,
      lower:     pt.lower,
      upper:     pt.upper,
    }))
    return [...hist, ...fcast]
  }, [trend, fc, showForecast])

  const e = summary?.electricity
  const w = summary?.water

  return (
    <div className="space-y-6">

      {/* ── Header + shared time selector ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Energy & Water</h1>
            <p className="text-sm text-gray-400">Usage, cost & carbon — period vs prior period</p>
          </div>
        </div>

        {/* Shared time window — controls all three sections */}
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
            icon={<Zap className="h-4 w-4 text-yellow-400" />}
            label="Electricity"
            primary={`${(e?.kwh ?? 0).toLocaleString()} kWh`}
            secondary={`RM ${(e?.cost_myr ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })} · vs prior ${days}d`}
            delta={e?.delta_pct ?? 0}
          />
          <KpiCard
            icon={<Droplets className="h-4 w-4 text-blue-400" />}
            label="Water"
            primary={`${(w?.m3 ?? 0).toLocaleString()} m³`}
            secondary={`RM ${(w?.cost_myr ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })} · vs prior ${days}d`}
            delta={w?.delta_pct ?? 0}
          />
          <KpiCard
            icon={<Leaf className="h-4 w-4 text-brand-400" />}
            label="Carbon Footprint"
            primary={`${(e?.co2e_kg ?? 0).toLocaleString()} kg`}
            secondary={`CO₂ equivalent · electricity only`}
            delta={e?.delta_pct ?? 0}
          />
        </div>
      )}

      {/* ── Trend chart ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Daily Usage Trend</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {(['electricity', 'water'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setResource(r)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  resource === r
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {r === 'electricity' ? 'Electricity' : 'Water'}
              </button>
            ))}
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
        </div>

        {trendLoading ? (
          <div className="h-52 animate-pulse rounded-lg bg-gray-800" />
        ) : trend.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-sm text-gray-500">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), 'd MMM')}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                itemStyle={{ color: '#e5e7eb', fontSize: 12 }}
                labelFormatter={(v) => format(parseISO(v as string), 'EEEE, d MMM yyyy')}
                formatter={(v: number, name: string) => [
                  `${v.toLocaleString()} ${resource === 'electricity' ? 'kWh' : 'm³'}`,
                  name === 'predicted' ? 'Forecast' : 'Actual',
                ]}
              />
              {showForecast && (
                <ReferenceLine
                  x={TODAY}
                  stroke="#374151"
                  strokeDasharray="4 4"
                  label={{ value: 'Today', position: 'top', fill: '#6b7280', fontSize: 10 }}
                />
              )}
              {showForecast && (
                <>
                  <Area type="monotone" dataKey="upper" fill={trendColor} fillOpacity={0.12} stroke="none" legendType="none" isAnimationActive={false} />
                  <Area type="monotone" dataKey="lower" fill="#111827" fillOpacity={1} stroke="none" legendType="none" isAnimationActive={false} />
                  <Line type="monotone" dataKey="predicted" stroke={trendColor} strokeWidth={2} strokeDasharray="6 4" dot={false} opacity={0.85} connectNulls={false} />
                </>
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: trendColor }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Zone breakdown ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-200">
            {resource === 'electricity' ? 'Electricity' : 'Water'} by Zone
          </h2>
          <span className="text-xs text-gray-500">Last {days} days</span>
        </div>

        {zonesLoading ? (
          <div className="h-44 animate-pulse rounded-lg bg-gray-800" />
        ) : zones.length === 0 ? (
          <p className="text-sm text-gray-500">No zone data available</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={zones} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="zone"
                  tickFormatter={(v) => ZONE_LABELS[v] ?? v}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={84}
                />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  itemStyle={{ color: '#e5e7eb', fontSize: 12 }}
                  formatter={(v: number) => [
                    `${v.toLocaleString()} ${resource === 'electricity' ? 'kWh' : 'm³'}`,
                    'Usage',
                  ]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {zones.map((z) => (
                    <Cell key={z.zone} fill={ZONE_COLORS[z.zone] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="space-y-2.5">
              {zones.map((z) => (
                <div key={z.zone} className="flex items-center gap-3">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: ZONE_COLORS[z.zone] ?? '#6b7280' }}
                  />
                  <span className="flex-1 text-sm text-gray-300">{ZONE_LABELS[z.zone] ?? z.zone}</span>
                  <span className="text-sm font-medium text-gray-100">
                    {z.value.toLocaleString()} {resource === 'electricity' ? 'kWh' : 'm³'}
                  </span>
                  <span className="w-20 text-right text-xs text-gray-500">RM {z.cost_myr.toFixed(2)}</span>
                  <span className="w-10 text-right text-xs text-gray-600">{z.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
