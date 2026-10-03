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

// Tópico de canal realtime único por montagem do hook. Sem isso, remontar um
// componente rápido (troca de rota, StrictMode) reusa o MESMO objeto de canal
// pelo nome — se o anterior ainda está saindo (`leave` é assíncrono), o novo
// `.subscribe()` não faz nada e o realtime morre em silêncio; e se 2 hooks
// montados ao mesmo tempo usam o mesmo nome fixo, o 2º `.on()` lança
// "cannot add postgres_changes callbacks... after subscribe()" e derruba o app.
export function realtimeTopic(base) {
  return `${base}-${Math.random().toString(36).slice(2, 9)}`
}
