import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package, AlertTriangle, TrendingDown, Layers,
  ShoppingCart, Thermometer, Box, Wind,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'
import type { InventoryItem, InventoryStatus } from '@/lib/api'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<InventoryStatus, { label: string; cls: string }> = {
  ok:           { label: 'OK',           cls: 'bg-gray-700 text-gray-400' },
  low_stock:    { label: 'Low Stock',    cls: 'bg-yellow-900/40 text-yellow-400 ring-1 ring-yellow-500/40' },
  at_risk:      { label: 'At Risk',      cls: 'bg-red-900/40 text-red-400 ring-1 ring-red-500/40' },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-red-800/50 text-red-300 ring-1 ring-red-600/50' },
  overstock:    { label: 'Overstock',    cls: 'bg-blue-900/40 text-blue-400 ring-1 ring-blue-500/40' },
}

const ZONE_ICON: Record<string, React.ReactNode> = {
  cold:    <Thermometer className="h-3 w-3 text-blue-400" />,
  dry:     <Box className="h-3 w-3 text-yellow-600" />,
  ambient: <Wind className="h-3 w-3 text-gray-500" />,
}

type StatusFilter = 'all' | 'at_risk' | 'low_stock' | 'overstock'

// ── Small shared components ───────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-5 space-y-2 ${
      highlight ? 'border-red-500/30 bg-red-950/20' : 'border-gray-800 bg-gray-900'
    }`}>
      <div className="flex items-center gap-2 text-sm text-gray-400">{icon}{label}</div>
      <p className={`text-2xl font-bold ${highlight ? 'text-red-400' : 'text-gray-100'}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Inventory() {
  const storeId = useStoreId()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const enabled = !!storeId

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['inventory-summary', storeId],
    queryFn: () => api.inventory.summary(),
    enabled,
    staleTime: 60_000,
  })

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory-items', storeId],
    queryFn: () => api.inventory.items(),
    enabled,
    staleTime: 60_000,
  })

  const { data: spoilage } = useQuery({
    queryKey: ['inventory-spoilage', storeId],
    queryFn: () => api.inventory.spoilage(30),
    enabled,
    staleTime: 5 * 60_000,
  })

  const filtered: InventoryItem[] =
    filter === 'all'       ? items :
    filter === 'low_stock' ? items.filter((i) => i.status === 'low_stock' || i.status === 'out_of_stock') :
                             items.filter((i) => i.status === filter)

  const reorderItems = items.filter((i) => i.reorder_qty != null && i.reorder_qty > 0)

  const FILTER_TABS: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'all',       label: 'All',       count: summary?.total_items },
    { key: 'at_risk',   label: 'At Risk',   count: summary?.at_risk },
    { key: 'low_stock', label: 'Low Stock', count: summary?.low_stock },
    { key: 'overstock', label: 'Overstock', count: summary?.overstock },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Inventory & Stock</h1>
          <p className="text-sm text-gray-400">Stock levels, coverage & spoilage alerts</p>
        </div>
      </div>

      {/* ── KPI cards ── */}
      {sumLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            icon={<Package className="h-4 w-4 text-brand-400" />}
            label="Total Items"
            value={summary?.total_items ?? 0}
            sub="SKUs tracked"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
            label="At Risk"
            value={summary?.at_risk ?? 0}
            sub="perishables expiring before sold"
            highlight={(summary?.at_risk ?? 0) > 0}
          />
          <SummaryCard
            icon={<TrendingDown className="h-4 w-4 text-yellow-400" />}
            label="Low / Out of Stock"
            value={summary?.low_stock ?? 0}
            sub="below reorder point"
            highlight={(summary?.low_stock ?? 0) > 0}
          />
          <SummaryCard
            icon={<Layers className="h-4 w-4 text-blue-400" />}
            label="Spoilage Cost"
            value={`RM ${(summary?.spoilage_cost_myr ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`}
            sub="last 90 days"
          />
        </div>
      )}

      {/* ── Items table ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">

        {/* Filter tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-950 p-1 w-fit">
          {FILTER_TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {count != null && (
                <span className={`rounded px-1 text-xs tabular-nums ${
                  filter === key ? 'bg-gray-600 text-gray-200' : 'bg-gray-800 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {itemsLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No items match this filter</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Item</th>
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Zone</th>
                  <th className="pb-2 pr-4 font-medium text-right">Stock / Reorder</th>
                  <th className="pb-2 pr-4 font-medium text-right">Days Cover</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Spoilage (90d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map((item) => {
                  const s = STATUS_CFG[item.status]
                  return (
                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <p className="text-gray-200 font-medium leading-tight">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.sku}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded px-2 py-0.5 text-xs bg-gray-800 text-gray-400">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          {ZONE_ICON[item.storage_zone] ?? null}
                          {item.storage_zone}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        <span className="font-medium text-gray-100">{item.current_stock}</span>
                        <span className="text-gray-600"> / {item.reorder_point}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-gray-300">
                        {item.days_of_cover != null
                          ? item.days_of_cover > 999
                            ? <span className="text-gray-500">&gt;999d</span>
                            : `${item.days_of_cover}d`
                          : <span className="text-gray-700">—</span>
                        }
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {item.perishable && item.spoilage_cost_90d > 0
                          ? <span className="text-red-400">RM {item.spoilage_cost_90d.toFixed(2)}</span>
                          : <span className="text-gray-700">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bottom row: Spoilage breakdown + Reorder suggestions ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Top spoilers */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Top Spoilers — Last 30 Days</h2>
            {spoilage && spoilage.total_spoilage_myr > 0 && (
              <span className="text-xs text-red-400 font-medium tabular-nums">
                RM {spoilage.total_spoilage_myr.toFixed(2)} total
              </span>
            )}
          </div>

          {!spoilage ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-800" />
              ))}
            </div>
          ) : spoilage.items.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No spoilage recorded in the last 30 days</p>
          ) : (
            <div className="space-y-3">
              {spoilage.items.slice(0, 7).map((item) => {
                const pct = spoilage.total_spoilage_myr > 0
                  ? (item.spoilage_cost_myr / spoilage.total_spoilage_myr) * 100
                  : 0
                return (
                  <div key={item.sku} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-300 truncate pr-2">{item.name}</span>
                      <span className="text-red-400 tabular-nums shrink-0">
                        RM {item.spoilage_cost_myr.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-800">
                      <div
                        className="h-1.5 rounded-full bg-red-500/60 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600">{item.spoiled_qty} units · {item.category}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Reorder suggestions */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-gray-200">Reorder Suggestions</h2>
          </div>
          <p className="text-xs text-gray-500">{reorderItems.length} items below reorder point</p>

          {itemsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-800" />
              ))}
            </div>
          ) : reorderItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">All items are adequately stocked</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {reorderItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2.5"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm text-gray-200 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.sku} · {item.current_stock} in stock</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-yellow-400">+{item.reorder_qty} units</p>
                    <p className="text-xs text-gray-500">
                      RM {((item.reorder_qty ?? 0) * item.unit_cost_myr).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
