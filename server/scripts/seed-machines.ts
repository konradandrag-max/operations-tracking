/**
 * Seeds the Machine table with static plant machines.
 * Machine numbers are your internal identifiers — update this list as machines change.
 * Run: npm run seed --workspace=server
 */
import { PrismaClient, Plant } from '@prisma/client'

const prisma = new PrismaClient()

const machines = [
  // KSB2 machines
  { machine_number: 'KSB2-001', plant: Plant.KSB2, description: 'CNC Lathe 1' },
  { machine_number: 'KSB2-002', plant: Plant.KSB2, description: 'CNC Lathe 2' },
  { machine_number: 'KSB2-003', plant: Plant.KSB2, description: 'Milling Machine 1' },
  { machine_number: 'KSB2-004', plant: Plant.KSB2, description: 'Milling Machine 2' },
  // KSB6 machines
  { machine_number: 'KSB6-001', plant: Plant.KSB6, description: 'Grinder 1' },
  { machine_number: 'KSB6-002', plant: Plant.KSB6, description: 'Grinder 2' },
  { machine_number: 'KSB6-003', plant: Plant.KSB6, description: 'Drill Press 1' },
  // KSB7 machines
  { machine_number: 'KSB7-001', plant: Plant.KSB7, description: 'Assembly Station 1' },
  { machine_number: 'KSB7-002', plant: Plant.KSB7, description: 'Assembly Station 2' },
  { machine_number: 'KSB7-003', plant: Plant.KSB7, description: 'Inspection Station 1' },
]

async function main() {
  console.log(`Seeding ${machines.length} machines...`)

  for (const machine of machines) {
    await prisma.machine.upsert({
      where: { machine_number: machine.machine_number },
      update: { plant: machine.plant, description: machine.description },
      create: machine,
    })
    console.log(`  ✓ ${machine.machine_number} (${machine.plant})`)
  }

  console.log('Machine seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
