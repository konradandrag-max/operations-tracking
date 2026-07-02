const BASE = import.meta.env.VITE_API_URL ?? 'https://operations-tracking-production.up.railway.app'

interface ApiError {
  error: string
  code?: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error((data as ApiError).error), { code: (data as ApiError).code })
  return data as T
}

export interface Machine {
  machine_number: string
  plant: 'KSB2' | 'KSB6' | 'KSB7'
  description: string | null
  active: boolean
}

export interface ItemMaster {
  item_master_no: string
  part_number: string
  description: string
  standard_setup_time_sec: number
  standard_cycle_time_sec: number
}

export interface Activity {
  id: string
  machine_number: string
  item_master_no: string
  activity_type: 'SETUP' | 'CYCLE'
  status: 'RUNNING' | 'PAUSED' | 'ENDED'
  started_at: string
  intervals: Array<{ id: string; interval_start: string; interval_end: string | null }>
}

export const api = {
  getMachine: (id: string) => request<Machine>(`/api/machines/${encodeURIComponent(id)}`),
  getItemMaster: (id: string) => request<ItemMaster>(`/api/item-master/${encodeURIComponent(id)}`),
  createActivity: (body: { machine_number: string; item_master_no: string; activity_type: 'SETUP' | 'CYCLE' }) =>
    request<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) }),
  startActivity: (id: string) => request<{ ok: boolean }>(`/api/activities/${id}/start`, { method: 'POST' }),
  stopActivity: (id: string) => request<{ ok: boolean }>(`/api/activities/${id}/stop`, { method: 'POST' }),
  endActivity: (id: string) => request<{ ok: boolean }>(`/api/activities/${id}/end`, { method: 'POST' }),
}
