import { Router } from 'express'

const router = Router()

// Called by Railway cron every 5 minutes to trigger a sync
router.post('/', async (_req, res) => {
  const apiUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'http://localhost:3001'

  try {
    const result = await fetch(`${apiUrl}/api/sync`, { method: 'POST' })
    const data = await result.json()
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})

export default router
