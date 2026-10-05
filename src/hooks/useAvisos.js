import { useCallback, useEffect, useState } from 'react'
import { listarAvisos } from '../lib/avisosCasa'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

// um aviso novo (ou desligado) no painel chega no celular de quem está com o site aberto
const REFRESCO_MS = 60_000

// Avisos ativos de um tipo ('faq' | 'aviso'); no painel, `todos` traz também os
// desligados. Não precisa de realtime: poucas linhas, mudam raramente.
export function useAvisos(tipo, { todos = false } = {}) {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const recarregar = useCallback(async () => {
    const r = await listarAvisos({ tipo, incluirInativos: todos })
    setItens(r.itens)
    setErro(r.erro ?? null)
    setLoading(false)
  }, [tipo, todos])

  useEffect(() => {
    recarregar()
    const t = setInterval(recarregar, REFRESCO_MS)
    const parar = LOCAL ? localDb.subscribe(recarregar) : undefined
    return () => {
      clearInterval(t)
      parar?.()
    }
  }, [recarregar])

  return { itens, loading, erro, recarregar }
}
