import { useState } from 'react'
import { api, Machine } from '../api.ts'
import LookupInput from '../components/LookupInput.tsx'

interface Props {
  onConfirmed: (machine: Machine) => void
}

export default function MachineScreen({ onConfirmed }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (value: string) => {
    setError(null)
    setLoading(true)
    try {
      const machine = await api.getMachine(value)
      onConfirmed(machine)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate machine number')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-white">Production Tracking</h1>
          <p className="mt-2 text-gray-400 text-lg">Enter your machine number to begin</p>
        </div>
        <LookupInput
          label="Machine Number"
          placeholder="e.g. KSB2-001"
          submitLabel="Continue"
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )
}
