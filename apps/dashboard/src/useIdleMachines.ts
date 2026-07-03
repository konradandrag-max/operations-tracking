import { useState, useEffect, useRef, useCallback } from 'react'
import { api, IdleMachine } from './api.ts'

export function useIdleMachines() {
  const [machines, setMachines] = useState<IdleMachine[]>([])
  const [, setTick] = useState(0)
  const fetchedAt = useRef<Date | null>(null)

  const refresh = useCallback(() =>
    api.getIdle().then((data) => {
      if (Array.isArray(data)) {
        fetchedAt.current = new Date()
        setMachines(data)
      }
    }).catch(() => {}),
  [])

  useEffect(() => {
    refresh()
    const poll = setInterval(refresh, 10000)
    const tick = setInterval(() => setTick((t) => t + 1), 30000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [refresh])

  const offsetSec = fetchedAt.current ? Math.floor((Date.now() - fetchedAt.current.getTime()) / 1000) : 0

  const live = machines.map((m) => ({
    ...m,
    idle_sec:               m.idle_sec + offsetSec,
    today_idle_sec:         m.today_idle_sec + offsetSec,
    today_working_idle_sec: (m.today_working_idle_sec ?? 0) + offsetSec,
    today_idle_flagged:     m.today_idle_flagged || ((m.today_working_idle_sec ?? 0) + offsetSec) > 3 * 60 * 60,
  }))

  return { machines: live, refresh }
}
