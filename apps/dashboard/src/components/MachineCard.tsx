import { useState, useEffect } from 'react'
import { ActiveActivity, api } from '../api.ts'

interface Props {
  activity: ActiveActivity
  onAcknowledged: (id: string, by: string) => void
}

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function computeLiveElapsed(activity: ActiveActivity): number {
  if (!activity.open_interval_start) return activity.elapsed_sec
  const openMs = Date.now() - new Date(activity.open_interval_start).getTime()
  return activity.elapsed_sec + Math.floor(openMs / 1000)
}

export default function MachineCard({ activity, onAcknowledged }: Props) {
  const [elapsedSec, setElapsedSec] = useState(() => computeLiveElapsed(activity))
  const [ackName, setAckName] = useState('')
  const [showAckInput, setShowAckInput] = useState(false)
  const [acking, setAcking] = useState(false)

  // Animate progress bar between polls using open_interval_start from server
  useEffect(() => {
    if (!activity.open_interval_start) {
      setElapsedSec(activity.elapsed_sec)
      return
    }
    const id = setInterval(() => setElapsedSec(computeLiveElapsed(activity)), 1000)
    return () => clearInterval(id)
  }, [activity])

  const progressPct = activity.standard_sec > 0
    ? (elapsedSec / activity.standard_sec) * 100
    : 0

  const isOverdue = progressPct >= 100
  const isUnacknowledged = isOverdue && !activity.acknowledged_at
  const isAcknowledged = isOverdue && !!activity.acknowledged_at

  async function handleAcknowledge() {
    const name = ackName.trim() || 'Supervisor'
    setAcking(true)
    try {
      await api.acknowledge(activity.id, name)
      onAcknowledged(activity.id, name)
      setShowAckInput(false)
    } catch {
      // Optimistically show acknowledged; server will correct on next poll
      onAcknowledged(activity.id, name)
    } finally {
      setAcking(false)
    }
  }

  const plantColors: Record<string, string> = {
    KSB2: 'bg-blue-600',
    KSB6: 'bg-purple-600',
    KSB7: 'bg-teal-600',
  }

  return (
    <div
      className={`relative rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${
        isUnacknowledged
          ? 'border-red-500 bg-red-950 animate-flash'
          : isAcknowledged
          ? 'border-orange-600 bg-gray-800'
          : 'border-gray-700 bg-gray-800'
      }`}
    >
      {/* Plant badge + machine */}
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold text-white ${plantColors[activity.plant] ?? 'bg-gray-600'}`}>
            {activity.plant}
          </span>
          <h2 className="text-xl font-bold text-white mt-1">{activity.machine_number}</h2>
          {activity.machine_description && (
            <p className="text-sm text-gray-400">{activity.machine_description}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
            activity.activity_type === 'SETUP' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
          }`}>
            {activity.activity_type}
          </span>
          <p className={`mt-1 text-xs ${activity.status === 'RUNNING' ? 'text-green-400' : 'text-yellow-400'}`}>
            {activity.status}
          </p>
        </div>
      </div>

      {/* Part info */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">Part</p>
        <p className="font-semibold text-white">{activity.item_master_no} — {activity.part_number}</p>
        <p className="text-sm text-gray-400">{activity.part_description}</p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className={`font-mono font-bold text-lg ${isOverdue ? 'text-red-400' : 'text-white'}`}>
            {formatSec(elapsedSec)}
          </span>
          <span className="text-gray-400">/ {formatSec(activity.standard_sec)}</span>
        </div>
        <div className="h-4 w-full rounded-full bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-none ${isOverdue ? 'bg-red-500' : progressPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-0.5 text-xs text-gray-500">
          <span>0%</span>
          <span className={isOverdue ? 'text-red-400 font-bold' : ''}>
            {Math.round(progressPct)}%{isOverdue ? ' OVERDUE' : ''}
          </span>
          <span>100%</span>
        </div>
      </div>

      {/* Acknowledge section */}
      {isUnacknowledged && !showAckInput && (
        <button
          onClick={() => setShowAckInput(true)}
          className="w-full rounded-xl bg-red-600 py-3 text-base font-bold text-white active:bg-red-700"
        >
          Acknowledge / Inspected
        </button>
      )}

      {isUnacknowledged && showAckInput && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Your name"
            value={ackName}
            onChange={(e) => setAckName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAcknowledge()}
            className="flex-1 rounded-xl bg-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            autoFocus
          />
          <button
            onClick={handleAcknowledge}
            disabled={acking}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white active:bg-red-700 disabled:opacity-40"
          >
            {acking ? '...' : 'Confirm'}
          </button>
        </div>
      )}

      {isAcknowledged && (
        <p className="text-xs text-orange-400">
          Acknowledged by {activity.acknowledged_by} at{' '}
          {new Date(activity.acknowledged_at!).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
