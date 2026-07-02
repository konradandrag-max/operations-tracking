import { useState } from 'react'
import { api, Machine, ItemMaster } from '../api.ts'
import LookupInput from '../components/LookupInput.tsx'

interface Props {
  machine: Machine
  onConfirmed: (item: ItemMaster) => void
  onChangeMachine: () => void
}

export default function ItemMasterScreen({ machine, onConfirmed, onChangeMachine }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (value: string) => {
    setError(null)
    setLoading(true)
    try {
      const item = await api.getItemMaster(value)
      onConfirmed(item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate item master number')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-wider">Machine</p>
              <p className="text-2xl font-bold text-white">{machine.machine_number}</p>
              <p className="text-gray-400">{machine.plant}{machine.description ? ` — ${machine.description}` : ''}</p>
            </div>
            <button
              onClick={onChangeMachine}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 active:bg-gray-600"
            >
              Change
            </button>
          </div>
        </div>
        <LookupInput
          label="Item Master Number"
          placeholder="Scan or type item number"
          submitLabel="Load Part"
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )
}
