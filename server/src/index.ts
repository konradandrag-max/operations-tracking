import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import machinesRouter from './routes/machines.js'
import itemMasterRouter from './routes/itemMaster.js'
import activitiesRouter from './routes/activities.js'
import syncRouter from './routes/sync.js'
import cronRouter from './routes/cron.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(helmet())
const corsOrigin = process.env.CORS_ORIGIN
app.use(cors({
  origin: corsOrigin === '*' ? '*' : (corsOrigin?.split(',') ?? ['http://localhost:5173', 'http://localhost:5174']),
  methods: ['GET', 'POST', 'PUT', 'PATCH'],
}))
app.use(express.json())

// Light rate limiting — not a public API, just a safeguard
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/machines', machinesRouter)
app.use('/api/item-master', itemMasterRouter)
app.use('/api/activities', activitiesRouter)
app.use('/api/sync', syncRouter)
app.use('/api/cron/sync', cronRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Global error handler — keeps stack traces out of API responses in production
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // Sync from Google Sheets every 5 minutes if GOOGLE_SHEET_ID is configured
  if (process.env.GOOGLE_SHEET_ID) {
    const syncSheets = async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/api/sync`, { method: 'POST' })
        const data = await res.json() as { machines?: { upserted: number }; parts?: { upserted: number } }
        console.log(`Sheets sync: ${data.machines?.upserted ?? 0} machines, ${data.parts?.upserted ?? 0} parts`)
      } catch (err) {
        console.error('Sheets sync failed:', err)
      }
    }
    // Initial sync on startup, then every 5 minutes
    setTimeout(syncSheets, 5000)
    setInterval(syncSheets, 5 * 60 * 1000)
  }
})

export default app
