import { Routes, Route } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import Dashboard from '@/pages/Dashboard'
import EnergyWater from '@/pages/EnergyWater'
import FootfallSales from '@/pages/FootfallSales'
import Inventory from '@/pages/Inventory'
import Forecasts from '@/pages/Forecasts'
import Anomalies from '@/pages/Anomalies'
import Waste from '@/pages/Waste'
import Schedule from '@/pages/Schedule'
import Insights from '@/pages/Insights'
import Settings from '@/pages/Settings'
import Transportation from '@/pages/Transportation'

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-gray-500">{name} — coming soon</p>
    </div>
  )
}

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/"               element={<Dashboard />} />
              <Route path="/energy"         element={<EnergyWater />} />
              <Route path="/inventory"      element={<Inventory />} />
              <Route path="/footfall"       element={<FootfallSales />} />
              <Route path="/forecasts"      element={<Forecasts />} />
              <Route path="/anomalies"      element={<Anomalies />} />
              <Route path="/waste"          element={<Waste />} />
              <Route path="/schedule"       element={<Schedule />} />
              <Route path="/insights"       element={<Insights />} />
              <Route path="/transportation" element={<Transportation />} />
              <Route path="/settings"       element={<Settings />} />
              <Route path="/reports"        element={<Placeholder name="Reports" />} />
              <Route path="*"               element={<Placeholder name="404 — Page not found" />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
