/**
 * Polls /api/activities/active every 5 seconds.
 * Progress-bar animation happens client-side between polls using open_interval_start
 * from the server response — avoids needing WebSockets for v1.
 * NOTE: Socket.io is a drop-in upgrade path if 5-second staleness proves too slow.
 */
import { useState, useEffect, useRef } from 'react'
import { api, ActiveActivity } from './api.ts'

const POLL_INTERVAL_MS = 5_000

export function useActiveActivities() {
  const [activities, setActivities] = useState<ActiveActivity[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function poll() {
      try {
        const data = await api.getActive()
        if (mountedRef.current) {
          setActivities(data)
          setLastUpdated(new Date())
          setError(null)
        }
      } catch {
        if (mountedRef.current) setError('Connection lost — retrying...')
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [])

  return { activities, lastUpdated, error, setActivities }
}
