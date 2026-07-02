import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/:machine_number', async (req, res) => {
  const { machine_number } = req.params

  const machine = await prisma.machine.findUnique({
    where: { machine_number: machine_number.toUpperCase() },
  })

  if (!machine) {
    return res.status(404).json({ error: 'Machine not found', code: 'MACHINE_NOT_FOUND' })
  }

  if (!machine.active) {
    return res.status(403).json({ error: 'Machine is inactive', code: 'MACHINE_INACTIVE' })
  }

  return res.json(machine)
})

export default router
