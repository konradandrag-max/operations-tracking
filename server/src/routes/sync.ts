import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

const MACHINES_SHEET_ID = process.env.GOOGLE_MACHINES_SHEET_ID ?? process.env.GOOGLE_SHEET_ID
const PARTS_SHEET_ID = process.env.GOOGLE_PARTS_SHEET_ID ?? process.env.GOOGLE_SHEET_ID

function sheetCsvUrl(sheetId: string, sheetName?: string) {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
  return sheetName ? `${base}&sheet=${encodeURIComponent(sheetName)}` : base
}

function parseCsv(text: string): string[][] {
  return text
    .split('\n')
    .map(line =>
      line
        .trim()
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map(cell => cell.replace(/^"|"$/g, '').trim())
    )
    .filter(row => row.some(cell => cell !== ''))
}

function toSeconds(minutes: string): number {
  const m = parseFloat(minutes) || 0
  return Math.round(m * 60)
}

router.post('/', async (_req, res) => {
  if (!MACHINES_SHEET_ID && !PARTS_SHEET_ID) {
    return res.status(503).json({ error: 'GOOGLE_SHEET_ID not configured' })
  }

  const results = { machines: { upserted: 0, skipped: 0 }, parts: { upserted: 0, skipped: 0 }, errors: [] as string[] }

  // Sync machines
  try {
    if (!MACHINES_SHEET_ID) throw new Error('GOOGLE_MACHINES_SHEET_ID not configured')
    const response = await fetch(sheetCsvUrl(MACHINES_SHEET_ID))
    if (!response.ok) throw new Error(`Failed to fetch Machines sheet: ${response.status}`)
    const rows = parseCsv(await response.text()).slice(1) // skip header

    for (const row of rows) {
      const machine_number = row[0]?.toUpperCase()
      const plant = row[1]?.toUpperCase() as 'KSB2' | 'KSB6' | 'KSB7'
      const description = row[2] || null

      if (!machine_number || !['KSB2', 'KSB6', 'KSB7'].includes(plant)) {
        results.machines.skipped++
        continue
      }

      await prisma.machine.upsert({
        where: { machine_number },
        update: { plant, description, active: true },
        create: { machine_number, plant, description, active: true },
      })
      results.machines.upserted++
    }
  } catch (err) {
    results.errors.push(`Machines: ${(err as Error).message}`)
  }

  // Sync parts
  try {
    if (!PARTS_SHEET_ID) throw new Error('GOOGLE_PARTS_SHEET_ID not configured')
    const response = await fetch(sheetCsvUrl(PARTS_SHEET_ID))
    if (!response.ok) throw new Error(`Failed to fetch Parts sheet: ${response.status}`)
    const rows = parseCsv(await response.text()).slice(1) // skip header

    for (const row of rows) {
      const item_master_no = row[0]?.toUpperCase()
      const description = row[1] || ''
      const setup_sec = toSeconds(row[2])
      const cycle_sec = toSeconds(row[3])

      if (!item_master_no || setup_sec <= 0 || cycle_sec <= 0) {
        results.parts.skipped++
        continue
      }

      await prisma.itemMaster.upsert({
        where: { item_master_no },
        update: { description, standard_setup_time_sec: setup_sec, standard_cycle_time_sec: cycle_sec, last_imported_at: new Date() },
        create: { item_master_no, part_number: item_master_no, description, standard_setup_time_sec: setup_sec, standard_cycle_time_sec: cycle_sec },
      })
      results.parts.upserted++
    }
  } catch (err) {
    results.errors.push(`Parts: ${(err as Error).message}`)
  }

  return res.json({ ok: true, ...results })
})

export default router
