/**
 * Item Master CSV Import Script
 *
 * Usage:
 *   npx tsx scripts/import-item-master.ts <path-to-csv>
 *
 * CSV format (see /docs/item-master-csv-format.md for full spec):
 *   item_master_no,part_number,description,standard_setup_time_sec,standard_cycle_time_sec
 *
 * Example row:
 *   IM-00123,PN-456,Impeller Housing Cover,180,45
 *
 * Behavior:
 *   - Upserts: new rows are inserted; existing rows are updated.
 *   - Sets last_imported_at to the current timestamp on every upsert.
 *   - Skips rows with missing required fields (logs a warning).
 *   - All item_master_no values are uppercased before upsert.
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CsvRow {
  item_master_no: string
  part_number: string
  description: string
  standard_setup_time_sec: number
  standard_cycle_time_sec: number
}

function parseLine(headers: string[], values: string[]): CsvRow | null {
  const row: Record<string, string> = {}
  headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim() })

  const item_master_no = row['item_master_no']?.toUpperCase()
  const part_number = row['part_number']
  const description = row['description']
  const setupSec = parseInt(row['standard_setup_time_sec'], 10)
  const cycleSec = parseInt(row['standard_cycle_time_sec'], 10)

  if (!item_master_no || !part_number || !description || isNaN(setupSec) || isNaN(cycleSec)) {
    return null
  }

  return { item_master_no, part_number, description, standard_setup_time_sec: setupSec, standard_cycle_time_sec: cycleSec }
}

async function importCsv(filePath: string) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`)
    process.exit(1)
  }

  const rl = readline.createInterface({ input: fs.createReadStream(resolved) })
  let headers: string[] = []
  let lineNum = 0
  let imported = 0
  let skipped = 0
  const now = new Date()

  for await (const line of rl) {
    lineNum++
    if (lineNum === 1) {
      headers = line.split(',')
      continue
    }

    if (!line.trim()) continue

    const values = line.split(',')
    const row = parseLine(headers, values)

    if (!row) {
      console.warn(`  ⚠ Skipping row ${lineNum}: missing or invalid fields — ${line}`)
      skipped++
      continue
    }

    await prisma.itemMaster.upsert({
      where: { item_master_no: row.item_master_no },
      update: {
        part_number: row.part_number,
        description: row.description,
        standard_setup_time_sec: row.standard_setup_time_sec,
        standard_cycle_time_sec: row.standard_cycle_time_sec,
        last_imported_at: now,
      },
      create: {
        ...row,
        last_imported_at: now,
      },
    })

    imported++
    if (imported % 100 === 0) console.log(`  ${imported} rows imported...`)
  }

  console.log(`\nImport complete: ${imported} upserted, ${skipped} skipped.`)
}

const [, , csvPath] = process.argv
if (!csvPath) {
  console.error('Usage: npx tsx scripts/import-item-master.ts <path-to-csv>')
  process.exit(1)
}

importCsv(csvPath)
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
