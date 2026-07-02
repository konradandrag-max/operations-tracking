/**
 * Minimal offline queue for POST calls over flaky factory Wi-Fi.
 * Failed requests are retried with exponential backoff (max 30s).
 * Not persisted to localStorage — if the tab is closed, queued calls are lost.
 * For v2, persist to IndexedDB if this proves insufficient.
 */
import { useRef, useCallback } from 'react'

type QueuedCall = () => Promise<unknown>

const MAX_DELAY_MS = 30_000
const BASE_DELAY_MS = 1_000

export function useOfflineQueue() {
  const retryTimerRef = useRef<number | null>(null)
  const queueRef = useRef<QueuedCall[]>([])

  const flush = useCallback(async (attempt = 0) => {
    if (queueRef.current.length === 0) return

    const call = queueRef.current[0]
    try {
      await call()
      queueRef.current.shift()
      if (queueRef.current.length > 0) flush(0)
    } catch {
      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      retryTimerRef.current = window.setTimeout(() => flush(attempt + 1), delay)
    }
  }, [])

  const enqueue = useCallback(
    (call: QueuedCall) => {
      queueRef.current.push(call)
      if (queueRef.current.length === 1) flush(0)
    },
    [flush]
  )

  return { enqueue }
}
