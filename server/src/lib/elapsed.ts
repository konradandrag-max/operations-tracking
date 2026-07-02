import type { ActivityInterval } from '@prisma/client'

/**
 * Computes total elapsed seconds for an activity from its intervals.
 * Elapsed = sum of closed intervals + open interval (if any, using `now` as end).
 *
 * All arithmetic is in milliseconds then converted to avoid floating-point drift.
 */
export function computeElapsedSec(
  intervals: Pick<ActivityInterval, 'interval_start' | 'interval_end'>[],
  now: Date = new Date()
): number {
  let totalMs = 0
  for (const iv of intervals) {
    const start = iv.interval_start.getTime()
    const end = iv.interval_end ? iv.interval_end.getTime() : now.getTime()
    const duration = end - start
    if (duration > 0) totalMs += duration
  }
  return Math.floor(totalMs / 1000)
}

export function computeProgressPct(elapsedSec: number, standardSec: number): number {
  if (standardSec <= 0) return 0
  return (elapsedSec / standardSec) * 100
}
