import { useState } from 'react'
import { IdleMachine, api } from '../api.ts'

interface Props {
  machine: IdleMachine
  onDismissed: (machine_number: string, by: string) => void
}

function formatMin(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function IdleCard({ machine, onDismissed }: Props) {
  const [showDismiss, setShowDismiss] = useState(false)
  const [name, setName] = useState('')
  const [dismissing, setDismissing] = useState(false)

  const min = Math.floor(machine.idle_sec / 60)
  const isDailyFlagged = machine.today_idle_flagged && !machine.daily_idle_dismissed_by

  const idleColor =
    min >= 45
      ? { border: 'border-red-600', bg: 'bg-red-950', text: 'text-red-400' }
      : min >= 30
      ? { border: 'border-orange-500', bg: 'bg-orange-950', text: 'text-orange-400' }
      : min >= 15
      ? { border: 'border-yellow-500', bg: 'bg-yellow-950', text: 'text-yellow-400' }
      : { border: 'border-gray-700', bg: 'bg-gray-800', text: 'text-gray-400' }

  const plantColors: Record<string, string> = {
    KSB2: 'bg-blue-600',
    KSB6: 'bg-purple-600',
    KSB7: 'bg-teal-600',
  }

  async function handleDismiss() {
    if (!name.trim()) return
    setDismissing(true)
    try {
      await api.dismissDailyIdle(machine.machine_number, name.trim())
      onDismissed(machine.machine_number, name.trim())
      setShowDismiss(false)
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 ${idleColor.border} ${idleColor.bg}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${plantColors[machine.plant] ?? 'bg-gray-600'}`}>
            {machine.plant}
          </span>
          <h2 className="text-lg font-bold text-white mt-1">{machine.machine_number}</h2>
          {machine.machine_description && (
            <p className="text-xs text-gray-400">{machine.machine_description}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`text-2xl font-mono font-bold ${idleColor.text}`}>{formatMin(machine.idle_sec)}</span>
          <p className="text-xs text-gray-500 mt-0.5">idle now</p>
        </div>
      </div>

      {/* Last job */}
      <div>
        <p className="text-xs text-gray-500">Last job</p>
        <p className="text-sm text-gray-300 font-medium">{machine.last_item_master_no}</p>
        <p className="text-xs text-gray-400">{machine.last_part_description}</p>
        <p className="text-xs text-gray-500 mt-1">
          {machine.last_activity_type} ended {new Date(machine.last_ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Daily idle total */}
      <div className={`rounded-xl px-3 py-2 ${isDailyFlagged ? 'bg-red-900/60 border border-red-600' : 'bg-gray-700/50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Total idle today</p>
            <p className={`text-lg font-mono font-bold ${isDailyFlagged ? 'text-red-400' : 'text-gray-300'}`}>
              {formatMin(machine.today_idle_sec)}
              <span className="text-xs font-normal text-gray-500 ml-1">/ 1h 30m allowed</span>
            </p>
          </div>
          {isDailyFlagged && <span className="text-xs font-bold text-red-400 animate-pulse">EXCEEDED</span>}
        </div>

        {isDailyFlagged && !showDismiss && (
          <button
            onClick={() => setShowDismiss(true)}
            className="mt-2 w-full rounded-lg bg-red-700 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
          >
            Dismiss Warning
          </button>
        )}

        {isDailyFlagged && showDismiss && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDismiss()}
              className="flex-1 rounded-lg bg-gray-700 px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              autoFocus
            />
            <button
              onClick={handleDismiss}
              disabled={dismissing || !name.trim()}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {dismissing ? '…' : 'OK'}
            </button>
            <button
              onClick={() => setShowDismiss(false)}
              className="rounded-lg bg-gray-600 px-2 py-1.5 text-xs text-gray-300"
            >
              ✕
            </button>
          </div>
        )}

        {machine.daily_idle_dismissed_by && (
          <p className="mt-1 text-xs text-orange-400">
            Dismissed by {machine.daily_idle_dismissed_by} at{' '}
            {new Date(machine.daily_idle_dismissed_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
