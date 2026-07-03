import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const MACHINE = process.argv[2] ?? 'KSB2-001'

async function main() {
  const machine = await prisma.machine.findUnique({ where: { machine_number: MACHINE } })
  if (!machine) {
    console.log(`Machine ${MACHINE} not found.`)
    return
  }

  const actCount = await prisma.activity.count({ where: { machine_number: MACHINE } })
  if (actCount > 0) {
    console.log(`Cannot delete: ${MACHINE} has ${actCount} activity record(s). Delete those first or use a soft-delete.`)
    return
  }

  await prisma.machine.delete({ where: { machine_number: MACHINE } })
  console.log(`Deleted machine ${MACHINE}.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
