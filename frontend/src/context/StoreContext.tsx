import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Store } from '@/lib/api'

interface StoreContextValue {
  stores: Store[]
  activeStore: Store | null
  setActiveStoreId: (id: string) => void
  isLoading: boolean
}

const StoreContext = createContext<StoreContextValue>({
  stores: [],
  activeStore: null,
  setActiveStoreId: () => {},
  isLoading: true,
})

const STORAGE_KEY = 'rw_active_store_id'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: api.stores.list,
    staleTime: 5 * 60 * 1000,
  })

  // Validate stored ID against loaded stores; replace if missing or stale
  useEffect(() => {
    if (stores.length === 0) return
    const valid = stores.some((s) => s.id === activeStoreId)
    if (!valid) {
      const id = stores[0].id
      localStorage.setItem(STORAGE_KEY, id)
      setActiveStoreIdState(id)
    }
  }, [stores, activeStoreId])

  const setActiveStoreId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    setActiveStoreIdState(id)
  }

  const activeStore = stores.find((s) => s.id === activeStoreId) ?? stores[0] ?? null

  return (
    <StoreContext.Provider value={{ stores, activeStore, setActiveStoreId, isLoading }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}

export function useStoreId(): string {
  const { activeStore } = useStore()
  return activeStore?.id ?? ''
}
