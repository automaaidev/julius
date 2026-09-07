import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

// colunas públicas: `telefone` fica de fora — anon não tem privilégio de
// SELECT nele (ver migration 20260905). O painel admin pede `withTelefone`
// pra poder avisar o cliente no WhatsApp.
const COLS_PUBLICAS = 'id,nome,perfil_id,numero_musica,status,posicao,created_at'

// Traz TODAS as entradas (inclui 'done') pro admin; tela do cliente
// filtra localmente o que precisa.
export function useQueue({ withTelefone = false } = {}) {
  const [entries, setEntries] = useState(() => (LOCAL ? localDb.getQueue() : []))
  const [loading, setLoading] = useState(true)

  const cols = withTelefone ? `${COLS_PUBLICAS},telefone` : COLS_PUBLICAS

  const refetch = useCallback(async () => {
    if (LOCAL) {
      setEntries(localDb.getQueue())
      setLoading(false)
      return
    }
    if (!supabase) return
    const { data } = await supabase
      .from('queue_entries')
      .select(cols)
      .order('posicao', { ascending: true })
    setEntries(data ?? [])
    setLoading(false)
  }, [cols])

  useEffect(() => {
    if (LOCAL) {
      const sync = () => setEntries(localDb.getQueue())
      sync()
      localDb.ready.then(() => {
        sync()
        setLoading(false)
      })
      return localDb.subscribe(sync)
    }

    if (!supabase) {
      setLoading(false)
      return
    }

    refetch()

    const channel = supabase
      .channel('queue-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'julius', table: 'queue_entries' },
        () => refetch()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [refetch])

  return { entries, loading, refetch }
}

// posição de exibição = ranking entre quem ainda está ativo (waiting/playing),
// ordenado por posicao. A coluna 'posicao' pode ter buracos (regra de não-consecutivo),
// então a posição que o cliente vê é sempre 1,2,3... contínua.
export function activeRanked(entries) {
  return entries
    .filter((e) => e.status === 'waiting' || e.status === 'playing')
    .sort((a, b) => a.posicao - b.posicao)
    .map((e, i) => ({ ...e, rank: i + 1 }))
}
