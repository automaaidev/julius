import { useCallback, useEffect, useState } from 'react'
import { supabase, realtimeTopic } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

const COLS = 'id,nome,perfil_id,numero_musica,status,posicao,created_at'

// Traz TODAS as entradas (inclui 'done') pro admin; tela do cliente
// filtra localmente o que precisa.
export function useQueue() {
  const [entries, setEntries] = useState(() => (LOCAL ? localDb.getQueue() : []))
  const [loading, setLoading] = useState(true)
  const [topic] = useState(() => realtimeTopic('queue'))

  const refetch = useCallback(async () => {
    if (LOCAL) {
      setEntries(localDb.getQueue())
      setLoading(false)
      return
    }
    if (!supabase) return
    const { data } = await supabase
      .from('queue_entries')
      .select(COLS)
      .order('posicao', { ascending: true })
      .then((r) => r, () => ({ data: null }))
    setEntries(data ?? [])
    setLoading(false)
  }, [])

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
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'julius', table: 'queue_entries' },
        () => refetch()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [refetch, topic])

  return { entries, loading, refetch }
}

// posição de exibição = ranking entre quem ainda está ativo (waiting/playing),
// ordenado por posicao. A coluna 'posicao' pode ter buracos, então a posição
// que o cliente vê é sempre 1,2,3... contínua.
export function activeRanked(entries) {
  return entries
    .filter((e) => e.status === 'waiting' || e.status === 'playing')
    .sort((a, b) => a.posicao - b.posicao)
    .map((e, i) => ({ ...e, rank: i + 1 }))
}
