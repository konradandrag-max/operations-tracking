import { IdleMachine } from '../api.ts'

interface Props {
  machine: IdleMachine
}

function formatIdle(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function IdleCard({ machine }: Props) {
  const min = Math.floor(machine.idle_sec / 60)

  const color =
    min >= 45
      ? { border: 'border-red-600', bg: 'bg-red-950', text: 'text-red-400', badge: 'bg-red-700' }
      : min >= 30
      ? { border: 'border-orange-500', bg: 'bg-orange-950', text: 'text-orange-400', badge: 'bg-orange-600' }
      : min >= 15
      ? { border: 'border-yellow-500', bg: 'bg-yellow-950', text: 'text-yellow-400', badge: 'bg-yellow-600' }
      : { border: 'border-gray-700', bg: 'bg-gray-800', text: 'text-gray-400', badge: 'bg-gray-600' }

  const plantColors: Record<string, string> = {
    KSB2: 'bg-blue-600',
    KSB6: 'bg-purple-600',
    KSB7: 'bg-teal-600',
  }

  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 ${color.border} ${color.bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${plantColors[machine.plant] ?? 'bg-gray-600'}`}>
            {machine.plant}
          </span>
          <h2 className="text-lg font-bold text-white mt-1">{machine.machine_number}</h2>
          {machine.machine_description && (
            <p className="text-xs text-gray-400">{machine.machine_description}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`text-2xl font-mono font-bold ${color.text}`}>{formatIdle(machine.idle_sec)}</span>
          <p className="text-xs text-gray-500 mt-0.5">idle</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500">Last job</p>
        <p className="text-sm text-gray-300 font-medium">{machine.last_item_master_no}</p>
        <p className="text-xs text-gray-400">{machine.last_part_description}</p>
        <p className="text-xs text-gray-500 mt-1">
          {machine.last_activity_type} ended at{' '}
          {new Date(machine.last_ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
