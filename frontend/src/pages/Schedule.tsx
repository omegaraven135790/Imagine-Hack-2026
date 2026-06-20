import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, ChevronLeft, ChevronRight, Download, RefreshCw, Users,
} from 'lucide-react'
import { api, ScheduleAssignment, ScheduleDemandDay, ScheduleStaff } from '@/lib/api'
import { useStoreId } from '@/context/StoreContext'

// ── constants ─────────────────────────────────────────────────────────────────

const SHIFTS = ['morning', 'afternoon', 'evening'] as const
type Shift = typeof SHIFTS[number]

const SHIFT_META: Record<Shift, { label: string; time: string; color: string; bg: string }> = {
  morning:   { label: 'Morning',   time: '10:00–15:00', color: 'text-amber-400',  bg: 'bg-amber-950/20'  },
  afternoon: { label: 'Afternoon', time: '14:00–19:00', color: 'text-sky-400',    bg: 'bg-sky-950/20'    },
  evening:   { label: 'Evening',   time: '18:00–22:00', color: 'text-violet-400', bg: 'bg-violet-950/20' },
}

const ROLE_CHIP: Record<string, string> = {
  supervisor: 'bg-amber-900/60 text-amber-300 border border-amber-700/50',
  cashier:    'bg-sky-900/60   text-sky-300   border border-sky-700/50',
  associate:  'bg-gray-800/60  text-gray-300  border border-gray-700/50',
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── helpers ───────────────────────────────────────────────────────────────────

function upcomingMonday(): string {
  const today = new Date()
  const dow   = today.getDay()
  const diff  = dow === 0 ? 1 : (8 - dow) % 7
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString('en-MY', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function buildGrid(assignments: ScheduleAssignment[], days: string[]) {
  const grid: Record<string, Record<string, ScheduleAssignment[]>> = {}
  for (const d of days) grid[d] = { morning: [], afternoon: [], evening: [] }
  for (const a of assignments) {
    grid[a.date]?.[a.shift]?.push(a)
  }
  return grid
}

// ── sub-components ────────────────────────────────────────────────────────────

function StaffChip({ a }: { a: ScheduleAssignment }) {
  const cls       = ROLE_CHIP[a.role] ?? ROLE_CHIP.associate
  const firstName = a.staff_name.split(' ')[0]
  return (
    <div className={`rounded px-1.5 py-0.5 mb-1 text-xs leading-snug ${cls}`}>
      <div className="font-medium truncate max-w-[88px]">{firstName}</div>
      <div className="opacity-50 capitalize text-[10px]">{a.role}</div>
    </div>
  )
}

function DemandBadge({
  required,
  got,
}: {
  required: number
  got: number
}) {
  const met = got >= required
  return (
    <div
      title={met
        ? `${got} assigned — demand met (need ${required})`
        : `${got} assigned — ${required - got} short (need ${required})`}
      className={`mt-1 text-[10px] font-medium tabular-nums select-none ${
        met ? 'text-gray-600' : 'text-red-400'
      }`}
    >
      {met ? `need ${required} ✓` : `need ${required} · ${required - got} short`}
    </div>
  )
}

function StaffRosterTable({ staff }: { staff: ScheduleStaff[] }) {
  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-900">
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Name</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Role</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Rate/hr</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Max hrs/wk</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Days off</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s, i) => {
            const offDays = DOW_LABELS.filter((_, idx) => s.availability[idx] === false)
            return (
              <tr key={s.id} className={i % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-900/20'}>
                <td className="px-4 py-2 text-gray-200 font-medium">{s.name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs rounded px-1.5 py-0.5 ${ROLE_CHIP[s.role] ?? ROLE_CHIP.associate}`}>
                    {s.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-300 tabular-nums">RM {s.hourly_rate_myr.toFixed(2)}</td>
                <td className="px-4 py-2 text-gray-300 tabular-nums">{s.max_hours_week}h</td>
                <td className="px-4 py-2 text-gray-500">{offDays.length ? offDays.join(', ') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── scheduling reason banner ──────────────────────────────────────────────────

function ReasonBanner({ method, solveMs }: { method?: string; solveMs?: number }) {
  if (!method) return null
  const isCpsat = method === 'cpsat'
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm">
      <span className={`font-semibold ${isCpsat ? 'text-brand-400' : 'text-amber-400'}`}>
        {isCpsat ? 'CP-SAT solver' : 'Greedy fallback'}
      </span>
      <span className="text-gray-400">
        {isCpsat
          ? ` — optimal cost schedule found in ${solveMs ?? '?'}ms. Staffing is demand-driven: each shift is allocated 1 staff per ${Intl.NumberFormat().format(120)} forecasted visitors, with minimum 1 per shift, fair workload distribution across all staff, and supervisor coverage every day.`
          : ' — heuristic schedule used (solver timed out or unavailable). Staff assigned greedily by role priority, rotating daily to balance workload.'}
      </span>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Schedule() {
  const storeId     = useStoreId()
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(upcomingMonday)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data: schedule, isLoading } = useQuery({
    queryKey:  ['schedule', weekStart, storeId],
    queryFn:   () => api.schedule.get(weekStart),
    enabled:   !!storeId,
    staleTime: 60_000,
  })

  const { data: staff = [] } = useQuery({
    queryKey:  ['schedule-staff', storeId],
    queryFn:   () => api.schedule.staff(),
    enabled:   !!storeId,
    staleTime: 300_000,
  })

  const generate = useMutation({
    mutationFn: () => api.schedule.generate({ week_start: weekStart }),
    onSuccess:  () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', weekStart, storeId] }),
  })

  const [csvLoading, setCsvLoading] = useState(false)
  async function downloadCsv() {
    setCsvLoading(true)
    try { await api.schedule.downloadCsv(weekStart) } finally { setCsvLoading(false) }
  }

  const grid        = buildGrid(schedule?.assignments ?? [], days)
  const demand      = schedule?.demand ?? {}
  const hasSchedule = (schedule?.assignments?.length ?? 0) > 0

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-100">Staff Schedule</h1>
            <p className="text-sm text-gray-400">Demand-driven roster from forecasted footfall</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasSchedule && (
            <button
              onClick={downloadCsv}
              disabled={csvLoading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {csvLoading ? 'Downloading…' : 'CSV'}
            </button>
          )}
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`} />
            {generate.isPending ? 'Generating…' : 'Generate from Forecast'}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      {hasSchedule && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">Labor Cost</p>
            <p className="text-xl font-bold tabular-nums text-gray-100">
              RM {schedule!.total_cost_myr.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">Staff on Roster</p>
            <p className="text-xl font-bold tabular-nums text-gray-100">{schedule!.staff_count}</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">Total Shifts</p>
            <p className="text-xl font-bold tabular-nums text-gray-100">{schedule!.assignments.length}</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">Solver</p>
            <p className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
              {schedule!.method ?? '—'}
            </p>
            {schedule!.generated_at && (
              <p className="text-[11px] text-gray-600 mt-0.5">{fmtDatetime(schedule!.generated_at)}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Algorithm reason ── */}
      {hasSchedule && (
        <ReasonBanner method={schedule!.method} solveMs={schedule!.solve_ms} />
      )}

      {/* ── Week navigation ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="rounded-lg border border-gray-700 bg-gray-900 p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-200">
          {fmtDate(weekStart)} — {fmtDate(addDays(weekStart, 6))}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="rounded-lg border border-gray-700 bg-gray-900 p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Schedule grid ── */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-gray-800" />
      ) : !hasSchedule ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-700 bg-gray-900/40 py-20 gap-4 text-center">
          <Calendar className="h-10 w-10 text-brand-400/30" />
          <p className="font-medium text-gray-400">No schedule for this week yet</p>
          <p className="text-sm text-gray-600">
            Click &ldquo;Generate from Forecast&rdquo; to build a demand-driven roster.
          </p>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="mt-2 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`} />
            {generate.isPending ? 'Generating…' : 'Generate Schedule'}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-700">
                <th className="w-28 px-4 py-3 text-left text-gray-400 font-medium">Shift</th>
                {days.map((d, i) => {
                  const ctx: ScheduleDemandDay | undefined = demand[d]
                  return (
                    <th
                      key={d}
                      className="px-2 py-2 text-center font-medium text-gray-300"
                    >
                      <div className="font-semibold">{DOW_LABELS[i]}</div>
                      <div className="text-xs text-gray-500 font-normal">{fmtDate(d)}</div>
                      {ctx && ctx.footfall > 0 && (
                        <div
                          className="mt-1 text-[10px] text-gray-600 font-normal"
                          title={`Forecasted ${ctx.footfall} visitors → staffing requirements shown below`}
                        >
                          ~{ctx.footfall.toLocaleString()} visitors
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map((shift, si) => {
                const meta = SHIFT_META[shift]
                return (
                  <tr key={shift} className={si < SHIFTS.length - 1 ? 'border-b border-gray-800' : ''}>
                    <td className={`px-4 py-3 align-top ${meta.bg} border-r border-gray-800`}>
                      <div className={`font-semibold ${meta.color}`}>{meta.label}</div>
                      <div className="text-[11px] text-gray-600">{meta.time}</div>
                    </td>
                    {days.map((d) => {
                      const cell     = grid[d]?.[shift] ?? []
                      const ctx      = demand[d]
                      const required = ctx?.required?.[shift] ?? 1
                      return (
                        <td
                          key={d}
                          className="px-2 py-2 align-top bg-gray-900/20 hover:bg-gray-900/50 transition-colors"
                          style={{ minWidth: 96 }}
                        >
                          {cell.length > 0
                            ? cell.map((a) => <StaffChip key={a.staff_id} a={a} />)
                            : (
                              <div className="h-8 flex items-center justify-center">
                                <span className="text-[11px] text-gray-700">—</span>
                              </div>
                            )}
                          <DemandBadge required={required} got={cell.length} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Staff roster ── */}
      {staff.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-medium text-gray-400">Staff Roster & Availability</h2>
          </div>
          <StaffRosterTable staff={staff} />
        </div>
      )}
    </div>
  )
}
