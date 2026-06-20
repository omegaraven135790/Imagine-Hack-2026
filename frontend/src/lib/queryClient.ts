import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s — dashboard tiles refresh every 30s
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
