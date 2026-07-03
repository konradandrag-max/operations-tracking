import { Router } from 'express'
import { ActivityStatus, Plant } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const router = Router()

const WORK_START_H  = 6
const WORK_END_H    = 22
const WORK_END_M    = 30
const DAILY_IDLE_LIMIT_SEC = 3 * 60 * 60

function todayDateStr() {
  return new Date().toISOString().slice(0, 10)
}

function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

function workingSecInPeriod(from: Date, to: Date, targetDate: Date): number {
  if (isWeekend(targetDate)) return 0
  const ws = new Date(targetDate); ws.setHours(WORK_START_H, 0, 0, 0)
  const we = new Date(targetDate); we.setHours(WORK_END_H, WORK_END_M, 0, 0)
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

// GET /api/idle/daily-detail?date=YYYY-MM-DD&plants=KSB2,KSB6
// Returns ALL registered machines in the given plant(s), idle counted from 6am
router.get('/daily-detail', async (req, res) => {
  const dateStr     = (req.query.date   as string) || todayDateStr()
  const plantsParam = (req.query.plants as string) || ''

  const plantList  = plantsParam ? plantsParam.split(',').map((p) => p.trim()).filter(Boolean) as Plant[] : []
  const targetDate = new Date(dateStr + 'T00:00:00')
  const dayStart   = new Date(dateStr + 'T00:00:00.000')
  const dayEnd     = new Date(dateStr + 'T23:59:59.999')
  const now        = new Date()
  const isToday    = dateStr === todayDateStr()
  const weekend    = isWeekend(targetDate)

  const ws = new Date(targetDate); ws.setHours(WORK_START_H, 0, 0, 0)
  const we = new Date(targetDate); we.setHours(WORK_END_H,   WORK_END_M, 0, 0)

  // All registered machines in the requested plants (including inactive — just not yet used)
  const allMachines = await prisma.machine.findMany({
    where: { ...(plantList.length > 0 ? { plant: { in: plantList } } : {}) },
    orderBy: { machine_number: 'asc' },
  })

  if (allMachines.length === 0) return res.json([])

  // Activities that overlap with this calendar day
  const activities = await prisma.activity.findMany({
    where: {
      machine_number: { in: allMachines.map((m) => m.machine_number) },
      OR: [
        { started_at: { gte: dayStart, lte: dayEnd } },
        { ended_at:   { gte: dayStart, lte: dayEnd } },
        { started_at: { lte: dayStart }, status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] } },
        { started_at: { lte: dayStart }, ended_at: { gte: dayEnd } },
      ],
    },
    include: { item_master: true, intervals: { orderBy: { interval_start: 'asc' } } },
    orderBy: [{ machine_number: 'asc' }, { started_at: 'asc' }],
  })

  const byMachine = new Map<string, typeof activities>()
  for (const act of activities) {
    const list = byMachine.get(act.machine_number) ?? []
    list.push(act)
    byMachine.set(act.machine_number, list)
  }

  const endOfPeriod = isToday
    ? (now < we ? now : we)
    : we

  const results = allMachines.map((machine) => {
    const acts = byMachine.get(machine.machine_number) ?? []
    const timeline: object[] = []
    let totalWorkingIdleSec = 0
    let cursor = ws // start counting from 06:00

    for (let i = 0; i < acts.length; i++) {
      const act = acts[i]

      // Idle gap from cursor to this activity's start (captures pre-shift and between-job idle)
      if (act.started_at > cursor) {
        const gapSec = Math.floor((act.started_at.getTime() - cursor.getTime()) / 1000)
        const wkSec  = workingSecInPeriod(cursor, act.started_at, targetDate)
        if (wkSec > 0) {
          totalWorkingIdleSec += wkSec
          timeline.push({ type: 'idle', from: cursor, to: act.started_at, duration_sec: gapSec, working_idle_sec: wkSec })
        }
        cursor = act.started_at
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
        type:           'activity',
        id:             act.id,
        item_master_no: act.item_master_no,
        part_number:    act.item_master.part_number,
        description:    act.item_master.description,
        activity_type:  act.activity_type,
        status:         act.status,
        started_at:     act.started_at,
        ended_at:       act.ended_at,
        pauses,
      })

      cursor = act.ended_at && act.ended_at > cursor ? act.ended_at : (act.status !== ActivityStatus.ENDED ? endOfPeriod : cursor)
    }

    // Trailing idle: from cursor to endOfPeriod (i.e. now or 10:30pm)
    if (cursor < endOfPeriod) {
      const gapSec = Math.floor((endOfPeriod.getTime() - cursor.getTime()) / 1000)
      const wkSec  = workingSecInPeriod(cursor, endOfPeriod, targetDate)
      if (wkSec > 0) {
        totalWorkingIdleSec += wkSec
        // to: null means "ongoing" (machine still idle now)
        const isOngoing = isToday && endOfPeriod.getTime() === now.getTime()
        timeline.push({ type: 'idle', from: cursor, to: isOngoing ? null : endOfPeriod, duration_sec: gapSec, working_idle_sec: wkSec })
      }
    }

    const lastAct = acts[acts.length - 1]
    const isCurrentlyIdle = !lastAct || (lastAct.status === ActivityStatus.ENDED && lastAct.ended_at !== null)

    return {
      machine_number:          machine.machine_number,
      plant:                   machine.plant,
      machine_description:     machine.description,
      total_working_idle_sec:  totalWorkingIdleSec,
      flagged:                 !weekend && totalWorkingIdleSec > DAILY_IDLE_LIMIT_SEC,
      is_currently_idle:       isCurrentlyIdle,
      has_no_activity:         acts.length === 0,
      timeline,
    }
  })

  results.sort((a, b) => b.total_working_idle_sec - a.total_working_idle_sec)
  return res.json(results)
})

// GET /api/idle — currently idle machines (for Live tab alert)
router.get('/', async (_req, res) => {
  const now        = new Date()
  const todayDate  = todayDateStr()
  const targetDate = new Date(todayDate + 'T00:00:00')
  const dayStart   = new Date(todayDate + 'T00:00:00.000')
  const weekend    = isWeekend(targetDate)

  const ws = new Date(targetDate); ws.setHours(WORK_START_H, 0, 0, 0)

  const activeMachineNos = (
    await prisma.activity.findMany({
      where: { status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] } },
      select: { machine_number: true },
      distinct: ['machine_number'],
    })
  ).map((a) => a.machine_number)

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

  const [todayIdleRows, dismissals] = await Promise.all([
    prisma.activity.groupBy({
      by: ['machine_number'],
      where: { started_at: { gte: dayStart }, idle_before_start_sec: { not: null } },
      _sum: { idle_before_start_sec: true },
    }),
    prisma.dailyIdleDismissal.findMany({ where: { date: todayDate } }),
  ])
  const todayIdleMap  = new Map(todayIdleRows.map((r) => [r.machine_number, r._sum.idle_before_start_sec ?? 0]))
  const dismissalMap  = new Map(dismissals.map((d) => [d.machine_number, d]))

  const results = idleRows.map((act) => {
    const idle_sec             = act.ended_at ? Math.floor((now.getTime() - act.ended_at.getTime()) / 1000) : 0
    const currentWkIdle        = act.ended_at ? workingSecInPeriod(ws > act.ended_at ? ws : act.ended_at, now, targetDate) : 0
    const today_idle_sec       = (todayIdleMap.get(act.machine_number) ?? 0) + idle_sec
    const today_working_idle_sec = (todayIdleMap.get(act.machine_number) ?? 0) + currentWkIdle
    const dismissal            = dismissalMap.get(act.machine_number)

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
