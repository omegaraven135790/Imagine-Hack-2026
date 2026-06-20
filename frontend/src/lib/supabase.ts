/**
 * Supabase client for ResWatch Retail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE RULE (enforced):
 *   • Auth only  → supabase.auth.* for sign-in / sign-out / session
 *   • Realtime   → supabase.channel().on('postgres_changes', ...) for live push
 *   • NEVER call supabase.from(...).select / insert / update / delete
 *     All data CRUD goes through FastAPI via src/lib/api.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** Returns the current session's JWT access token, or null if not signed in. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
