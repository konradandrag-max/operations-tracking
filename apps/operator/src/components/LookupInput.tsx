import { useState, useRef, FormEvent } from 'react'

interface Props {
  label: string
  placeholder: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void>
  loading: boolean
  error: string | null
}

export default function LookupInput({ label, placeholder, submitLabel, onSubmit, loading, error }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    await onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <label className="text-2xl font-semibold text-gray-200">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border-2 border-gray-600 bg-gray-800 px-6 py-5 text-3xl font-mono tracking-widest text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none"
      />

      {error && (
        <div className="rounded-xl bg-red-900/60 border border-red-500 px-5 py-4 text-xl text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="w-full rounded-xl bg-blue-600 py-5 text-2xl font-bold text-white active:bg-blue-700 disabled:opacity-40"
      >
        {loading ? 'Checking...' : submitLabel}
      </button>
    </form>
  )
}
