import { useState, useEffect } from 'react'
import { api, MachineDailyDetail, Plant } from '../api.ts'

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const PLANTS: (Plant | 'ALL')[] = ['ALL', 'KSB2', 'KSB6', 'KSB7']
const PLANT_COLORS: Record<string, string> = { KSB2: 'bg-blue-600', KSB6: 'bg-purple-600', KSB7: 'bg-teal-600' }

interface Props {
  defaultPlant?: Plant | 'ALL'
}

export default function IdleTimesView({ defaultPlant = 'ALL' }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [plant, setPlant] = useState<Plant | 'ALL'>(defaultPlant)
  const [data, setData] = useState<MachineDailyDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    api.getDailyDetail(date, plant !== 'ALL' ? plant : undefined)
      .then((d) => Array.isArray(d) ? setData(d) : setData([]))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [date, plant])

  function toggleExpand(mn: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(mn) ? next.delete(mn) : next.add(mn)
      return next
    })
  }

  const flagged = data.filter((m) => m.flagged)
  const normal  = data.filter((m) => !m.flagged)

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex rounded-xl bg-gray-800 border border-gray-700 overflow-hidden">
          {PLANTS.map((p) => (
            <button
              key={p}
              onClick={() => setPlant(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                plant === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {loading && <span className="text-sm text-gray-500">Loading…</span>}
      </div>

      {/* Flagged machines (>3h idle) */}
      {flagged.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-3">
            ⚠ Exceeded 3h Idle — {flagged.length} machine{flagged.length > 1 ? 's' : ''}
          </h2>
          <div className="space-y-2">
            {flagged.map((m) => (
              <MachineTimelineCard key={m.machine_number} machine={m} expanded={expanded.has(m.machine_number)} onToggle={() => toggleExpand(m.machine_number)} />
            ))}
          </div>
        </div>
      )}

      {/* Normal machines */}
      {normal.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
            All Machines — {normal.length} within limit
          </h2>
          <div className="space-y-2">
            {normal.map((m) => (
              <MachineTimelineCard key={m.machine_number} machine={m} expanded={expanded.has(m.machine_number)} onToggle={() => toggleExpand(m.machine_number)} />
            ))}
          </div>
        </div>
      )}

      {!loading && data.length === 0 && (
        <p className="text-center text-gray-500 py-12">No activity recorded for this date.</p>
      )}
    </div>
  )
}

function MachineTimelineCard({ machine, expanded, onToggle }: { machine: MachineDailyDetail; expanded: boolean; onToggle: () => void }) {
  const PLANT_COLORS: Record<string, string> = { KSB2: 'bg-blue-600', KSB6: 'bg-purple-600', KSB7: 'bg-teal-600' }
  const borderClass = machine.flagged ? 'border-red-600' : machine.is_currently_idle ? 'border-yellow-600' : 'border-gray-700'

  return (
    <div className={`rounded-2xl border-2 bg-gray-800 overflow-hidden ${borderClass}`}>
      {/* Header — always visible */}
      <button className="w-full text-left px-5 py-4 flex items-center justify-between gap-4" onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${PLANT_COLORS[machine.plant] ?? 'bg-gray-600'}`}>
            {machine.plant}
          </span>
          <span className="font-bold text-white">{machine.machine_number}</span>
          {machine.machine_description && (
            <span className="text-sm text-gray-400 truncate hidden sm:block">{machine.machine_description}</span>
          )}
          {machine.is_currently_idle && (
            <span className="shrink-0 text-xs font-semibold text-yellow-400 bg-yellow-900/50 px-2 py-0.5 rounded-full">IDLE NOW</span>
          )}
          {machine.flagged && (
            <span className="shrink-0 text-xs font-bold text-red-400 bg-red-900/50 px-2 py-0.5 rounded-full animate-pulse">⚠ EXCEEDED</span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className={`text-base font-mono font-bold ${machine.flagged ? 'text-red-400' : 'text-gray-300'}`}>
            {fmtDur(machine.total_working_idle_sec)} idle
          </span>
          <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Timeline — expanded */}
      {expanded && (
        <div className="border-t border-gray-700 px-5 py-4 space-y-0">
          {machine.timeline.length === 0 && (
            <p className="text-sm text-gray-500">No entries for this period.</p>
          )}
          {machine.timeline.map((entry, idx) => {
            if (entry.type === 'idle') {
              return (
                <div key={idx} className="flex gap-4 py-2.5 border-b border-gray-700/50">
                  <div className="w-2 shrink-0 flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-0.5" />
                    {idx < machine.timeline.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">
                        {entry.from ? fmt(entry.from) : '?'} → {entry.to ? fmt(entry.to) : 'now'}
                      </span>
                      <span className={`text-sm font-bold ${(entry.working_idle_sec ?? 0) > 10800 ? 'text-red-400' : 'text-yellow-400'}`}>
                        IDLE {fmtDur(entry.duration_sec ?? 0)}
                      </span>
                      {(entry.working_idle_sec ?? 0) > 0 && entry.duration_sec !== entry.working_idle_sec && (
                        <span className="text-xs text-gray-500">({fmtDur(entry.working_idle_sec ?? 0)} in working hours)</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            // Activity entry
            return (
              <div key={idx} className="flex gap-4 py-2.5 border-b border-gray-700/50">
                <div className="w-2 shrink-0 flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full mt-0.5 ${entry.activity_type === 'SETUP' ? 'bg-blue-400' : 'bg-green-400'}`} />
                  {idx < machine.timeline.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">
                      {entry.started_at ? fmt(entry.started_at) : '?'} → {entry.ended_at ? fmt(entry.ended_at) : (entry.status === 'RUNNING' ? 'running' : entry.status === 'PAUSED' ? 'paused' : '?')}
                    </span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${entry.activity_type === 'SETUP' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'}`}>
                      {entry.activity_type}
                    </span>
                    <span className="text-sm font-medium text-white">{entry.item_master_no}</span>
                    <span className="text-xs text-gray-400 truncate">{entry.description}</span>
                  </div>

                  {/* Pauses within this activity */}
                  {entry.pauses && entry.pauses.length > 0 && (
                    <div className="mt-2 ml-2 space-y-1">
                      {entry.pauses.map((p, pi) => (
                        <div key={pi} className="flex items-center gap-2 text-xs text-orange-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                          <span className="font-mono">
                            {fmt(p.paused_at)} STOPPED
                          </span>
                          {p.resumed_at ? (
                            <span className="font-mono text-green-400">→ {fmt(p.resumed_at)} RESUMED ({fmtDur(p.duration_sec)})</span>
                          ) : (
                            <span className="text-yellow-400">— still stopped ({fmtDur(p.duration_sec)})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
