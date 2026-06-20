import { useState } from 'react'
import {
  Truck, Fuel, PackageCheck, MapPin, Gauge, TrendingDown, TrendingUp,
  AlertTriangle, Wrench, CheckCircle2, Clock, XCircle, ArrowRight,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

// ── Mock data — Malaysian retail context ──────────────────────────────────────

type FuelType   = 'petrol' | 'diesel' | 'hybrid' | 'electric'
type VehicleStatus = 'active' | 'maintenance' | 'inactive'
type ShipmentStatus = 'planned' | 'in_transit' | 'delivered' | 'delayed' | 'cancelled'

interface Vehicle {
  id: string; registration_no: string; label: string
  make: string; model: string; vehicle_type: string
  fuel_type: FuelType; capacity_kg: number; odometer_km: number
  status: VehicleStatus; assigned_driver: string
}

interface Shipment {
  id: string; ref: string; route: string
  vehicle_id: string; status: ShipmentStatus
  cargo: string; cargo_weight_kg: number
  scheduled_departure: string; scheduled_arrival: string
  origin: string; destination: string
}

interface FuelLog {
  vehicle_id: string; date: string; litres: number; cost_myr: number; odometer_km: number
}

const VEHICLES: Vehicle[] = [
  { id: 'v1', registration_no: 'WA 4392 J', label: 'Refrigerated Van 1', make: 'Nissan', model: 'Urvan', vehicle_type: 'van', fuel_type: 'diesel', capacity_kg: 1200, odometer_km: 84320, status: 'active', assigned_driver: 'Ahmad Faizal' },
  { id: 'v2', registration_no: 'WB 7721 K', label: 'Delivery Lorry', make: 'Hino', model: '300 Series', vehicle_type: 'lorry', fuel_type: 'diesel', capacity_kg: 3500, odometer_km: 127450, status: 'active', assigned_driver: 'Rajan Pillai' },
  { id: 'v3', registration_no: 'VCC 8834 K', label: 'Electric Cargo Van', make: 'BYD', model: 'T3', vehicle_type: 'van', fuel_type: 'electric', capacity_kg: 980, odometer_km: 21870, status: 'active', assigned_driver: 'Siti Norzahira' },
  { id: 'v4', registration_no: 'WC 2210 P', label: 'Refrigerated Van 2', make: 'Toyota', model: 'Hiace', vehicle_type: 'van', fuel_type: 'hybrid', capacity_kg: 1050, odometer_km: 56200, status: 'maintenance', assigned_driver: 'Lim Wei Jian' },
  { id: 'v5', registration_no: 'WD 9941 H', label: 'Spare Lorry', make: 'Isuzu', model: 'NLR 77', vehicle_type: 'lorry', fuel_type: 'diesel', capacity_kg: 2000, odometer_km: 193100, status: 'inactive', assigned_driver: '—' },
]

const SHIPMENTS: Shipment[] = [
  { id: 's1', ref: 'SHP-20260620-001', route: 'Subang → KL Sentral', vehicle_id: 'v3', status: 'in_transit', cargo: 'Fresh produce, chilled beverages', cargo_weight_kg: 420, scheduled_departure: '2026-06-20T07:00:00', scheduled_arrival: '2026-06-20T09:30:00', origin: 'Grand Bazaar Subang', destination: 'Central Depot KL' },
  { id: 's2', ref: 'SHP-20260620-002', route: 'Cold Chain Run A', vehicle_id: 'v1', status: 'delivered', cargo: 'Frozen goods, dairy', cargo_weight_kg: 780, scheduled_departure: '2026-06-20T05:30:00', scheduled_arrival: '2026-06-20T08:00:00', origin: 'Shah Alam Warehouse', destination: 'Grand Bazaar Subang' },
  { id: 's3', ref: 'SHP-20260620-003', route: 'Dry Goods Replen', vehicle_id: 'v2', status: 'planned', cargo: 'Household goods, packaged food', cargo_weight_kg: 2100, scheduled_departure: '2026-06-20T14:00:00', scheduled_arrival: '2026-06-20T16:30:00', origin: 'Klang Port Warehouse', destination: 'Grand Bazaar Subang' },
  { id: 's4', ref: 'SHP-20260619-004', route: 'Evening Replenishment', vehicle_id: 'v1', status: 'delivered', cargo: 'Beverages, snacks', cargo_weight_kg: 530, scheduled_departure: '2026-06-19T18:00:00', scheduled_arrival: '2026-06-19T20:00:00', origin: 'PJ Distribution Centre', destination: 'Grand Bazaar Subang' },
  { id: 's5', ref: 'SHP-20260619-005', route: 'Morning Cold Chain', vehicle_id: 'v3', status: 'delayed', cargo: 'Chilled meat, seafood', cargo_weight_kg: 310, scheduled_departure: '2026-06-19T06:00:00', scheduled_arrival: '2026-06-19T08:30:00', origin: 'Selayang Wet Market', destination: 'Grand Bazaar Subang' },
  { id: 's6', ref: 'SHP-20260618-006', route: 'Bulky Goods', vehicle_id: 'v2', status: 'delivered', cargo: 'Furniture, appliances', cargo_weight_kg: 3100, scheduled_departure: '2026-06-18T09:00:00', scheduled_arrival: '2026-06-18T12:00:00', origin: 'Nilai Industrial Park', destination: 'Grand Bazaar Subang' },
]

const FUEL_LOGS: FuelLog[] = [
  { vehicle_id: 'v1', date: '2026-06-20', litres: 45.2, cost_myr: 86.9, odometer_km: 84320 },
  { vehicle_id: 'v2', date: '2026-06-19', litres: 88.4, cost_myr: 170.0, odometer_km: 127450 },
  { vehicle_id: 'v1', date: '2026-06-18', litres: 42.1, cost_myr: 80.9, odometer_km: 84187 },
  { vehicle_id: 'v2', date: '2026-06-17', litres: 91.0, cost_myr: 175.0, odometer_km: 127220 },
  { vehicle_id: 'v3', date: '2026-06-18', litres: 0, cost_myr: 0, odometer_km: 21870 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUEL_BADGE: Record<FuelType, string> = {
  petrol:   'bg-orange-900/50 text-orange-300',
  diesel:   'bg-gray-800 text-gray-300',
  hybrid:   'bg-emerald-900/50 text-emerald-300',
  electric: 'bg-blue-900/50 text-blue-300',
}

const FUEL_EMOJI: Record<FuelType, string> = {
  petrol: '⛽', diesel: '🛢️', hybrid: '🌱', electric: '⚡',
}

const STATUS_BADGE: Record<ShipmentStatus, string> = {
  planned:    'bg-gray-800 text-gray-300',
  in_transit: 'bg-blue-900/60 text-blue-300',
  delivered:  'bg-emerald-900/50 text-emerald-300',
  delayed:    'bg-amber-900/50 text-amber-300',
  cancelled:  'bg-red-900/50 text-red-300',
}

const STATUS_ICON: Record<ShipmentStatus, React.ReactNode> = {
  planned:    <Clock className="h-3 w-3" />,
  in_transit: <Truck className="h-3 w-3" />,
  delivered:  <CheckCircle2 className="h-3 w-3" />,
  delayed:    <AlertTriangle className="h-3 w-3" />,
  cancelled:  <XCircle className="h-3 w-3" />,
}

const VS_BADGE: Record<VehicleStatus, string> = {
  active:      'bg-emerald-900/50 text-emerald-300',
  maintenance: 'bg-amber-900/50 text-amber-300',
  inactive:    'bg-gray-800 text-gray-400',
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Transportation() {
  const [tab, setTab] = useState<'shipments' | 'fleet' | 'fuel'>('shipments')
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  const active   = VEHICLES.filter(v => v.status === 'active').length
  const inMaint  = VEHICLES.filter(v => v.status === 'maintenance').length
  const inTransit = SHIPMENTS.filter(s => s.status === 'in_transit').length
  const delayed  = SHIPMENTS.filter(s => s.status === 'delayed').length
  const totalFuelCost = FUEL_LOGS.reduce((s, l) => s + l.cost_myr, 0)
  const electricKm = VEHICLES.filter(v => v.fuel_type === 'electric').reduce((s, v) => s + v.odometer_km, 0)

  const activeShipmentVehicle = selectedVehicle
    ? SHIPMENTS.find(s => s.vehicle_id === selectedVehicle.id && s.status === 'in_transit')
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Transportation</h1>
          <p className="text-sm text-gray-400">Fleet, shipments, routes and fuel — The Grand Bazaar</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Truck className="h-4 w-4 text-blue-400" />Active vehicles</div>
          <p className="mt-2 text-2xl font-bold text-gray-100 tabular-nums">{active}</p>
          <p className="text-xs text-gray-500">{inMaint} in maintenance</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><PackageCheck className="h-4 w-4 text-emerald-400" />In transit</div>
          <p className="mt-2 text-2xl font-bold text-gray-100 tabular-nums">{inTransit}</p>
          <p className={`text-xs ${delayed > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{delayed > 0 ? `${delayed} delayed` : 'All on time'}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Fuel className="h-4 w-4 text-yellow-400" />Fuel cost (7d)</div>
          <p className="mt-2 text-2xl font-bold text-gray-100 tabular-nums">RM {totalFuelCost.toFixed(0)}</p>
          <p className="text-xs text-gray-500">across diesel &amp; hybrid fleet</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Gauge className="h-4 w-4 text-violet-400" />EV km driven</div>
          <p className="mt-2 text-2xl font-bold text-gray-100 tabular-nums">{electricKm.toLocaleString()}</p>
          <p className="flex items-center gap-1 text-xs text-emerald-400"><TrendingDown className="h-3 w-3" />zero direct emissions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900/50 p-1 w-fit">
        {(['shipments', 'fleet', 'fuel'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Shipments tab */}
      {tab === 'shipments' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Cargo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Departure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {SHIPMENTS.map(s => {
                const vehicle = VEHICLES.find(v => v.id === s.vehicle_id)
                return (
                  <tr key={s.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{s.ref}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-200 font-medium">{s.route}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />{s.origin} <ArrowRight className="h-3 w-3" /> {s.destination}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{vehicle?.registration_no ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-300 truncate max-w-[180px]">{s.cargo}</p>
                      <p className="text-xs text-gray-500">{s.cargo_weight_kg} kg</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                        {STATUS_ICON[s.status]}
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {formatDistanceToNow(parseISO(s.scheduled_departure), { addSuffix: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Fleet tab */}
      {tab === 'fleet' && (
        <div className="space-y-3">
          {VEHICLES.map(v => (
            <div
              key={v.id}
              onClick={() => setSelectedVehicle(selectedVehicle?.id === v.id ? null : v)}
              className={`rounded-xl border cursor-pointer transition-colors p-4 ${
                selectedVehicle?.id === v.id
                  ? 'border-blue-600/60 bg-blue-950/20'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800 text-lg">
                    {FUEL_EMOJI[v.fuel_type]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-100">{v.label}</p>
                    <p className="text-xs text-gray-500">{v.registration_no} · {v.make} {v.model} · {v.assigned_driver}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${FUEL_BADGE[v.fuel_type]}`}>{v.fuel_type}</span>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${VS_BADGE[v.status]}`}>{v.status}</span>
                </div>
              </div>
              {selectedVehicle?.id === v.id && (
                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-800 pt-4">
                  <div>
                    <p className="text-xs text-gray-500">Capacity</p>
                    <p className="text-sm font-medium text-gray-200">{v.capacity_kg.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Odometer</p>
                    <p className="text-sm font-medium text-gray-200">{v.odometer_km.toLocaleString()} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Active shipment</p>
                    <p className="text-sm font-medium text-gray-200">
                      {activeShipmentVehicle ? activeShipmentVehicle.ref : '—'}
                    </p>
                  </div>
                  {v.status === 'maintenance' && (
                    <div className="col-span-3 flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      Vehicle currently in scheduled maintenance — estimated return tomorrow.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fuel tab */}
      {tab === 'fuel' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Total fuel cost (7d)</p>
              <p className="mt-1 text-xl font-bold text-gray-100">RM {totalFuelCost.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg cost / fill</p>
              <p className="mt-1 text-xl font-bold text-gray-100">
                RM {FUEL_LOGS.length ? (totalFuelCost / FUEL_LOGS.filter(l => l.litres > 0).length).toFixed(2) : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-400" />EV savings est.</p>
              <p className="mt-1 text-xl font-bold text-emerald-400">RM {(electricKm * 0.08).toFixed(0)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Litres</th>
                  <th className="px-4 py-3 font-medium text-right">Cost (RM)</th>
                  <th className="px-4 py-3 font-medium text-right">Odometer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {FUEL_LOGS.map((l, i) => {
                  const v = VEHICLES.find(vv => vv.id === l.vehicle_id)
                  return (
                    <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-gray-200">{v?.label ?? l.vehicle_id}</p>
                        <p className="text-xs text-gray-500">{v?.registration_no}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{l.date}</td>
                      <td className="px-4 py-3 text-right text-gray-200">
                        {l.litres > 0 ? `${l.litres.toFixed(1)} L` : <span className="text-blue-400">⚡ EV</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-200">
                        {l.cost_myr > 0 ? `${l.cost_myr.toFixed(2)}` : <span className="text-emerald-400">0.00</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">{l.odometer_km.toLocaleString()} km</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
