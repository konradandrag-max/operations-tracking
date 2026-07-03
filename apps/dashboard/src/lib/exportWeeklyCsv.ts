import { api, HistoryActivity } from '../api.ts'

function weekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day) // Monday
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function fmtMin(sec: number): string {
  const sign = sec < 0 ? '-' : '+'
  return `${sign}${Math.abs(Math.round(sec / 60))} min`
}

function escapeCsv(val: string | number): string {
  const s = String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export async function exportWeeklyCsv() {
  const from = weekStart()
  const activities: HistoryActivity[] = await api.getHistory({ from })

  // Group by part + machine
  type Key = string
  const groups = new Map<Key, { part: string; machine: string; setups: HistoryActivity[]; cycles: HistoryActivity[] }>()

  for (const act of activities) {
    const key = `${act.item_master_no}||${act.machine_number}`
    if (!groups.has(key)) {
      groups.set(key, { part: act.item_master_no, machine: act.machine_number, setups: [], cycles: [] })
    }
    const g = groups.get(key)!
    if (act.activity_type === 'SETUP') g.setups.push(act)
    else g.cycles.push(act)
  }

  const headers = [
    'Part',
    'Machine',
    'No. of Setups',
    'Avg Setup Variance',
    'No. of Cycles',
    'Avg Cycle Variance',
    'Activities >10% Variance',
    'Reason for Variance',
  ]

  const rows: string[][] = []

  for (const g of groups.values()) {
    const allActs = [...g.setups, ...g.cycles]
    const over10pct = allActs.filter(
      (a) => a.standard_sec > 0 && Math.abs(a.variance_sec) / a.standard_sec > 0.1
    ).length

    rows.push([
      g.part,
      g.machine,
      String(g.setups.length),
      g.setups.length ? fmtMin(avg(g.setups.map((a) => a.variance_sec))) : '-',
      String(g.cycles.length),
      g.cycles.length ? fmtMin(avg(g.cycles.map((a) => a.variance_sec))) : '-',
      String(over10pct),
      '', // reason — empty for engineer/supervisor
    ])
  }

  // Sort by part then machine
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n')

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const weekLabel = new Date(from).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
  a.href = url
  a.download = `weekly-report-${weekLabel}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
