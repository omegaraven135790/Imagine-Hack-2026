import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2, Bell, Target, SlidersHorizontal, Database,
  CheckCircle2, AlertCircle, Save, RotateCcw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

const STORAGE_KEY = 'reswatch.settings.v1'

type Tab = 'business' | 'notifications' | 'targets' | 'units' | 'connection'

type Settings = {
  notifications: {
    emailDigest: boolean
    digestFrequency: 'daily' | 'weekly' | 'monthly'
    anomalyAlerts: boolean
    forecastAlerts: boolean
    alertEmail: string
    threshold: number
  }
  targets: {
    co2ReductionPct: number
    energyReductionPct: number
    waterReductionPct: number
    wasteReductionPct: number
    salesGrowthPct: number
  }
  units: {
    energy: 'kWh' | 'MJ'
    water: 'L' | 'm³'
    weight: 'kg' | 'lb'
    temperature: 'C' | 'F'
  }
}

const DEFAULTS: Settings = {
  notifications: {
    emailDigest: true,
    digestFrequency: 'weekly',
    anomalyAlerts: true,
    forecastAlerts: false,
    alertEmail: '',
    threshold: 15,
  },
  targets: {
    co2ReductionPct: 15,
    energyReductionPct: 10,
    waterReductionPct: 12,
    wasteReductionPct: 20,
    salesGrowthPct: 8,
  },
  units: {
    energy: 'kWh',
    water: 'm³',
    weight: 'kg',
    temperature: 'C',
  },
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-blue-600' : 'bg-gray-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

const INPUT = 'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-500 focus:outline-none'
const SELECT = 'rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none'

export default function Settings() {
  const storeId = useStoreId()
  const [tab, setTab] = useState<Tab>('business')
  const [settings, setSettings] = useState<Settings>(load)
  const [dirty, setDirty] = useState(false)

  const { data: store } = useQuery({
    queryKey: ['store-detail', storeId],
    queryFn: () => storeId ? api.stores.get(storeId) : null,
    enabled: !!storeId,
    staleTime: 300_000,
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    staleTime: 30_000,
  })

  function update<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }))
    setDirty(true)
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setDirty(false)
    toast.success('Settings saved')
  }

  function reset() {
    setSettings(DEFAULTS)
    localStorage.removeItem(STORAGE_KEY)
    setDirty(false)
    toast('Settings reset to defaults')
  }

  // Persist on unmount if dirty
  useEffect(() => {
    return () => {
      if (dirty) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  }, [dirty, settings])

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'business', label: 'Store', Icon: Building2 },
    { id: 'notifications', label: 'Notifications', Icon: Bell },
    { id: 'targets', label: 'Targets', Icon: Target },
    { id: 'units', label: 'Units', Icon: SlidersHorizontal },
    { id: 'connection', label: 'Connection', Icon: Database },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Settings</h1>
          <p className="text-sm text-gray-400">Configure ResWatch for your store</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:text-gray-200">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <button onClick={save} disabled={!dirty} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900/50 p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-gray-800 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-6">

        {tab === 'business' && (
          <>
            <Section title="Store information">
              <Field label="Store name">
                <input className={INPUT} value={store?.name ?? 'Loading…'} readOnly />
              </Field>
              <Field label="Location">
                <input className={INPUT} value={store?.location ?? '—'} readOnly />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Opens">
                  <input className={INPUT} value={store ? `${store.open_hour}:00` : '—'} readOnly />
                </Field>
                <Field label="Closes">
                  <input className={INPUT} value={store ? `${store.close_hour}:00` : '—'} readOnly />
                </Field>
              </div>
              <Field label="Timezone">
                <input className={INPUT} value={store?.timezone ?? '—'} readOnly />
              </Field>
            </Section>
            <p className="text-xs text-gray-600">Store details are managed in the Supabase database. Contact your administrator to update them.</p>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <Section title="Email digest">
              <div className="flex items-center justify-between">
                <Field label="Weekly digest email" hint="Receive a summary of the week's resource usage">
                  <span />
                </Field>
                <Toggle
                  checked={settings.notifications.emailDigest}
                  onChange={v => update('notifications', { emailDigest: v })}
                />
              </div>
              {settings.notifications.emailDigest && (
                <>
                  <Field label="Frequency">
                    <select
                      className={SELECT}
                      value={settings.notifications.digestFrequency}
                      onChange={e => update('notifications', { digestFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                  <Field label="Send to email">
                    <input
                      className={INPUT}
                      type="email"
                      placeholder="ops@example.com"
                      value={settings.notifications.alertEmail}
                      onChange={e => update('notifications', { alertEmail: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </Section>
            <Section title="Alerts">
              <div className="flex items-center justify-between">
                <Field label="Anomaly alerts" hint="Notify when a HIGH severity anomaly is detected">
                  <span />
                </Field>
                <Toggle
                  checked={settings.notifications.anomalyAlerts}
                  onChange={v => update('notifications', { anomalyAlerts: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Field label="Forecast alerts" hint="Notify when usage is forecast to exceed targets">
                  <span />
                </Field>
                <Toggle
                  checked={settings.notifications.forecastAlerts}
                  onChange={v => update('notifications', { forecastAlerts: v })}
                />
              </div>
              <Field label="Alert threshold (%)" hint="Trigger when actual exceeds forecast by this %">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  max={100}
                  value={settings.notifications.threshold}
                  onChange={e => update('notifications', { threshold: +e.target.value })}
                />
              </Field>
            </Section>
          </>
        )}

        {tab === 'targets' && (
          <Section title="Annual reduction targets">
            {(
              [
                { key: 'co2ReductionPct',     label: 'CO₂ reduction target (%)',     hint: 'Year-on-year CO₂e reduction goal' },
                { key: 'energyReductionPct',  label: 'Energy reduction target (%)',   hint: 'kWh year-on-year reduction goal' },
                { key: 'waterReductionPct',   label: 'Water reduction target (%)',    hint: 'm³ year-on-year reduction goal' },
                { key: 'wasteReductionPct',   label: 'Waste reduction target (%)',    hint: 'Recoverable waste RM year-on-year' },
                { key: 'salesGrowthPct',      label: 'Revenue growth target (%)',     hint: 'Year-on-year revenue growth goal' },
              ] as const
            ).map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <div className="flex items-center gap-3">
                  <input
                    className={INPUT}
                    type="number"
                    min={0}
                    max={100}
                    value={settings.targets[key]}
                    onChange={e => update('targets', { [key]: +e.target.value })}
                  />
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-gray-800">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all"
                        style={{ width: `${Math.min(settings.targets[key], 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Field>
            ))}
          </Section>
        )}

        {tab === 'units' && (
          <Section title="Display units">
            {(
              [
                { key: 'energy', label: 'Energy', opts: ['kWh', 'MJ'] },
                { key: 'water', label: 'Water', opts: ['m³', 'L'] },
                { key: 'weight', label: 'Weight', opts: ['kg', 'lb'] },
                { key: 'temperature', label: 'Temperature', opts: ['C', 'F'] },
              ] as const
            ).map(({ key, label, opts }) => (
              <Field key={key} label={label}>
                <div className="flex gap-2">
                  {opts.map(opt => (
                    <button
                      key={opt}
                      onClick={() => update('units', { [key]: opt })}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        settings.units[key] === opt
                          ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </Field>
            ))}
            <p className="text-xs text-gray-600">Unit preferences are stored locally in your browser. Charts and exports will use the selected units in a future update.</p>
          </Section>
        )}

        {tab === 'connection' && (
          <Section title="Backend connection">
            <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-950 p-4">
              {health?.status === 'ok' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-200">
                  {health?.status === 'ok' ? 'Backend connected' : 'Backend unavailable'}
                </p>
                <p className="text-xs text-gray-500">
                  {health ? `${health.app} v${health.version}` : 'http://localhost:8000'}
                </p>
              </div>
            </div>
            <Field label="API base URL">
              <input className={INPUT} value={import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'} readOnly />
            </Field>
            <Field label="Supabase project URL">
              <input className={INPUT} value={import.meta.env.VITE_SUPABASE_URL ?? '—'} readOnly />
            </Field>
            <p className="text-xs text-gray-600">
              Connection settings are configured via environment variables in <code className="text-gray-400">.env</code>.
              Editing them here is not supported — modify the <code className="text-gray-400">.env</code> file and restart.
            </p>
          </Section>
        )}

      </div>
    </div>
  )
}
