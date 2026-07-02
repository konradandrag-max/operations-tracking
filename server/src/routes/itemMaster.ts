import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/:item_master_no', async (req, res) => {
  const { item_master_no } = req.params

  const item = await prisma.itemMaster.findUnique({
    where: { item_master_no: item_master_no.toUpperCase() },
  })

  if (!item) {
    return res.status(404).json({ error: 'Item master not found', code: 'ITEM_MASTER_NOT_FOUND' })
  }

  return res.json(item)
})

export default router
