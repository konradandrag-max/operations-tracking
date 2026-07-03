import { useState, useEffect } from 'react'
import { api, HistoryActivity, Plant } from '../api.ts'

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function HistoryView() {
  const [rows, setRows] = useState<HistoryActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [plant, setPlant] = useState<string>('')
  const [machine, setMachine] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await api.getHistory({
        plant: plant || undefined,
        machine_number: machine || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-white">Activity History</h2>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase">Plant</label>
          <select
            value={plant}
            onChange={(e) => setPlant(e.target.value)}
            className="rounded-lg bg-gray-700 px-3 py-2 text-white text-sm"
          >
            <option value="">All plants</option>
            {(['KSB2', 'KSB6', 'KSB7'] as Plant[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase">Machine</label>
          <input
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
            placeholder="e.g. KSB2-001"
            className="rounded-lg bg-gray-700 px-3 py-2 text-white text-sm placeholder-gray-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg bg-gray-700 px-3 py-2 text-white text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg bg-gray-700 px-3 py-2 text-white text-sm" />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700 disabled:opacity-40"
        >
          {loading ? 'Loading...' : 'Apply'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="bg-gray-800 text-xs text-gray-400 uppercase">
            <tr>
              <th className="px-4 py-3">Machine</th>
              <th className="px-4 py-3">Plant</th>
              <th className="px-4 py-3">Part</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Elapsed</th>
              <th className="px-4 py-3">Standard</th>
              <th className="px-4 py-3">Variance</th>
              <th className="px-4 py-3">Idle Before</th>
              <th className="px-4 py-3">Ended</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  {loading ? 'Loading...' : 'No records found'}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-700 hover:bg-gray-800">
                <td className="px-4 py-3 font-mono">{row.machine_number}</td>
                <td className="px-4 py-3">{row.plant}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-white">{row.item_master_no}</span>
                  <span className="block text-xs text-gray-400">{row.part_description}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    row.activity_type === 'SETUP' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                  }`}>
                    {row.activity_type}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">{formatSec(row.elapsed_sec)}</td>
                <td className="px-4 py-3 font-mono">{formatSec(row.standard_sec)}</td>
                <td className={`px-4 py-3 font-mono font-semibold ${
                  row.variance_sec > 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  {row.variance_sec > 0 ? '+' : ''}{formatSec(Math.abs(row.variance_sec))}
                  {row.variance_sec > 0 ? ' over' : ' under'}
                </td>
                <td className={`px-4 py-3 text-sm font-mono ${
                  (row as any).idle_before_start_sec >= 2700 ? 'text-red-400' :
                  (row as any).idle_before_start_sec >= 1800 ? 'text-orange-400' :
                  (row as any).idle_before_start_sec >= 900 ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {(row as any).idle_before_start_sec != null
                    ? `${Math.round((row as any).idle_before_start_sec / 60)} min`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {row.ended_at ? new Date(row.ended_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
