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
  catalogoCompleto = null
  ouvintes.forEach((cb) => cb())
}

// busca no banco o que ainda não está no cache; LANÇA se o banco não responder
async function carregarNumeros(numeros) {
  const faltando = numeros.filter((n) => !cache.has(n))
  if (faltando.length === 0) return
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
}

export async function obterMusicas(numeros) {
  const unicos = [...new Set(numeros.filter(Boolean))]
  try {
    await carregarNumeros(unicos)
  } catch {
    /* sem catálogo (ou migration pendente): fica só o número, sem cachear */
  }
  return new Map(unicos.map((n) => [n, cache.get(n) ?? null]))
}

// O catálogo só serve de conferência se estiver carregado de verdade: com ele vazio
// (ainda não importado) ou quase vazio, "não achei" seria mentira e travaria todo pedido.
const CATALOGO_MINIMO = 500
let catalogoCompleto = null // Promise<boolean>, por sessão

function conferenciaDisponivel() {
  if (!catalogoCompleto) {
    catalogoCompleto = contarCatalogo()
      .then((n) => n >= CATALOGO_MINIMO)
      .catch(() => {
        catalogoCompleto = null // tenta de novo na próxima
        return false
      })
  }
  return catalogoCompleto
}

// O número existe no cardápio? { existe: true, musica } | { existe: false } | { existe: null }
// (null = não dá pra saber: banco fora do ar ou catálogo não carregado — nesse caso
// quem chama NÃO deve barrar o pedido).
export async function conferirNumero(numero) {
  const n = String(numero ?? '').trim()
  if (!n) return { existe: null }
  try {
    await carregarNumeros([n])
    const musica = cache.get(n)
    if (musica) return { existe: true, musica }
    return (await conferenciaDisponivel()) ? { existe: false } : { existe: null }
  } catch {
    return { existe: null }
  }
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

// ---- admin: adicionar, editar e excluir músicas do cardápio ----
// Erros saem como códigos (NUMERO_INVALIDO, TITULO_INVALIDO, ARTISTA_INVALIDO,
// CODIGO_EXISTE) — o painel traduz em admin/erros.js.

const LIMITE_TEXTO = 120

function validar({ numero, titulo, artista, categoria }, { comNumero }) {
  const dados = {
    titulo: String(titulo ?? '').trim(),
    artista: String(artista ?? '').trim() || null,
    categoria: CATEGORIAS.includes(categoria) ? categoria : null,
  }
  if (dados.titulo.length < 1 || dados.titulo.length > LIMITE_TEXTO) throw new Error('TITULO_INVALIDO')
  if (dados.artista && dados.artista.length > LIMITE_TEXTO) throw new Error('ARTISTA_INVALIDO')
  if (comNumero) {
    dados.numero = String(numero ?? '').trim()
    if (!/^[0-9]{1,5}$/.test(dados.numero)) throw new Error('NUMERO_INVALIDO')
  }
  return dados
}

function traduzir(error) {
  if (error?.code === '23505') return new Error('CODIGO_EXISTE')
  if (error?.code === '23514') return new Error(/titulo/i.test(error.message) ? 'TITULO_INVALIDO' : 'NUMERO_INVALIDO')
  return error
}

export async function adicionarMusicaCardapio(campos) {
  const dados = validar(campos, { comNumero: true })
  if (LOCAL) {
    await localDb.ready
    localDb.inserirMusica(dados)
  } else {
    const { error } = await supabase.from('musicas').insert(dados)
    if (error) throw traduzir(error)
  }
  catalogoMudou()
  return dados
}

// o código não muda aqui (fila e caderninho guardam o número): código errado = excluir e adicionar de novo
export async function atualizarMusicaCardapio(numero, campos) {
  const dados = validar(campos, { comNumero: false })
  if (LOCAL) {
    await localDb.ready
    localDb.atualizarMusica(numero, dados)
  } else {
    const { error } = await supabase.from('musicas').update(dados).eq('numero', numero)
    if (error) throw traduzir(error)
  }
  catalogoMudou()
  return dados
}

export async function excluirMusicaCardapio(numero) {
  if (LOCAL) {
    await localDb.ready
    localDb.excluirMusica(numero)
  } else {
    const { error } = await supabase.from('musicas').delete().eq('numero', numero)
    if (error) throw traduzir(error)
  }
  catalogoMudou()
}
