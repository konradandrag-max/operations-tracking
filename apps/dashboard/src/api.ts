const BASE = import.meta.env.VITE_API_URL ?? ''

export type Plant = 'KSB2' | 'KSB6' | 'KSB7'
export type ActivityType = 'SETUP' | 'CYCLE'
export type ActivityStatus = 'RUNNING' | 'PAUSED' | 'ENDED'

export interface ActiveActivity {
  id: string
  machine_number: string
  plant: Plant
  machine_description: string | null
  item_master_no: string
  part_number: string
  part_description: string
  activity_type: ActivityType
  status: ActivityStatus
  started_at: string
  elapsed_sec: number
  standard_sec: number
  progress_pct: number
  overdue_flag: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  open_interval_start: string | null
}

export interface HistoryActivity {
  id: string
  machine_number: string
  plant: Plant
  item_master_no: string
  part_number: string
  part_description: string
  activity_type: ActivityType
  started_at: string
  ended_at: string | null
  elapsed_sec: number
  standard_sec: number
  variance_sec: number
}

export const api = {
  getActive: (): Promise<ActiveActivity[]> =>
    fetch(`${BASE}/api/activities/active`).then((r) => r.json()),

  acknowledge: (id: string, acknowledged_by: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/api/activities/${id}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledged_by }),
    }).then((r) => r.json()),

  getHistory: (params?: { plant?: string; machine_number?: string; from?: string; to?: string }): Promise<HistoryActivity[]> => {
    const qs = new URLSearchParams()
    if (params?.plant) qs.set('plant', params.plant)
    if (params?.machine_number) qs.set('machine_number', params.machine_number)
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    return fetch(`${BASE}/api/activities/history?${qs}`).then((r) => r.json())
  },
}
