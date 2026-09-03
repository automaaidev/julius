import { createClient } from '@supabase/supabase-js'
import { LOCAL } from './flags'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !LOCAL && Boolean(url && anonKey)

// Sem .env ainda (ex: rodando só o site institucional): client fica null.
// Hooks que dependem dele (useSettings, useQueue, useAuth) tratam esse caso.
//
// db.schema: 'julius' — banco compartilhado com outros projetos, tudo desse
// app fica isolado no schema "julius" (não em "public"). Precisa que
// PGRST_DB_SCHEMAS no servidor inclua "julius" também.
export const supabase =
  !LOCAL && isSupabaseConfigured
    ? createClient(url, anonKey, { db: { schema: 'julius' } })
    : null
