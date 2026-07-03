import { Router } from 'express'
import { ActivityStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const router = Router()

// GET /api/idle — machines with no active job that had a job end recently
router.get('/', async (_req, res) => {
  const now = new Date()

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

    return {
      machine_number: act.machine_number,
      plant: act.machine.plant,
      machine_description: act.machine.description,
      last_item_master_no: act.item_master_no,
      last_part_description: act.item_master.description,
      last_activity_type: act.activity_type,
      last_ended_at: act.ended_at,
      idle_sec,
    }
  })

  return res.json(results)
})

export default router
