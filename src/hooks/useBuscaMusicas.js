import { useCallback, useEffect, useRef, useState } from 'react'
import { buscarMusicas, MIN_BUSCA, PAGINA } from '../lib/catalogo'
import { normalizar } from '../lib/normalizar'

const ESPERA_MS = 220

const VAZIO = { itens: [], total: 0, carregando: true, carregandoMais: false, erro: null }

// Cardápio de músicas: o catálogo inteiro paginado (PAGINA por vez) e, se a pessoa
// digitar, filtrado pelo texto. Muda o texto/categoria/ordem -> recomeça da primeira
// página (com um respiro enquanto digita, pra não chamar o banco a cada letra).
// Respostas atrasadas são descartadas.
export function useBuscaMusicas(q, categoria, ordem) {
  const [estado, setEstado] = useState(VAZIO)
  const filtro = normalizar(q).length >= MIN_BUSCA ? q : ''
  const pedido = useRef(0) // numera as consultas; só a última vale
  const atual = useRef({ itens: 0, total: 0, ocupado: false })

  useEffect(() => {
    const meu = ++pedido.current
    atual.current = { itens: 0, total: 0, ocupado: true }
    setEstado((e) => ({ ...e, carregando: true, carregandoMais: false, erro: null }))
    // sem texto = abrir/trocar categoria/ordem: responde na hora; digitando: espera um pouco
    const t = setTimeout(
      async () => {
        const r = await buscarMusicas({ q: filtro, categoria, ordem, offset: 0 })
        if (meu !== pedido.current) return
        atual.current = { itens: r.itens.length, total: r.total, ocupado: false }
        setEstado({ itens: r.itens, total: r.total, carregando: false, carregandoMais: false, erro: r.erro ?? null })
      },
      filtro ? ESPERA_MS : 0
    )
    return () => clearTimeout(t)
  }, [filtro, categoria, ordem])

  const carregarMais = useCallback(async () => {
    const a = atual.current
    if (a.ocupado || a.itens >= a.total) return
    const meu = pedido.current
    atual.current = { ...a, ocupado: true }
    setEstado((e) => ({ ...e, carregandoMais: true }))
    const r = await buscarMusicas({ q: filtro, categoria, ordem, offset: a.itens, limite: PAGINA })
    if (meu !== pedido.current) return
    setEstado((e) => {
      const vistos = new Set(e.itens.map((m) => m.numero))
      const itens = [...e.itens, ...r.itens.filter((m) => !vistos.has(m.numero))]
      atual.current = { itens: itens.length, total: r.total || e.total, ocupado: false }
      return { ...e, itens, total: r.total || e.total, carregandoMais: false, erro: r.erro ?? e.erro }
    })
  }, [filtro, categoria, ordem])

  // edição/exclusão no painel: ajusta a lista na tela sem recarregar (nem voltar pro topo).
  // patch = campos novos da música; null = tirou da lista
  const ajustarItem = useCallback((numero, patch) => {
    setEstado((e) => {
      const existe = e.itens.some((m) => m.numero === numero)
      if (!existe) return e
      const itens = patch === null ? e.itens.filter((m) => m.numero !== numero) : e.itens.map((m) => (m.numero === numero ? { ...m, ...patch } : m))
      const total = patch === null ? Math.max(0, e.total - 1) : e.total
      atual.current = { ...atual.current, itens: itens.length, total }
      return { ...e, itens, total }
    })
  }, [])

  return { ...estado, filtrando: filtro !== '', carregarMais, ajustarItem, temMais: estado.itens.length < estado.total }
}
