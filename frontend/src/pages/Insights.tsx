import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Leaf, Zap, Droplets, Users, DollarSign, Package, AlertTriangle, Trash2,
  TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles, Target,
  FileSpreadsheet, FileText,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'
import { downloadXlsx, downloadDocx, type ExportData } from '@/lib/insights-export'

const CO2_FACTOR = 0.585
const CHART_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444']

function fmtRM(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Delta({ pct, invertGood = false }: { pct: number; invertGood?: boolean }) {
  const abs = Math.abs(pct)
  if (abs < 0.1) return <span className="flex items-center gap-1 text-xs text-gray-500"><Minus className="h-3 w-3" />Flat</span>
  const isGood = invertGood ? pct < 0 : pct > 0
  const Icon = pct < 0 ? TrendingDown : TrendingUp
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon className="h-3 w-3" />{pct < 0 ? '−' : '+'}{abs.toFixed(1)}%
    </span>
  )
}

function HeadlineTile({ icon, label, value, sub, delta, invertGood }: {
  icon: React.ReactNode; label: string; value: string; sub: string; delta?: number; invertGood?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        {delta !== undefined && <Delta pct={delta} invertGood={invertGood} />}
      </div>
      <p className="mt-2 text-xl font-semibold text-gray-100 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

function ActionList({ title, to, rows, empty }: {
  title: string; to: string; rows: { left: string; right: string }[]; empty: string
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-200">{title}</p>
        <Link to={to} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate capitalize text-gray-300">{r.left}</span>
              <span className="shrink-0 font-medium text-gray-100">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Insights() {
  const storeId = useStoreId()
  const [days, setDays] = useState(7)
  const enabled = !!storeId

  const { data: energy }    = useQuery({ queryKey: ['energy-summary', storeId, days],    queryFn: () => api.energy.summary(days),          enabled, staleTime: 60_000 })
  const { data: footfall }  = useQuery({ queryKey: ['footfall-summary', storeId, days],  queryFn: () => api.footfall.summary(days),        enabled, staleTime: 60_000 })
  const { data: waste }     = useQuery({ queryKey: ['waste-summary', storeId],           queryFn: () => api.waste.summary(),              enabled, staleTime: 60_000 })
  const { data: inventory } = useQuery({ queryKey: ['inventory-summary', storeId],       queryFn: () => api.inventory.summary(),           enabled, staleTime: 60_000 })
  const { data: anomalyList = [] } = useQuery({
    queryKey: ['anomalies-insights', storeId],
    queryFn:  () => api.anomalies.list({ resolved: false, limit: 50 }),
    enabled,  staleTime: 30_000,
  })
  const { data: elecTrend = [] } = useQuery({ queryKey: ['elec-trend', storeId, days],  queryFn: () => api.energy.trend('electricity', days), enabled, staleTime: 120_000 })
  const { data: waterTrend = [] } = useQuery({ queryKey: ['water-trend', storeId, days], queryFn: () => api.energy.trend('water', days),      enabled, staleTime: 120_000 })
  const { data: footTrend = [] } = useQuery({ queryKey: ['foot-trend', storeId, days],  queryFn: () => api.footfall.trend(days),            enabled, staleTime: 120_000 })
  const { data: zones = [] }    = useQuery({ queryKey: ['zones', storeId, days],         queryFn: () => api.energy.zones('electricity', days), enabled, staleTime: 120_000 })
  const { data: spoilage }      = useQuery({ queryKey: ['spoilage', storeId],             queryFn: () => api.inventory.spoilage(30),          enabled, staleTime: 300_000 })
  const { data: peaks = [] }    = useQuery({ queryKey: ['peaks', storeId],                queryFn: () => api.footfall.peaks(28, 5),           enabled, staleTime: 300_000 })

  const co2e        = energy?.electricity.co2e_kg ?? 0
  const totalCost   = (energy?.electricity.cost_myr ?? 0) + (energy?.water.cost_myr ?? 0)
  const grossMargin = (footfall?.sales.revenue_myr ?? 0) - totalCost - (waste?.total_cost_myr ?? 0)
  const highAlerts  = anomalyList.filter(a => a.severity === 'HIGH').length
  const trees       = (co2e / 21).toFixed(1)

  const trend = useMemo(() => {
    return elecTrend.map((e, i) => ({
      date: format(parseISO(e.date), 'MM/dd'),
      elec: +e.value.toFixed(1),
      water: +(waterTrend[i]?.value ?? 0).toFixed(1),
      foot: footTrend[i]?.footfall ?? 0,
    }))
  }, [elecTrend, waterTrend, footTrend])

  const zoneData = zones.map(z => ({
    label: z.zone.replace(/_/g, ' '),
    value: +z.value.toFixed(1),
  }))

  async function handleExport(type: 'xlsx' | 'docx') {
    if (!energy || !footfall || !waste || !inventory) return
    const data: ExportData = {
      days,
      storeName: 'The Grand Bazaar',
      energy: {
        electricity: energy.electricity,
        water: { m3: energy.water.m3, cost_myr: energy.water.cost_myr, delta_pct: energy.water.delta_pct },
      },
      footfall: {
        footfall: footfall.footfall,
        sales: { revenue_myr: footfall.sales.revenue_myr, transactions: footfall.sales.transactions, delta_pct: footfall.sales.delta_pct },
        conversion: footfall.conversion,
      },
      waste: {
        total_cost_myr: waste.total_cost_myr,
        total_co2e_kg: waste.total_co2e_kg,
        events_count: waste.events_count,
        categories: waste.categories,
      },
      inventory,
      anomalies: anomalyList.map(a => ({
        metric: a.metric, zone: a.zone, severity: a.severity,
        z_score: a.z_score, value: a.value, description: a.description, ts: a.ts,
      })),
      elecTrend: elecTrend.map(e => ({ date: e.date, value: e.value, cost_myr: e.cost_myr, co2e_kg: e.co2e_kg ?? e.value * CO2_FACTOR })),
      waterTrend: waterTrend.map(w => ({ date: w.date, value: w.value, cost_myr: w.cost_myr })),
      footTrend: footTrend.map(f => ({ date: f.date, footfall: f.footfall, revenue_myr: f.revenue_myr, transactions: f.transactions, conversion_pct: f.conversion_pct })),
      zones: zones.map(z => ({ zone: z.zone, value: z.value, cost_myr: z.cost_myr, pct: z.pct })),
      spoilage: (spoilage?.items ?? []).map(s => ({ name: s.name, sku: s.sku, spoiled_qty: s.spoiled_qty, spoilage_cost_myr: s.spoilage_cost_myr })),
      peaks,
    }
    if (type === 'xlsx') downloadXlsx(data)
    else await downloadDocx(data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Insights</h1>
            <p className="text-sm text-gray-400">The Grand Bazaar · last {days} days vs prior {days} days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!energy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 hover:border-emerald-600/60 hover:text-emerald-400 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Excel
          </button>
          <button
            onClick={() => handleExport('docx')}
            disabled={!energy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 hover:border-blue-600/60 hover:text-blue-400 disabled:opacity-40"
          >
            <FileText className="h-4 w-4 text-blue-400" /> Word
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${d === days ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CO2 hero + headline tiles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/40 via-emerald-950/10 to-transparent p-6">
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
            <Leaf className="h-4 w-4" /> Total CO₂ Emissions
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <p className="text-4xl font-semibold text-gray-100 tabular-nums">{co2e.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-sm text-gray-400">kg CO₂e</p>
            {energy && <Delta pct={energy.electricity.delta_pct} invertGood />}
          </div>
          <p className="mt-2 text-xs text-gray-500">grid factor {CO2_FACTOR} kg/kWh · {trees} 🌳 to offset/yr</p>
          {waste && waste.total_co2e_kg > 0 && (
            <div className="mt-4 rounded-lg border border-emerald-800/30 bg-gray-900/60 px-3 py-2 text-xs">
              <span className="font-medium text-emerald-400">{waste.total_co2e_kg} kg</span>{' '}
              <span className="text-gray-500">avoidable by fixing flagged waste.</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeadlineTile icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={fmtRM(footfall?.sales.revenue_myr ?? 0)} sub={`${footfall?.sales.transactions ?? 0} transactions`} delta={footfall?.sales.delta_pct} invertGood />
          <HeadlineTile icon={<Users className="h-4 w-4" />} label="Footfall" value={(footfall?.footfall.total ?? 0).toLocaleString()} sub={`${footfall?.footfall.avg_daily ?? 0}/day avg`} delta={footfall?.footfall.delta_pct} invertGood />
          <HeadlineTile icon={<Zap className="h-4 w-4 text-yellow-400" />} label="Electricity" value={`${(energy?.electricity.kwh ?? 0).toFixed(0)} kWh`} sub={fmtRM(energy?.electricity.cost_myr ?? 0)} delta={energy?.electricity.delta_pct} invertGood />
          <HeadlineTile icon={<Droplets className="h-4 w-4 text-sky-400" />} label="Water" value={`${(energy?.water.m3 ?? 0).toFixed(1)} m³`} sub={fmtRM(energy?.water.cost_myr ?? 0)} delta={energy?.water.delta_pct} invertGood />
          <HeadlineTile icon={<Target className="h-4 w-4" />} label="Conversion" value={`${footfall?.conversion.rate_pct ?? 0}%`} sub={`${footfall?.conversion.delta_pp !== undefined ? (footfall.conversion.delta_pp >= 0 ? '+' : '') + footfall.conversion.delta_pp : ''}pp vs prior`} />
          <HeadlineTile icon={<Trash2 className="h-4 w-4 text-rose-400" />} label="Waste (30d)" value={fmtRM(waste?.total_cost_myr ?? 0)} sub="Recoverable cost" />
          <HeadlineTile icon={<Package className="h-4 w-4 text-orange-400" />} label="At-risk products" value={`${(inventory?.at_risk ?? 0) + (inventory?.low_stock ?? 0)}`} sub={`${inventory?.at_risk ?? 0} at risk · ${inventory?.low_stock ?? 0} low stock`} />
          <HeadlineTile icon={<AlertTriangle className="h-4 w-4 text-red-400" />} label="Open anomalies" value={`${anomalyList.length}`} sub={`${highAlerts} high severity`} />
        </div>
      </div>

      {/* Operating contribution strip */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Operating contribution · last {days} days</p>
            <p className="mt-1 text-2xl font-semibold text-gray-100 tabular-nums">{fmtRM(grossMargin)}</p>
            <p className="text-xs text-gray-500">Revenue − utility cost − recoverable waste</p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-sm">
            {[
              { label: 'Revenue', value: fmtRM(footfall?.sales.revenue_myr ?? 0), cls: 'text-emerald-400' },
              { label: 'Utilities', value: `− ${fmtRM(totalCost)}`, cls: 'text-red-400' },
              { label: 'Waste', value: `− ${fmtRM(waste?.total_cost_myr ?? 0)}`, cls: 'text-red-400' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-base font-semibold ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cross-domain trend chart */}
      {trend.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-200">Cross-domain daily trend</h2>
            <p className="text-xs text-gray-500">Electricity (kWh), Water (m³), Footfall</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#4b5563" fontSize={11} />
                <YAxis yAxisId="left" stroke="#4b5563" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#4b5563" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12, color: '#f9fafb' }}
                  itemStyle={{ color: '#d1d5db' }}
                  labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
                />
                <Area yAxisId="left" type="monotone" dataKey="elec" name="Electricity (kWh)" stroke="#3b82f6" fill="url(#ge)" strokeWidth={2} />
                <Area yAxisId="right" type="monotone" dataKey="foot" name="Footfall" stroke="#a855f7" fill="url(#gf)" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="water" name="Water (m³)" stroke="#22c55e" fill="url(#gw)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Zone breakdown + peak hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {zoneData.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-base font-semibold text-gray-200">Electricity by zone</h2>
            <p className="text-xs text-gray-500">Where the kWh (and CO₂e) actually go</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <BarChart data={zoneData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={120} tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12, color: '#f9fafb' }}
                    formatter={(v: number) => `${v.toLocaleString()} kWh`}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {zoneData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {peaks.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-base font-semibold text-gray-200">Peak demand windows</h2>
            <p className="text-xs text-gray-500">Highest-traffic hours — plan staffing & lighting around these</p>
            <ul className="mt-4 space-y-2">
              {peaks.map((p, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2">
                  <span className="text-sm font-medium text-gray-200">{p.label}</span>
                  <span className="text-sm text-gray-400">{p.avg_count} avg visitors</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action lists */}
      <div className="space-y-3">
        <div className="mb-1">
          <h2 className="text-base font-semibold text-gray-200">What to act on next</h2>
          <p className="text-xs text-gray-500">Prioritised across waste, inventory and anomalies</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionList
            title="Top spoiling SKUs"
            to="/inventory"
            rows={(spoilage?.items ?? []).slice(0, 4).map(s => ({ left: s.name, right: fmtRM(s.spoilage_cost_myr) }))}
            empty="No spoilage in the last 30 days."
          />
          <ActionList
            title="High-severity anomalies"
            to="/anomalies"
            rows={anomalyList.filter(a => a.severity === 'HIGH').slice(0, 4).map(a => ({
              left: `${a.metric}${a.zone ? ` · ${a.zone.replace(/_/g, ' ')}` : ''}`,
              right: `${Math.abs(a.z_score).toFixed(1)}σ`,
            }))}
            empty="No high-severity anomalies."
          />
          <ActionList
            title="Waste hot-spots"
            to="/waste"
            rows={Object.entries(waste?.categories ?? {})
              .sort((a, b) => b[1].cost_myr - a[1].cost_myr)
              .slice(0, 4)
              .map(([cat, v]) => ({ left: cat.replace(/_/g, ' '), right: fmtRM(v.cost_myr) }))}
            empty="No waste flagged."
          />
        </div>
      </div>
    </div>
  )
}
