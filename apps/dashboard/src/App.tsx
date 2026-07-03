import { useState } from 'react'
import { Plant } from './api.ts'
import { useActiveActivities } from './useActiveActivities.ts'
import MachineCard from './components/MachineCard.tsx'
import HistoryView from './components/HistoryView.tsx'
import { exportWeeklyCsv } from './lib/exportWeeklyCsv.ts'

type Tab = 'live' | 'history'
const PLANTS: Plant[] = ['KSB2', 'KSB6', 'KSB7']
const SHEET_URL = import.meta.env.VITE_SHEET_URL ?? ''

export default function App() {
  const [tab, setTab] = useState<Tab>('live')
  const [plantFilter, setPlantFilter] = useState<Plant | 'ALL'>('ALL')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showExportPicker, setShowExportPicker] = useState(false)
  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
    return d.toISOString().slice(0, 10)
  })
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const { activities, lastUpdated, error, setActivities } = useActiveActivities()

  const overdueCount = activities.filter((a) => a.overdue_flag && !a.acknowledged_at).length

  const filtered = activities
    .filter((a) => plantFilter === 'ALL' || a.plant === plantFilter)
    .filter((a) => !overdueOnly || a.overdue_flag)

  function handleAcknowledged(id: string, by: string) {
    setActivities((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, acknowledged_by: by, acknowledged_at: new Date().toISOString() }
          : a
      )
    )
  }

  function handleRemoved(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id))
  }

  const grouped = PLANTS.map((plant) => ({
    plant,
    items: filtered.filter((a) => a.plant === plant),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top nav */}
      <header className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 md:px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: title + overdue badge */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white">Production Dashboard</h1>
            {overdueCount > 0 && (
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">
                {overdueCount} OVERDUE
              </span>
            )}
            {lastUpdated && !error && (
              <span className="hidden sm:inline text-xs text-gray-500">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>

          {/* Right: actions + tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export CSV */}
            <div className="relative">
              <button
                onClick={() => setShowExportPicker((v) => !v)}
                className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600"
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              {showExportPicker && (
                <div className="absolute right-0 top-10 z-20 bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-xl flex flex-col gap-3 w-56">
                  <p className="text-sm font-semibold text-white">Date range</p>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">From</label>
                    <input
                      type="date"
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">To</label>
                    <input
                      type="date"
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      setExporting(true)
                      setShowExportPicker(false)
                      try {
                        await exportWeeklyCsv(
                          new Date(exportFrom).toISOString(),
                          new Date(exportTo + 'T23:59:59').toISOString()
                        )
                      } finally {
                        setExporting(false)
                      }
                    }}
                    disabled={exporting || !exportFrom || !exportTo}
                    className="rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Download CSV
                  </button>
                </div>
              )}
            </div>

            {/* Edit Time Study Data */}
            {SHEET_URL && (
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 whitespace-nowrap"
              >
                Time Study
              </a>
            )}

            {/* Live / History tabs */}
            <div className="flex rounded-lg bg-gray-800 p-1">
              <button
                onClick={() => setTab('live')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'live' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Live
              </button>
              <button
                onClick={() => setTab('history')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                History
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-6 py-4 md:py-6 pb-10">
        {tab === 'live' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setPlantFilter('ALL')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${plantFilter === 'ALL' ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                All ({activities.length})
              </button>
              {PLANTS.map((p) => {
                const count = activities.filter((a) => a.plant === p).length
                return (
                  <button
                    key={p}
                    onClick={() => setPlantFilter(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${plantFilter === p ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {p} ({count})
                  </button>
                )
              })}
              <button
                onClick={() => setOverdueOnly((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${overdueOnly ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                Overdue ({overdueCount})
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                <p className="text-5xl mb-4">🏭</p>
                <p className="text-xl">No active machines</p>
                <p className="text-sm mt-1">Activities will appear here as operators start jobs</p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map(({ plant, items }) => (
                  <section key={plant}>
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
                      {plant} — {items.length} machine{items.length !== 1 ? 's' : ''}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {items.map((activity) => (
                        <MachineCard
                          key={activity.id}
                          activity={activity}
                          onAcknowledged={handleAcknowledged}
                          onRemoved={handleRemoved}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'history' && <HistoryView />}
      </main>
      <footer className="text-center text-xs text-gray-700 py-2">
        &copy; {new Date().getFullYear()} Konrad Andrag
      </footer>
    </div>
  )
}
