import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

// Músicas mais cantadas (contagem automática da fila) + as que o painel
// cadastrou com título. Cada item: { numero, titulo | null, vezes }.
export function useSugestoes(limite = 8) {
  const [sugestoes, setSugestoes] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (LOCAL) {
      setSugestoes(localDb.musicasSugeridas(limite))
      setLoading(false)
      return
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .rpc('musicas_sugeridas', { p_limite: limite })
      .then((r) => r, () => ({ data: null, error: true }))
    setSugestoes(error ? [] : data ?? [])
    setLoading(false)
  }, [limite])

  useEffect(() => {
    refetch()
    if (LOCAL) return localDb.subscribe(refetch)
  }, [refetch])

  return { sugestoes, loading, refetch }
}
