import { Router } from 'express'
import { ActivityStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const router = Router()
const DAILY_IDLE_LIMIT_SEC = 90 * 60

function todayDateStr() {
  return new Date().toISOString().slice(0, 10)
}

// POST /api/idle/dismiss — supervisor dismisses daily idle warning for a machine
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

router.get('/', async (_req, res) => {
  const now = new Date()

  // Today's idle totals
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayDate = todayDateStr()

  const [todayIdleRows, dismissals] = await Promise.all([
    prisma.activity.groupBy({
      by: ['machine_number'],
      where: { started_at: { gte: todayStart }, idle_before_start_sec: { not: null } },
      _sum: { idle_before_start_sec: true },
    }),
    prisma.dailyIdleDismissal.findMany({ where: { date: todayDate } }),
  ])
  const todayIdleMap = new Map(
    todayIdleRows.map((r) => [r.machine_number, r._sum.idle_before_start_sec ?? 0])
  )
  const dismissalMap = new Map(dismissals.map((d) => [d.machine_number, d]))

  // Find all machines that currently have NO running/paused activity
  const activeMachineNos = (
    await prisma.activity.findMany({
      where: { status: { in: [ActivityStatus.RUNNING, ActivityStatus.PAUSED] } },
      select: { machine_number: true },
      distinct: ['machine_number'],
    })
  ).map((a) => a.machine_number)

  // For every machine NOT currently active, find their last ended activity
  const idleMachines = await prisma.activity.findMany({
    where: {
      status: ActivityStatus.ENDED,
      machine_number: { notIn: activeMachineNos },
      ended_at: { not: null },
    },
    orderBy: { ended_at: 'desc' },
    distinct: ['machine_number'],
    include: {
      machine: true,
      item_master: true,
    },
  })

  const results = idleMachines.map((act) => {
    const idle_sec = act.ended_at
      ? Math.floor((now.getTime() - act.ended_at.getTime()) / 1000)
      : 0

    const today_idle_sec = (todayIdleMap.get(act.machine_number) ?? 0) + idle_sec
    const dismissal = dismissalMap.get(act.machine_number)

    return {
      machine_number: act.machine_number,
      plant: act.machine.plant,
      machine_description: act.machine.description,
      last_item_master_no: act.item_master_no,
      last_part_description: act.item_master.description,
      last_activity_type: act.activity_type,
      last_ended_at: act.ended_at,
      idle_sec,
      today_idle_sec,
      today_idle_flagged: today_idle_sec > DAILY_IDLE_LIMIT_SEC,
      daily_idle_dismissed_by: dismissal?.dismissed_by ?? null,
      daily_idle_dismissed_at: dismissal?.dismissed_at ?? null,
    }
  })

  return res.json(results)
})

export default router
