import { useEffect, useState, useRef } from 'react'
import { Bell, ChevronDown, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/context/StoreContext'

export default function TopBar() {
  const [email, setEmail] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { stores, activeStore, setActiveStoreId } = useStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
      {/* Store switcher */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
        >
          <Store className="h-4 w-4 text-brand-400 shrink-0" />
          <span className="max-w-[200px] truncate font-medium">
            {activeStore?.name ?? 'Select store'}
          </span>
          {stores.length > 1 && <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
        </button>

        {open && stores.length > 1 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => { setActiveStoreId(s.id); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  s.id === activeStore?.id
                    ? 'bg-brand-950 text-brand-300'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <Store className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  {s.location && (
                    <p className="truncate text-xs text-gray-500">{s.location}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-500">{email}</span>
      </div>
    </header>
  )
}
