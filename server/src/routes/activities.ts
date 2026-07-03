import { Router } from 'express'
import { ActivityStatus, ActivityType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { computeElapsedSec, computeProgressPct } from '../lib/elapsed.js'

const router = Router()

// GET /api/activities/active — polled by dashboard every 5 seconds
// NOTE: Socket.io is a drop-in upgrade path if 5-second polling proves too slow.
const DAILY_IDLE_LIMIT_SEC = 3 * 60 * 60 // 3 hours — weekdays only

function isWeekend(d: Date) { const w = d.getDay(); return w === 0 || w === 6 }

router.get('/active', async (_req, res) => {
  const now = new Date()

  // Today's idle totals per machine
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayIdleRows = await prisma.activity.groupBy({
    by: ['machine_number'],
    where: { started_at: { gte: todayStart }, idle_before_start_sec: { not: null } },
    _sum: { idle_before_start_sec: true },
  })
  const todayIdleMap = new Map(
    todayIdleRows.map((r) => [r.machine_number, r._sum.idle_before_start_sec ?? 0])
  )

  const activities = await prisma.activity.findMany({
    where: {
      status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] },
    },
    include: {
      machine: true,
      item_master: true,
      intervals: true,
    },
    orderBy: { started_at: 'asc' },
  })

  // Mark overdue activities that haven't been flagged yet
  const overdueIds: string[] = []
  const results = activities.map((act) => {
    const standardSec =
      act.activity_type === ActivityType.SETUP
        ? act.item_master.standard_setup_time_sec
        : act.item_master.standard_cycle_time_sec

    // elapsed_sec includes only CLOSED intervals — client adds the open interval live
    const closedIntervals = act.intervals.filter((iv) => iv.interval_end !== null)
    const elapsedSec = computeElapsedSec(closedIntervals, now)
    const fullElapsedSec = computeElapsedSec(act.intervals, now)
    const progressPct = computeProgressPct(fullElapsedSec, standardSec)
    const isOverdue = progressPct >= 100

    if (isOverdue && !act.overdue_flag) {
      overdueIds.push(act.id)
    }

    return {
      id: act.id,
      machine_number: act.machine_number,
      plant: act.machine.plant,
      machine_description: act.machine.description,
      item_master_no: act.item_master_no,
      part_number: act.item_master.part_number,
      part_description: act.item_master.description,
      activity_type: act.activity_type,
      status: act.status,
      started_at: act.started_at,
      elapsed_sec: elapsedSec, // closed intervals only — client adds open interval
      standard_sec: standardSec,
      progress_pct: progressPct,
      overdue_flag: isOverdue || act.overdue_flag,
      acknowledged_by: act.acknowledged_by,
      acknowledged_at: act.acknowledged_at,
      // Open interval start lets the client animate the progress bar between polls
      open_interval_start: act.intervals.find((iv) => !iv.interval_end)?.interval_start ?? null,
      idle_before_start_sec: act.idle_before_start_sec,
      today_idle_sec: todayIdleMap.get(act.machine_number) ?? 0,
      today_idle_flagged: !isWeekend(now) && (todayIdleMap.get(act.machine_number) ?? 0) > DAILY_IDLE_LIMIT_SEC,
    }
  })

  // Persist newly overdue flags in background (fire-and-forget, non-blocking)
  if (overdueIds.length > 0) {
    prisma.activity
      .updateMany({ where: { id: { in: overdueIds } }, data: { overdue_flag: true } })
      .catch((err: Error) => console.error('Failed to set overdue_flag:', err))
  }

  return res.json(results)
})

// POST /api/activities — create a new activity + open first interval
router.post('/', async (req, res) => {
  const { machine_number, item_master_no, activity_type } = req.body as {
    machine_number: string
    item_master_no: string
    activity_type: ActivityType
  }

  if (!machine_number || !item_master_no || !activity_type) {
    return res.status(400).json({ error: 'machine_number, item_master_no, and activity_type are required' })
  }

  if (!Object.values(ActivityType).includes(activity_type)) {
    return res.status(400).json({ error: 'activity_type must be SETUP or CYCLE' })
  }

  const [machine, item] = await Promise.all([
    prisma.machine.findUnique({ where: { machine_number: machine_number.toUpperCase() } }),
    prisma.itemMaster.findUnique({ where: { item_master_no: item_master_no.toUpperCase() } }),
  ])

  if (!machine) return res.status(404).json({ error: 'Machine not found', code: 'MACHINE_NOT_FOUND' })
  if (!item) return res.status(404).json({ error: 'Item master not found', code: 'ITEM_MASTER_NOT_FOUND' })

  const now = new Date()

  // Calculate idle time since last job ended on this machine
  const lastEnded = await prisma.activity.findFirst({
    where: { machine_number: machine_number.toUpperCase(), status: ActivityStatus.ENDED },
    orderBy: { ended_at: 'desc' },
    select: { ended_at: true },
  })
  const idle_before_start_sec = lastEnded?.ended_at
    ? Math.floor((now.getTime() - lastEnded.ended_at.getTime()) / 1000)
    : null

  const activity = await prisma.activity.create({
    data: {
      machine_number: machine_number.toUpperCase(),
      item_master_no: item_master_no.toUpperCase(),
      activity_type,
      status: ActivityStatus.RUNNING,
      started_at: now,
      idle_before_start_sec,
      intervals: {
        create: { interval_start: now },
      },
    },
    include: { intervals: true },
  })

  return res.status(201).json(activity)
})

// POST /api/activities/:id/start — resume: open a new interval
router.post('/:id/start', async (req, res) => {
  const { id } = req.params

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { intervals: true },
  })

  if (!activity) return res.status(404).json({ error: 'Activity not found' })
  if (activity.status === ActivityStatus.ENDED) {
    return res.status(400).json({ error: 'Cannot resume an ended activity' })
  }

  const openInterval = activity.intervals.find((iv) => !iv.interval_end)
  if (openInterval) {
    return res.status(400).json({ error: 'Activity already has an open interval (already running)' })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.activityInterval.create({
      data: { activity_id: id, interval_start: now },
    }),
    prisma.activity.update({
      where: { id },
      data: { status: ActivityStatus.RUNNING },
    }),
  ])

  return res.json({ ok: true })
})

// POST /api/activities/:id/stop — pause: close the open interval
router.post('/:id/stop', async (req, res) => {
  const { id } = req.params

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { intervals: true },
  })

  if (!activity) return res.status(404).json({ error: 'Activity not found' })
  if (activity.status === ActivityStatus.ENDED) {
    return res.status(400).json({ error: 'Activity already ended' })
  }

  const openInterval = activity.intervals.find((iv) => !iv.interval_end)
  if (!openInterval) {
    return res.status(400).json({ error: 'No open interval to stop' })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.activityInterval.update({
      where: { id: openInterval.id },
      data: { interval_end: now },
    }),
    prisma.activity.update({
      where: { id },
      data: { status: ActivityStatus.PAUSED },
    }),
  ])

  return res.json({ ok: true })
})

// POST /api/activities/:id/end — close open interval + mark ENDED
router.post('/:id/end', async (req, res) => {
  const { id } = req.params

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { intervals: true },
  })

  if (!activity) return res.status(404).json({ error: 'Activity not found' })
  if (activity.status === ActivityStatus.ENDED) {
    return res.status(400).json({ error: 'Activity already ended' })
  }

  const now = new Date()
  const openInterval = activity.intervals.find((iv) => !iv.interval_end)

  await prisma.$transaction([
    ...(openInterval
      ? [
          prisma.activityInterval.update({
            where: { id: openInterval.id },
            data: { interval_end: now },
          }),
        ]
      : []),
    prisma.activity.update({
      where: { id },
      data: { status: ActivityStatus.ENDED, ended_at: now },
    }),
  ])

  return res.json({ ok: true })
})

// POST /api/activities/:id/acknowledge — supervisor clears red flash
router.post('/:id/acknowledge', async (req, res) => {
  const { id } = req.params
  const { acknowledged_by } = req.body as { acknowledged_by?: string }

  if (!acknowledged_by) {
    return res.status(400).json({ error: 'acknowledged_by is required' })
  }

  const activity = await prisma.activity.findUnique({ where: { id } })
  if (!activity) return res.status(404).json({ error: 'Activity not found' })

  await prisma.activity.update({
    where: { id },
    data: {
      acknowledged_by,
      acknowledged_at: new Date(),
    },
  })

  return res.json({ ok: true })
})

// GET /api/activities/history — phase 2: ended activities log
router.get('/history', async (req, res) => {
  const { plant, machine_number, from, to } = req.query as Record<string, string>

  const activities = await prisma.activity.findMany({
    where: {
      status: ActivityStatus.ENDED,
      ...(machine_number ? { machine_number: machine_number.toUpperCase() } : {}),
      ...(plant ? { machine: { plant: plant as any } } : {}),
      ...(from || to
        ? {
            ended_at: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      machine: true,
      item_master: true,
      intervals: true,
    },
    orderBy: { ended_at: 'desc' },
    take: 500,
  })

  const results = activities.map((act) => {
    const standardSec =
      act.activity_type === ActivityType.SETUP
        ? act.item_master.standard_setup_time_sec
        : act.item_master.standard_cycle_time_sec

    const elapsedSec = computeElapsedSec(act.intervals, act.ended_at ?? new Date())

    return {
      id: act.id,
      machine_number: act.machine_number,
      plant: act.machine.plant,
      item_master_no: act.item_master_no,
      part_number: act.item_master.part_number,
      part_description: act.item_master.description,
      activity_type: act.activity_type,
      started_at: act.started_at,
      ended_at: act.ended_at,
      elapsed_sec: elapsedSec,
      standard_sec: standardSec,
      variance_sec: elapsedSec - standardSec,
      idle_before_start_sec: act.idle_before_start_sec,
    }
  })

  return res.json(results)
})

export default router
