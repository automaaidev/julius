import { useCallback, useEffect, useState } from 'react'
import { listarAvisos } from '../lib/avisosCasa'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { useAoVivo } from './useAoVivo'

// um aviso novo (ou desligado) no painel chega no celular de quem está com o site aberto
const REFRESCO_MS = 30_000

// Avisos ativos de um tipo ('faq' | 'aviso'); no painel, `todos` traz também os
// desligados. Não precisa de realtime: poucas linhas, mudam raramente.
export function useAvisos(tipo, { todos = false } = {}) {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const recarregar = useCallback(async () => {
    const r = await listarAvisos({ tipo, incluirInativos: todos })
    if (!r.erro) setItens(r.itens) // falha de rede não apaga o aviso que já está na tela
    setErro(r.erro ?? null)
    setLoading(false)
  }, [tipo, todos])

  useEffect(() => {
    recarregar()
    return LOCAL ? localDb.subscribe(recarregar) : undefined
  }, [recarregar])

  useAoVivo(recarregar, { intervaloMs: REFRESCO_MS })

  return { itens, loading, erro, recarregar }
}
