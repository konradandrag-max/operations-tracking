/**
 * Toggle behavior: switching the Setup/Cycle toggle while an activity is RUNNING or PAUSED
 * auto-ends the current activity and starts the new type fresh.
 * This is a documented assumption — see /docs/item-master-csv-format.md and the spec.
 */
import { useState, useEffect, useRef } from 'react'
import { api, Machine, ItemMaster, Activity } from '../api.ts'
import { useOfflineQueue } from '../useOfflineQueue.ts'

type ActivityType = 'SETUP' | 'CYCLE'

interface Props {
  machine: Machine
  itemMaster: ItemMaster
  onNewPart: () => void
  onChangeMachine: () => void
}

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function TrackingScreen({ machine, itemMaster, onNewPart, onChangeMachine }: Props) {
  const [activityType, setActivityType] = useState<ActivityType>('SETUP')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openIntervalStartRef = useRef<Date | null>(null)
  const baseElapsedRef = useRef(0)
  const { enqueue } = useOfflineQueue()

  // Tick the clock every second when running
  useEffect(() => {
    if (activity?.status !== 'RUNNING') return
    const id = setInterval(() => {
      const openMs = openIntervalStartRef.current
        ? Date.now() - openIntervalStartRef.current.getTime()
        : 0
      setElapsedSec(Math.floor(baseElapsedRef.current + openMs / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [activity?.status])

  const standardSec =
    activityType === 'SETUP' ? itemMaster.standard_setup_time_sec : itemMaster.standard_cycle_time_sec

  const progressPct = standardSec > 0 ? Math.min((elapsedSec / standardSec) * 100, 100) : 0

  const isRunning = activity?.status === 'RUNNING'
  const isPaused = activity?.status === 'PAUSED'
  const isEnded = activity?.status === 'ENDED'

  async function handleToggleType(newType: ActivityType) {
    if (newType === activityType) return
    setError(null)

    // Auto-end current activity before switching type
    if (activity && !isEnded) {
      setLoading(true)
      try {
        await api.endActivity(activity.id)
      } catch {
        // Enqueue for retry if offline
        enqueue(() => api.endActivity(activity.id))
      }
    }

    setActivity(null)
    setElapsedSec(0)
    baseElapsedRef.current = 0
    openIntervalStartRef.current = null
    setActivityType(newType)
    setLoading(false)
  }

  async function handleStart() {
    setError(null)
    setLoading(true)
    try {
      if (!activity || isEnded) {
        // First start — create the activity
        const created = await api.createActivity({
          machine_number: machine.machine_number,
          item_master_no: itemMaster.item_master_no,
          activity_type: activityType,
        })
        // Find the open interval that was created
        const openIv = created.intervals.find((iv) => !iv.interval_end)
        openIntervalStartRef.current = openIv ? new Date(openIv.interval_start) : new Date()
        baseElapsedRef.current = 0
        setActivity(created)
      } else if (isPaused) {
        await api.startActivity(activity.id)
        openIntervalStartRef.current = new Date()
        setActivity({ ...activity, status: 'RUNNING' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    if (!activity || !isRunning) return
    setError(null)
    setLoading(true)
    try {
      await api.stopActivity(activity.id)
      // Freeze elapsed at current value
      const openMs = openIntervalStartRef.current
        ? Date.now() - openIntervalStartRef.current.getTime()
        : 0
      baseElapsedRef.current = Math.floor(baseElapsedRef.current + openMs / 1000)
      openIntervalStartRef.current = null
      setActivity({ ...activity, status: 'PAUSED' })
    } catch (err) {
      // Queue the stop for when connectivity returns
      enqueue(() => api.stopActivity(activity.id))
      setError('Network issue — will retry automatically')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnd() {
    if (!activity || isEnded) return
    setError(null)
    setLoading(true)
    try {
      await api.endActivity(activity.id)
      const openMs = openIntervalStartRef.current
        ? Date.now() - openIntervalStartRef.current.getTime()
        : 0
      baseElapsedRef.current = Math.floor(baseElapsedRef.current + openMs / 1000)
      openIntervalStartRef.current = null
      setActivity({ ...activity, status: 'ENDED' })
    } catch (err) {
      enqueue(() => api.endActivity(activity.id))
      setError('Network issue — will retry automatically')
    } finally {
      setLoading(false)
    }
  }

  const isOverdue = elapsedSec > standardSec && standardSec > 0

  return (
    <div className="flex min-h-screen flex-col px-4 py-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">Machine</p>
          <p className="text-lg font-bold text-white">{machine.machine_number}</p>
          <p className="text-sm text-gray-400">{machine.plant}</p>
        </div>
        <button
          onClick={onChangeMachine}
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-300 active:bg-gray-600"
        >
          Change Machine
        </button>
      </div>

      {/* Part info */}
      <div className="rounded-2xl bg-gray-800 p-5">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Part</p>
        <p className="text-xl font-bold text-white">{itemMaster.item_master_no}</p>
        <p className="text-gray-300">{itemMaster.description}</p>
        <p className="text-sm text-gray-500 mt-1">PN: {itemMaster.part_number}</p>
      </div>

      {/* Activity type toggle */}
      <div className="flex rounded-2xl bg-gray-800 p-1 gap-1">
        {(['SETUP', 'CYCLE'] as const).map((type) => (
          <button
            key={type}
            onClick={() => handleToggleType(type)}
            className={`flex-1 rounded-xl py-4 text-xl font-bold transition-colors ${
              activityType === type
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 active:bg-gray-700'
            }`}
          >
            {type}
            <span className="block text-xs font-normal mt-0.5 opacity-70">
              Std: {formatSec(type === 'SETUP' ? itemMaster.standard_setup_time_sec : itemMaster.standard_cycle_time_sec)}
            </span>
          </button>
        ))}
      </div>

      {/* Progress bar + timer */}
      <div className={`rounded-2xl p-6 ${isOverdue ? 'bg-red-900/40 border border-red-700' : 'bg-gray-800'}`}>
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Elapsed</p>
            <p className={`text-5xl font-mono font-bold ${isOverdue ? 'text-red-400' : 'text-white'}`}>
              {formatSec(elapsedSec)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-gray-500">Standard</p>
            <p className="text-2xl font-mono text-gray-400">{formatSec(standardSec)}</p>
          </div>
        </div>
        <div className="h-5 w-full rounded-full bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isOverdue ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>0%</span>
          <span className={isOverdue ? 'text-red-400 font-bold' : ''}>
            {Math.round(progressPct)}%{isOverdue ? ' OVERDUE' : ''}
          </span>
          <span>100%</span>
        </div>
      </div>

      {/* Status badge */}
      {activity && (
        <div className="text-center">
          <span className={`inline-block rounded-full px-4 py-1 text-sm font-medium ${
            isRunning ? 'bg-green-800 text-green-200' :
            isPaused ? 'bg-yellow-800 text-yellow-200' :
            'bg-gray-700 text-gray-400'
          }`}>
            {activity.status}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-900/60 border border-red-500 px-4 py-3 text-red-200 text-base">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mt-auto">
        {(!activity || isEnded) && (
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex-1 rounded-2xl bg-green-600 py-6 text-2xl font-bold text-white active:bg-green-700 disabled:opacity-40"
          >
            {loading ? '...' : 'Start'}
          </button>
        )}

        {isRunning && (
          <>
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex-1 rounded-2xl bg-yellow-600 py-6 text-2xl font-bold text-white active:bg-yellow-700 disabled:opacity-40"
            >
              {loading ? '...' : 'Stop'}
            </button>
            <button
              onClick={handleEnd}
              disabled={loading}
              className="flex-1 rounded-2xl bg-red-700 py-6 text-2xl font-bold text-white active:bg-red-800 disabled:opacity-40"
            >
              {loading ? '...' : 'End'}
            </button>
          </>
        )}

        {isPaused && (
          <>
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex-1 rounded-2xl bg-green-600 py-6 text-2xl font-bold text-white active:bg-green-700 disabled:opacity-40"
            >
              {loading ? '...' : 'Resume'}
            </button>
            <button
              onClick={handleEnd}
              disabled={loading}
              className="flex-1 rounded-2xl bg-red-700 py-6 text-2xl font-bold text-white active:bg-red-800 disabled:opacity-40"
            >
              {loading ? '...' : 'End'}
            </button>
          </>
        )}
      </div>

      {/* New part / ended state */}
      {isEnded && (
        <button
          onClick={onNewPart}
          className="w-full rounded-2xl bg-blue-600 py-6 text-2xl font-bold text-white active:bg-blue-700"
        >
          New Part
        </button>
      )}

      {activity && !isEnded && (
        <button
          onClick={onNewPart}
          className="w-full rounded-xl border border-gray-600 py-4 text-lg text-gray-400 active:bg-gray-800"
        >
          Switch Part (ends current activity)
        </button>
      )}
    </div>
  )
}
