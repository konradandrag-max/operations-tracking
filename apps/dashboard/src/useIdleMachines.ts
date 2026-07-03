import { useState, useEffect, useRef } from 'react'
import { api, IdleMachine } from './api.ts'

export function useIdleMachines() {
  const [machines, setMachines] = useState<IdleMachine[]>([])
  const [, setTick] = useState(0)
  const fetchedAt = useRef<Date | null>(null)

  useEffect(() => {
    const fetch = () =>
      api.getIdle().then((data) => {
        fetchedAt.current = new Date()
        setMachines(data)
      }).catch(() => {})

    fetch()
    const poll = setInterval(fetch, 10000)
    // Re-render every 30s so idle times update without re-fetching
    const tick = setInterval(() => setTick((t) => t + 1), 30000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [])

  // Compute live idle_sec by adding elapsed time since last fetch
  const now = Date.now()
  const offsetMs = fetchedAt.current ? now - fetchedAt.current.getTime() : 0

  return machines.map((m) => ({
    ...m,
    idle_sec: m.idle_sec + Math.floor(offsetMs / 1000),
  }))
}
