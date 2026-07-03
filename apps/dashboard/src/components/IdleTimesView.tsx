import { useState, useEffect } from 'react'
import { api, MachineDailyDetail, Plant } from '../api.ts'

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  const s = sec % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const ALL_PLANTS: Plant[] = ['KSB2', 'KSB6', 'KSB7']
const PLANT_COLORS: Record<string, string> = { KSB2: 'bg-blue-600', KSB6: 'bg-purple-600', KSB7: 'bg-teal-600' }

export default function IdleTimesView() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  // Default: all plants
  const [selectedPlants, setSelectedPlants] = useState<Set<Plant>>(new Set(['KSB2', 'KSB6', 'KSB7']))
  const [data, setData] = useState<MachineDailyDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    // Pass selected plants; if all 3 selected, pass none (server returns everything)
    const plants = [...selectedPlants]
    const plantsArg = plants.length === ALL_PLANTS.length ? undefined : plants
    api.getDailyDetail(date, plantsArg)
      .then((d) => Array.isArray(d) ? setData(d) : setData([]))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [date, selectedPlants])

  function togglePlant(p: Plant) {
    setSelectedPlants((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function toggleExpand(mn: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(mn) ? next.delete(mn) : next.add(mn)
      return next
    })
  }

  const flagged = data.filter((m) => m.flagged)
  const normal  = data.filter((m) => !m.flagged)

  // Summary stats
  const totalMachines = data.length
  const idleNow = data.filter((m) => m.is_currently_idle).length
  const noActivity = data.filter((m) => m.has_no_activity).length

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {ALL_PLANTS.map((p) => (
            <button
              key={p}
              onClick={() => togglePlant(p)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${
                selectedPlants.has(p)
                  ? `${PLANT_COLORS[p]} text-white border-transparent`
                  : 'border-gray-600 text-gray-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {loading && <span className="text-sm text-gray-500">Loading…</span>}
      </div>

      {/* Summary bar */}
      {!loading && data.length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-xl bg-gray-800 px-4 py-3 text-sm">
          <span className="text-gray-400">{totalMachines} machines</span>
          {flagged.length > 0 && <span className="text-red-400 font-bold">⚠ {flagged.length} exceeded 3h</span>}
          {idleNow > 0 && <span className="text-yellow-400">{idleNow} currently idle</span>}
          {noActivity > 0 && <span className="text-gray-500">{noActivity} no activity today</span>}
        </div>
      )}

      {/* Flagged machines */}
      {flagged.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-2">
            ⚠ Exceeded 3h Idle ({flagged.length})
          </h2>
          <div className="space-y-2">
            {flagged.map((m) => (
              <MachineTimelineCard
                key={m.machine_number}
                machine={m}
                expanded={expanded.has(m.machine_number)}
                onToggle={() => toggleExpand(m.machine_number)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Normal machines */}
      {normal.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
            Within Limit ({normal.length})
          </h2>
          <div className="space-y-2">
            {normal.map((m) => (
              <MachineTimelineCard
                key={m.machine_number}
                machine={m}
                expanded={expanded.has(m.machine_number)}
                onToggle={() => toggleExpand(m.machine_number)}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && data.length === 0 && (
        <p className="text-center text-gray-500 py-12">No machines found.</p>
      )}
    </div>
  )
}

function MachineTimelineCard({
  machine,
  expanded,
  onToggle,
}: {
  machine: MachineDailyDetail
  expanded: boolean
  onToggle: () => void
}) {
  const borderClass = machine.flagged
    ? 'border-red-600'
    : machine.is_currently_idle
    ? 'border-yellow-600'
    : machine.has_no_activity
    ? 'border-gray-600'
    : 'border-gray-700'

  return (
    <div className={`rounded-2xl border-2 bg-gray-800 overflow-hidden ${borderClass}`}>
      {/* Header */}
      <button className="w-full text-left px-5 py-4 flex items-center justify-between gap-4" onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${PLANT_COLORS[machine.plant] ?? 'bg-gray-600'}`}>
            {machine.plant}
          </span>
          <span className="font-bold text-white">{machine.machine_number}</span>
          {machine.machine_description && (
            <span className="text-sm text-gray-400 truncate hidden sm:block">{machine.machine_description}</span>
          )}
          {machine.has_no_activity && (
            <span className="shrink-0 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">No activity</span>
          )}
          {machine.is_currently_idle && !machine.has_no_activity && (
            <span className="shrink-0 text-xs font-semibold text-yellow-400 bg-yellow-900/50 px-2 py-0.5 rounded-full">Idle now</span>
          )}
          {machine.flagged && (
            <span className="shrink-0 text-xs font-bold text-red-400 bg-red-900/50 px-2 py-0.5 rounded-full animate-pulse">⚠ EXCEEDED</span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={`text-base font-mono font-bold ${machine.flagged ? 'text-red-400' : machine.total_working_idle_sec > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {fmtDur(machine.total_working_idle_sec)} idle
          </span>
          <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded timeline */}
      {expanded && (
        <div className="border-t border-gray-700 divide-y divide-gray-700/50">
          {machine.timeline.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No entries for this period.</p>
          )}
          {machine.timeline.map((entry, idx) => {
            if (entry.type === 'idle') {
              const isLong = (entry.working_idle_sec ?? 0) > 3600
              return (
                <div key={idx} className="flex gap-4 px-5 py-3">
                  <div className="w-2 shrink-0 flex flex-col items-center pt-1.5">
                    <div className={`w-2 h-2 rounded-full ${isLong ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">
                        {entry.from ? fmt(entry.from) : '06:00'} → {entry.to ? fmt(entry.to) : 'now'}
                      </span>
                      <span className={`text-sm font-bold ${isLong ? 'text-red-400' : 'text-yellow-400'}`}>
                        IDLE — {fmtDur(entry.working_idle_sec ?? entry.duration_sec ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            }

            // Activity
            return (
              <div key={idx} className="px-5 py-3">
                <div className="flex gap-4">
                  <div className="w-2 shrink-0 flex flex-col items-center pt-1.5">
                    <div className={`w-2 h-2 rounded-full ${entry.activity_type === 'SETUP' ? 'bg-blue-400' : 'bg-green-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">
                        {entry.started_at ? fmt(entry.started_at) : '?'} →{' '}
                        {entry.ended_at
                          ? fmt(entry.ended_at)
                          : entry.status === 'RUNNING'
                          ? 'running'
                          : entry.status === 'PAUSED'
                          ? 'paused'
                          : '?'}
                      </span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        entry.activity_type === 'SETUP' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                      }`}>
                        {entry.activity_type}
                      </span>
                      <span className="text-sm font-medium text-white">{entry.item_master_no}</span>
                      <span className="text-xs text-gray-400 truncate">{entry.description}</span>
                    </div>

                    {/* Pauses / stops */}
                    {entry.pauses && entry.pauses.length > 0 && (
                      <div className="mt-2 ml-1 space-y-1.5">
                        {entry.pauses.map((p, pi) => (
                          <div key={pi} className="flex items-start gap-2 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-1" />
                            <span className="text-orange-400 font-mono">{fmt(p.paused_at)}</span>
                            <span className="text-gray-500">STOPPED</span>
                            {p.resumed_at ? (
                              <>
                                <span className="text-gray-600">→</span>
                                <span className="text-green-400 font-mono">{fmt(p.resumed_at)}</span>
                                <span className="text-gray-500">RESUMED</span>
                                <span className="text-gray-600">({fmtDur(p.duration_sec)})</span>
                              </>
                            ) : (
                              <span className="text-yellow-400">still stopped — {fmtDur(p.duration_sec)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
