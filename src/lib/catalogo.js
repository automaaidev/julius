// Catálogo de músicas do aparelho (número -> título + cantor + categoria).
//
// Fica na tabela julius.musicas (ver supabase/migrations/20261004_catalogo_musicas.sql)
// e é carregado pelo painel a partir de src/data/catalogo.json, gerado por
// scripts/gerar-catalogo.py a partir das listas em PDF. Em modo local (LOCAL)
// tudo isso roda no SQLite do navegador.

import { supabase } from './supabaseClient'
import { LOCAL } from './flags'
import { localDb } from './localDb'
import { normalizar } from './normalizar'

// ordem em que os filtros aparecem na busca
export const CATEGORIAS = ['Nacionais', 'Internacionais', 'Infantis', 'Evangélicas', 'Japonesas', 'Italianas', 'Novidades']

// texto de filtro só vale a partir daqui (menos que isso = cardápio sem filtro)
export const MIN_BUSCA = 2
// músicas por "página" do cardápio
export const PAGINA = 50

export const ORDENS = [
  ['titulo', 'Música A–Z'],
  ['artista', 'Cantor A–Z'],
]

// ---- cardápio / busca ----

// Páginas já buscadas ficam na memória por alguns minutos: abrir o cardápio de novo,
// voltar pra uma categoria ou apagar o filtro não vai ao banco outra vez (30 pessoas
// abrindo o cardápio juntas pedem quase sempre a mesma primeira página). O catálogo
// quase não muda; quando muda (importação, nome editado no painel) o cache zera.
const paginas = new Map() // chave -> { em, resultado }
const VALIDADE_MS = 10 * 60_000
const MAX_PAGINAS = 300

// { itens, total, erro } — nunca lança. Sem `q` (ou com menos de MIN_BUSCA letras)
// devolve o catálogo inteiro, na ordem pedida, `limite` por vez a partir de `offset`.
// `total` = quantas músicas casam com o filtro (sem contar a paginação).
// `erro` só quando o banco não respondeu (ou falta migration).
export async function buscarMusicas({ q = '', categoria = null, limite = PAGINA, offset = 0, ordem = 'titulo' }) {
  try {
    if (LOCAL) {
      await localDb.ready
      return localDb.buscarMusicas(normalizar(q), categoria, limite, offset, ordem)
    }
    if (!supabase) return { itens: [], total: 0, erro: 'sem-banco' }
    const chave = [normalizar(q), categoria ?? '', ordem, offset, limite].join('|')
    const guardada = paginas.get(chave)
    if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.resultado
    const { data, error } = await supabase.rpc('buscar_musicas', {
      p_q: q,
      p_categoria: categoria,
      p_limite: limite,
      p_offset: offset,
      p_ordem: ordem,
    })
    if (error) return { itens: [], total: 0, erro: error.message }
    const itens = (data ?? []).map(({ total: _total, ...m }) => m)
    // só a 1ª página traz o total sem filtro de texto (as outras vêm 0): quem pede é o hook, que já o tem
    const resultado = { itens, total: Number(data?.[0]?.total ?? 0) }
    if (paginas.size >= MAX_PAGINAS) paginas.delete(paginas.keys().next().value)
    paginas.set(chave, { em: Date.now(), resultado })
    return resultado
  } catch (e) {
    return { itens: [], total: 0, erro: e?.message || 'falha' }
  }
}

// ---- título por número (fila, próximas, caderninho) ----

// numero -> { numero, titulo, artista } | null. Cache por sessão (inclui "não
// achou"); zera quando o catálogo é importado.
const cache = new Map()
const ouvintes = new Set()

export function aoMudarCatalogo(cb) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

// chamado quando o catálogo muda (importação, nome editado): zera os caches
export function catalogoMudou() {
  cache.clear()
  paginas.clear()
  ouvintes.forEach((cb) => cb())
}

export async function obterMusicas(numeros) {
  const unicos = [...new Set(numeros.filter(Boolean))]
  const faltando = unicos.filter((n) => !cache.has(n))
  if (faltando.length > 0) {
    try {
      let rows = []
      if (LOCAL) {
        await localDb.ready
        rows = localDb.getMusicas(faltando)
      } else if (supabase) {
        const { data, error } = await supabase.from('musicas').select('numero, titulo, artista').in('numero', faltando)
        if (error) throw error
        rows = data ?? []
      }
      for (const n of faltando) cache.set(n, null)
      for (const r of rows) cache.set(r.numero, r)
    } catch {
      /* sem catálogo (ou migration pendente): fica só o número, sem cachear */
    }
  }
  return new Map(unicos.map((n) => [n, cache.get(n) ?? null]))
}

// "Título — Cantor" pra mostrar numa linha só
export function rotuloMusica(m) {
  if (!m?.titulo) return ''
  return m.artista ? `${m.titulo} — ${m.artista}` : m.titulo
}

// ---- admin: tamanho, importação, destaque ----

export async function contarCatalogo() {
  if (LOCAL) {
    await localDb.ready
    return localDb.contarCatalogo()
  }
  if (!supabase) return 0
  const { count, error } = await supabase.from('musicas').select('numero', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

const LOTE = 500

// Carrega o catálogo do arquivo gerado pelo script. Pode rodar de novo: atualiza
// título/cantor/categoria dos que já existem e não mexe em `destaque`.
export async function importarCatalogo(onProgresso) {
  const { default: dados } = await import('../data/catalogo.json')
  const { categorias, itens } = dados
  const total = itens.length
  const linhas = itens.map(([numero, titulo, artista, cat]) => [numero, titulo, artista, categorias[cat]])

  if (LOCAL) {
    await localDb.ready
    localDb.importarCatalogo(linhas)
    onProgresso?.(total, total)
  } else {
    for (let i = 0; i < total; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE).map(([numero, titulo, artista, categoria]) => ({
        numero,
        titulo,
        artista: artista || null,
        categoria,
      }))
      const { error } = await supabase.from('musicas').upsert(lote, { onConflict: 'numero' })
      if (error) throw error
      onProgresso?.(Math.min(i + LOTE, total), total)
    }
  }
  catalogoMudou()
  return total
}

export async function definirDestaque(numero, valor) {
  if (LOCAL) {
    localDb.definirDestaque(numero, valor)
    return
  }
  const { error } = await supabase.from('musicas').update({ destaque: valor }).eq('numero', numero)
  if (error) throw error
}
