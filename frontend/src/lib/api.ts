/**
 * ResWatch Retail API client.
 * All data calls go through here — never supabase.from(...) for data.
 */
import axios from 'axios'
import { getAccessToken } from './supabase'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

export const client = axios.create({ baseURL: BASE_URL })

client.interceptors.request.use(async (config) => {
  const token = await getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Attach active store from localStorage (set by StoreContext)
  const storeId = localStorage.getItem('rw_active_store_id')
  if (storeId) config.headers['X-Store-Id'] = storeId
  return config
})

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Store {
  id: string
  name: string
  location: string | null
  open_hour: number
  close_hour: number
  timezone: string
}

export interface EnergySummary {
  electricity: {
    kwh: number
    cost_myr: number
    co2e_kg: number
    delta_pct: number
    unit: string
  }
  water: {
    m3: number
    cost_myr: number
    delta_pct: number
    unit: string
  }
}

export interface TrendPoint {
  date: string
  value: number
  unit: string
  cost_myr: number
  co2e_kg?: number
}

export interface ZoneBreakdown {
  zone: string
  value: number
  cost_myr: number
  pct: number
  co2e_kg?: number
}

export interface FootfallSummary {
  footfall: {
    total: number
    avg_daily: number
    delta_pct: number
  }
  sales: {
    revenue_myr: number
    transactions: number
    avg_transaction_myr: number
    delta_pct: number
  }
  conversion: {
    rate_pct: number
    delta_pp: number
  }
}

export interface FootfallTrendPoint {
  date: string
  footfall: number
  revenue_myr: number
  transactions: number
  conversion_pct: number
}

export interface HeatmapCell {
  dow: number
  hour: number
  avg_count: number
}

export interface PeakSlot {
  dow: number
  hour: number
  avg_count: number
  label: string
}

export interface InventorySummary {
  total_items: number
  low_stock: number
  at_risk: number
  overstock: number
  spoilage_cost_myr: number
}

export type InventoryStatus = 'ok' | 'low_stock' | 'at_risk' | 'out_of_stock' | 'overstock'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  unit_cost_myr: number
  perishable: boolean
  shelf_life_days: number | null
  reorder_point: number
  current_stock: number
  storage_zone: string
  consumed_90d: number
  avg_daily: number | null
  days_of_cover: number | null
  spoiled_90d: number
  spoilage_cost_90d: number
  status: InventoryStatus
  reorder_qty: number | null
}

export interface SpoilageItem {
  name: string
  sku: string
  category: string
  spoiled_qty: number
  spoilage_cost_myr: number
}

export interface SpoilageReport {
  days: number
  total_spoilage_myr: number
  items: SpoilageItem[]
}

export interface ForecastPoint {
  ts: string
  predicted: number
  lower: number
  upper: number
}

export interface ForecastResult {
  metric: string
  model: 'holt_winters' | 'seasonal_naive' | 'linear'
  horizon_days: number
  points: ForecastPoint[]
  generated_at: string
  cached: boolean
}

export interface AnomalyEvent {
  id: string
  store_id: string
  metric: 'electricity' | 'water' | 'footfall' | 'sales'
  zone: string | null
  value: number
  z_score: number
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  ts: string
  description: string
  resolved: boolean
}

export interface AnomalyCounts {
  HIGH: number
  MEDIUM: number
  LOW: number
  total: number
}

export interface WasteEvent {
  category: 'energy_idle' | 'water_leak' | 'stock_spoilage' | 'overstock' | 'overstaffing'
  zone: string | null
  start_time: string
  end_time: string | null
  duration_hours: number | null
  quantity: number | null
  cost_myr: number
  co2e_kg: number | null
  action: string
  anomaly_id: string | null
  description: string
}

export interface WasteSummary {
  total_cost_myr: number
  total_co2e_kg: number
  events_count: number
  categories: Record<string, { count: number; cost_myr: number }>
}

export interface ScheduleAssignment {
  staff_id: string
  staff_name: string
  role: string
  date: string
  shift: 'morning' | 'afternoon' | 'evening'
  cost_myr: number
}

export interface ScheduleDemandDay {
  footfall: number
  required: Record<string, number>  // shift → required staff count
}

export interface ScheduleResult {
  week_start: string
  assignments: ScheduleAssignment[]
  total_cost_myr: number
  staff_count: number
  generated_at: string | null
  method?: 'cpsat' | 'greedy'
  solve_ms?: number
  demand: Record<string, ScheduleDemandDay>
}

export interface ScheduleStaff {
  id: string
  name: string
  role: string
  hourly_rate_myr: number
  max_hours_week: number
  availability: Record<number, boolean>
}

export interface TariffInfo {
  resource: string
  region: string
  effective_date: string
  components: Record<string, number>
  afa_sen_per_kwh: number
  co2e_factor: number
  source_url: string | null
  fetched_at: string
  is_fallback: boolean
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const api = {
  health: () =>
    client.get<{ status: string; app: string; version: string }>('/health').then((r) => r.data),

  stores: {
    list: () => client.get<Store[]>('/api/stores').then((r) => r.data),
    get: (id: string) => client.get<Store>(`/api/stores/${id}`).then((r) => r.data),
  },

  tariffs: {
    current: () =>
      client
        .get<{ electricity: TariffInfo; water: TariffInfo }>('/api/tariffs/current')
        .then((r) => r.data),
  },

  energy: {
    summary: (days = 7) =>
      client.get<EnergySummary>('/api/energy/summary', { params: { days } }).then((r) => r.data),
    trend: (resource: 'electricity' | 'water', days = 14) =>
      client
        .get<TrendPoint[]>('/api/energy/trend', { params: { resource, days } })
        .then((r) => r.data),
    zones: (resource: 'electricity' | 'water', days = 7) =>
      client
        .get<ZoneBreakdown[]>('/api/energy/zones', { params: { resource, days } })
        .then((r) => r.data),
  },

  inventory: {
    summary: () =>
      client.get<InventorySummary>('/api/inventory/summary').then((r) => r.data),
    items: () =>
      client.get<InventoryItem[]>('/api/inventory/items').then((r) => r.data),
    spoilage: (days = 30) =>
      client.get<SpoilageReport>('/api/inventory/spoilage', { params: { days } }).then((r) => r.data),
  },

  forecast: {
    get: (metric: 'electricity' | 'water' | 'footfall' | 'sales', horizon = 7) =>
      client
        .get<ForecastResult>('/api/forecast', { params: { metric, horizon } })
        .then((r) => r.data),
  },

  anomalies: {
    list: (params?: { metric?: string; severity?: string; resolved?: boolean; limit?: number }) =>
      client.get<AnomalyEvent[]>('/api/anomalies', { params }).then((r) => r.data),
    counts: () =>
      client.get<AnomalyCounts>('/api/anomalies/counts').then((r) => r.data),
    resolve: (id: string) =>
      client.post<{ id: string; resolved: boolean }>(`/api/anomalies/${id}/resolve`).then((r) => r.data),
  },

  waste: {
    list:    () => client.get<WasteEvent[]>('/api/waste').then((r) => r.data),
    summary: () => client.get<WasteSummary>('/api/waste/summary').then((r) => r.data),
  },

  schedule: {
    get: (weekStart?: string) =>
      client
        .get<ScheduleResult>('/api/schedule', {
          params: weekStart ? { week_start: weekStart } : undefined,
        })
        .then((r) => r.data),
    generate: (params?: { days?: number; week_start?: string }) =>
      client
        .post<ScheduleResult>('/api/schedule/generate', null, { params })
        .then((r) => r.data),
    staff: () =>
      client.get<ScheduleStaff[]>('/api/schedule/staff').then((r) => r.data),
    downloadCsv: (weekStart?: string): Promise<void> =>
      client
        .get('/api/schedule/csv', {
          params: weekStart ? { week_start: weekStart } : undefined,
          responseType: 'blob',
        })
        .then((res) => {
          const url  = URL.createObjectURL(res.data as Blob)
          const a    = document.createElement('a')
          a.href     = url
          a.download = `schedule_${weekStart ?? 'week'}.csv`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }),
  },

  footfall: {
    summary: (days = 14) =>
      client.get<FootfallSummary>('/api/footfall/summary', { params: { days } }).then((r) => r.data),
    trend: (days = 14) =>
      client.get<FootfallTrendPoint[]>('/api/footfall/trend', { params: { days } }).then((r) => r.data),
    heatmap: (days = 28) =>
      client.get<HeatmapCell[]>('/api/footfall/heatmap', { params: { days } }).then((r) => r.data),
    peaks: (days = 28, top = 5) =>
      client.get<PeakSlot[]>('/api/footfall/peaks', { params: { days, top } }).then((r) => r.data),
  },
}
