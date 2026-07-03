import { Router } from 'express'
import { ActivityStatus, Plant } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const router = Router()

// Working hours: Mon–Fri 06:00–22:30
const WORK_START_H = 6
const WORK_END_H = 22
const WORK_END_M = 30
const DAILY_IDLE_LIMIT_SEC = 3 * 60 * 60 // 3 hours

function todayDateStr() {
  return new Date().toISOString().slice(0, 10)
}

function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

// Seconds of a gap [from, to) that fall within the working window of `targetDate`
function workingSecInPeriod(from: Date, to: Date, targetDate: Date): number {
  if (isWeekend(targetDate)) return 0
  const ws = new Date(targetDate)
  ws.setHours(WORK_START_H, 0, 0, 0)
  const we = new Date(targetDate)
  we.setHours(WORK_END_H, WORK_END_M, 0, 0)
  const cFrom = Math.max(from.getTime(), ws.getTime())
  const cTo   = Math.min(to.getTime(),   we.getTime())
  return cTo > cFrom ? Math.floor((cTo - cFrom) / 1000) : 0
}

// POST /api/idle/dismiss
router.post('/dismiss', async (req, res) => {
  const { machine_number, dismissed_by } = req.body as { machine_number: string; dismissed_by: string }
  if (!machine_number || !dismissed_by?.trim()) {
    return res.status(400).json({ error: 'machine_number and dismissed_by are required' })
  }
  await prisma.dailyIdleDismissal.upsert({
    where: { machine_number_date: { machine_number: machine_number.toUpperCase(), date: todayDateStr() } },
    update: { dismissed_by: dismissed_by.trim(), dismissed_at: new Date() },
    create: { machine_number: machine_number.toUpperCase(), date: todayDateStr(), dismissed_by: dismissed_by.trim() },
  })
  return res.json({ ok: true })
})

// GET /api/idle/daily-detail?date=YYYY-MM-DD&plant=KSB6
// Returns per-machine timeline: jobs, idle gaps with timestamps, pauses
router.get('/daily-detail', async (req, res) => {
  const dateStr = (req.query.date as string) || todayDateStr()
  const plant   = req.query.plant as string | undefined

  const targetDate = new Date(dateStr + 'T00:00:00')
  const dayStart   = new Date(dateStr + 'T00:00:00.000')
  const dayEnd     = new Date(dateStr + 'T23:59:59.999')
  const now        = new Date()
  const isToday    = dateStr === todayDateStr()
  const weekend    = isWeekend(targetDate)

  // Activities that overlap with this calendar day
  const activities = await prisma.activity.findMany({
    where: {
      ...(plant ? { machine: { plant: plant as Plant } } : {}),
      OR: [
        { started_at: { gte: dayStart, lte: dayEnd } },
        { ended_at:   { gte: dayStart, lte: dayEnd } },
        { started_at: { lte: dayStart }, status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] } },
        { started_at: { lte: dayStart }, ended_at: { gte: dayEnd } },
      ],
    },
    include: { machine: true, item_master: true, intervals: { orderBy: { interval_start: 'asc' } } },
    orderBy: [{ machine_number: 'asc' }, { started_at: 'asc' }],
  })

  // Group by machine
  const byMachine = new Map<string, typeof activities>()
  for (const act of activities) {
    const list = byMachine.get(act.machine_number) ?? []
    list.push(act)
    byMachine.set(act.machine_number, list)
  }

  const results = []

  for (const [machine_number, acts] of byMachine) {
    const machineInfo = acts[0].machine
    const timeline: object[] = []
    let totalWorkingIdleSec = 0

    for (let i = 0; i < acts.length; i++) {
      const act  = acts[i]
      const prev = acts[i - 1]
      const actEnd = act.ended_at ?? (isToday ? now : null)

      // Idle gap before this activity
      if (prev) {
        const gapFrom = prev.ended_at ?? now
        const gapTo   = act.started_at
        const gapSec  = Math.floor((gapTo.getTime() - gapFrom.getTime()) / 1000)
        const wkSec   = workingSecInPeriod(gapFrom, gapTo, targetDate)
        if (gapSec > 0) {
          totalWorkingIdleSec += wkSec
          timeline.push({ type: 'idle', from: gapFrom, to: gapTo, duration_sec: gapSec, working_idle_sec: wkSec })
        }
      }

      // Pauses: gaps between consecutive intervals
      const pauses: object[] = []
      const ivs = act.intervals
      for (let j = 0; j < ivs.length - 1; j++) {
        const iv   = ivs[j]
        const next = ivs[j + 1]
        if (iv.interval_end) {
          pauses.push({
            paused_at:    iv.interval_end,
            resumed_at:   next.interval_start,
            duration_sec: Math.floor((next.interval_start.getTime() - iv.interval_end.getTime()) / 1000),
          })
        }
      }
      // Currently paused
      if (act.status === ActivityStatus.PAUSED && ivs.length > 0) {
        const lastIv = ivs[ivs.length - 1]
        if (lastIv.interval_end) {
          pauses.push({
            paused_at:    lastIv.interval_end,
            resumed_at:   null,
            duration_sec: Math.floor((now.getTime() - lastIv.interval_end.getTime()) / 1000),
          })
        }
      }

      timeline.push({
        type:          'activity',
        id:            act.id,
        item_master_no: act.item_master_no,
        part_number:   act.item_master.part_number,
        description:   act.item_master.description,
        activity_type: act.activity_type,
        status:        act.status,
        started_at:    act.started_at,
        ended_at:      act.ended_at,
        pauses,
      })
    }

    // Current trailing idle (machine finished last job, now idle)
    const lastAct = acts[acts.length - 1]
    const isCurrentlyIdle = lastAct.status === ActivityStatus.ENDED && lastAct.ended_at !== null
    if (isCurrentlyIdle && isToday) {
      const gapFrom = lastAct.ended_at!
      const gapSec  = Math.floor((now.getTime() - gapFrom.getTime()) / 1000)
      const wkSec   = workingSecInPeriod(gapFrom, now, targetDate)
      totalWorkingIdleSec += wkSec
      timeline.push({ type: 'idle', from: gapFrom, to: null, duration_sec: gapSec, working_idle_sec: wkSec })
    }

    results.push({
      machine_number,
      plant:               machineInfo.plant,
      machine_description: machineInfo.description,
      total_working_idle_sec: totalWorkingIdleSec,
      flagged: !weekend && totalWorkingIdleSec > DAILY_IDLE_LIMIT_SEC,
      is_currently_idle:   isCurrentlyIdle,
      timeline,
    })
  }

  results.sort((a, b) => b.total_working_idle_sec - a.total_working_idle_sec)
  return res.json(results)
})

// GET /api/idle — currently idle machines (for Live tab alert)
router.get('/', async (_req, res) => {
  const now         = new Date()
  const todayDate   = todayDateStr()
  const targetDate  = new Date(todayDate + 'T00:00:00')
  const dayStart    = new Date(todayDate + 'T00:00:00.000')
  const weekend     = isWeekend(targetDate)

  // Machines currently RUNNING or PAUSED
  const activeMachineNos = (
    await prisma.activity.findMany({
      where: { status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] } },
      select: { machine_number: true },
      distinct: ['machine_number'],
    })
  ).map((a) => a.machine_number)

  // Last ended activity per idle machine
  const idleRows = await prisma.activity.findMany({
    where: {
      status: ActivityStatus.ENDED,
      machine_number: { notIn: activeMachineNos },
      ended_at: { not: null },
    },
    orderBy: { ended_at: 'desc' },
    distinct: ['machine_number'],
    include: { machine: true, item_master: true },
  })

  // Today's idle totals (sum of idle_before_start_sec for today's activities)
  const [todayIdleRows, dismissals] = await Promise.all([
    prisma.activity.groupBy({
      by: ['machine_number'],
      where: { started_at: { gte: dayStart }, idle_before_start_sec: { not: null } },
      _sum: { idle_before_start_sec: true },
    }),
    prisma.dailyIdleDismissal.findMany({ where: { date: todayDate } }),
  ])
  const todayIdleMap = new Map(
    todayIdleRows.map((r) => [r.machine_number, r._sum.idle_before_start_sec ?? 0])
  )
  const dismissalMap = new Map(dismissals.map((d) => [d.machine_number, d]))

  const results = idleRows.map((act) => {
    const idle_sec        = act.ended_at ? Math.floor((now.getTime() - act.ended_at.getTime()) / 1000) : 0
    const currentWkIdle   = workingSecInPeriod(act.ended_at!, now, targetDate)
    const today_idle_sec  = (todayIdleMap.get(act.machine_number) ?? 0) + idle_sec
    // For flagging, use working-hours clamped version
    const today_working_idle_sec = (todayIdleMap.get(act.machine_number) ?? 0) + currentWkIdle
    const dismissal = dismissalMap.get(act.machine_number)

    return {
      machine_number:           act.machine_number,
      plant:                    act.machine.plant,
      machine_description:      act.machine.description,
      last_item_master_no:      act.item_master_no,
      last_part_description:    act.item_master.description,
      last_activity_type:       act.activity_type,
      last_ended_at:            act.ended_at,
      idle_sec,
      today_idle_sec,
      today_working_idle_sec,
      today_idle_flagged:       !weekend && today_working_idle_sec > DAILY_IDLE_LIMIT_SEC,
      daily_idle_dismissed_by:  dismissal?.dismissed_by ?? null,
      daily_idle_dismissed_at:  dismissal?.dismissed_at ?? null,
    }
  })

  return res.json(results)
})

export default router
