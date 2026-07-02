import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import machinesRouter from './routes/machines.js'
import itemMasterRouter from './routes/itemMaster.js'
import activitiesRouter from './routes/activities.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'PATCH'],
}))
app.use(express.json())

// Light rate limiting — not a public API, just a safeguard
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/machines', machinesRouter)
app.use('/api/item-master', itemMasterRouter)
app.use('/api/activities', activitiesRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Global error handler — keeps stack traces out of API responses in production
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
