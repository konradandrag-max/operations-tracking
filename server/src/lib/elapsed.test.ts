import { describe, it, expect } from 'vitest'
import { computeElapsedSec, computeProgressPct } from './elapsed.js'

const t = (iso: string) => new Date(iso)

describe('computeElapsedSec', () => {
  it('returns 0 for empty intervals', () => {
    expect(computeElapsedSec([])).toBe(0)
  })

  it('sums a single closed interval', () => {
    const intervals = [{ interval_start: t('2024-01-01T10:00:00Z'), interval_end: t('2024-01-01T10:01:00Z') }]
    expect(computeElapsedSec(intervals)).toBe(60)
  })

  it('handles an open interval using `now`', () => {
    const now = t('2024-01-01T10:01:30Z')
    const intervals = [{ interval_start: t('2024-01-01T10:00:00Z'), interval_end: null }]
    expect(computeElapsedSec(intervals, now)).toBe(90)
  })

  it('sums multiple closed intervals correctly', () => {
    const intervals = [
      { interval_start: t('2024-01-01T10:00:00Z'), interval_end: t('2024-01-01T10:01:00Z') }, // 60s
      { interval_start: t('2024-01-01T10:02:00Z'), interval_end: t('2024-01-01T10:02:30Z') }, // 30s
    ]
    expect(computeElapsedSec(intervals)).toBe(90)
  })

  it('sums closed + open intervals', () => {
    const now = t('2024-01-01T10:05:00Z')
    const intervals = [
      { interval_start: t('2024-01-01T10:00:00Z'), interval_end: t('2024-01-01T10:01:00Z') }, // 60s
      { interval_start: t('2024-01-01T10:03:00Z'), interval_end: null },                       // 120s open
    ]
    expect(computeElapsedSec(intervals, now)).toBe(180)
  })

  it('ignores intervals where end is before start (clock skew guard)', () => {
    const intervals = [
      { interval_start: t('2024-01-01T10:01:00Z'), interval_end: t('2024-01-01T10:00:00Z') }, // negative → 0
    ]
    expect(computeElapsedSec(intervals)).toBe(0)
  })

  it('floors fractional seconds (millisecond precision)', () => {
    const intervals = [
      { interval_start: t('2024-01-01T10:00:00.000Z'), interval_end: t('2024-01-01T10:00:00.999Z') },
    ]
    // 999ms → floor → 0
    expect(computeElapsedSec(intervals)).toBe(0)
  })
})

describe('computeProgressPct', () => {
  it('returns 0 when standard is 0', () => {
    expect(computeProgressPct(60, 0)).toBe(0)
  })

  it('calculates 50% correctly', () => {
    expect(computeProgressPct(30, 60)).toBe(50)
  })

  it('returns exactly 100% at boundary', () => {
    expect(computeProgressPct(60, 60)).toBe(100)
  })

  it('allows progress to exceed 100% (overdue)', () => {
    expect(computeProgressPct(120, 60)).toBe(200)
  })
})
