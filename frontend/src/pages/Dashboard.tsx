import { ShoppingBag } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-400">Live monitoring dashboard — assembled in Phase 4 (F1)</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-sm text-gray-500">
          Phase 0 scaffold complete. Metric modules populate this dashboard as each Phase is built.
        </p>
      </div>
    </div>
  )
}
