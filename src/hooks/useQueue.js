import { useCallback, useEffect, useState } from 'react'
import { supabase, realtimeTopic } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

const COLS_BASE = 'id,nome,perfil_id,numero_musica,status,posicao,created_at'
// `sinal` veio na migration 20261005_avisos_e_sinais.sql. Enquanto ela não rodou, pedir a
// coluna daria erro e a fila inteira sumiria da tela — então cai pras colunas antigas.
let comSinal = true

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
    const buscar = (cols) =>
      supabase
        .from('queue_entries')
        .select(cols)
        .order('posicao', { ascending: true })
        .then((r) => r, () => ({ data: null, error: { message: 'rede' } }))
    let { data, error } = await buscar(comSinal ? `${COLS_BASE},sinal` : COLS_BASE)
    if (error && comSinal && /sinal/i.test(error.message ?? '')) {
      comSinal = false
      ;({ data } = await buscar(COLS_BASE))
    }
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
