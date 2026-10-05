// Banco de avisos da casa (tabela julius.avisos — migration 20261005_avisos_e_sinais.sql)
// e os sinais que o operador põe nos pedidos da fila.
//
// Três tipos de texto, todos editáveis na aba Avisos do painel:
//   'faq'      perguntas e respostas: o cliente abre em "Dúvidas"
//   'aviso'    aviso da casa: aparece no topo da tela do cliente enquanto estiver ativo
//   'resposta' resposta pronta: vira botão no chat do operador

import { supabase } from './supabaseClient'
import { LOCAL } from './flags'
import { localDb } from './localDb'

export const TIPOS_AVISO = ['faq', 'aviso', 'resposta']

// Sinais do operador num pedido. "Já cantou" (✅) não é um sinal: é o status 'done'.
export const SINAIS = {
  visto: { emoji: '👀', rotulo: 'Visto pela equipe', curto: 'Visto' },
  aparelho: { emoji: '🎶', rotulo: 'Já está no aparelho', curto: 'No aparelho' },
  ajuda: { emoji: '❓', rotulo: 'A equipe vai confirmar o número com você', curto: 'Confirmar' },
}

const COLS = 'id,tipo,titulo,texto,ativo,ordem,created_at'

// Quem não está logado só recebe o que está ativo (a policy do banco garante).
// `incluirInativos` é do painel.
export async function listarAvisos({ tipo = null, incluirInativos = false } = {}) {
  try {
    if (LOCAL) {
      await localDb.ready
      return { itens: localDb.getAvisos({ tipo, incluirInativos }) }
    }
    if (!supabase) return { itens: [] }
    let q = supabase.from('avisos').select(COLS).order('ordem', { ascending: true }).order('created_at', { ascending: true })
    if (tipo) q = q.eq('tipo', tipo)
    if (!incluirInativos) q = q.eq('ativo', true)
    const { data, error } = await q
    if (error) return { itens: [], erro: error.message }
    return { itens: data ?? [] }
  } catch (e) {
    return { itens: [], erro: e?.message || 'falha' }
  }
}

function validar({ tipo, titulo, texto }) {
  const dados = { titulo: String(titulo ?? '').trim(), texto: String(texto ?? '').trim() }
  if (tipo !== undefined) {
    if (!TIPOS_AVISO.includes(tipo)) throw new Error('AVISO_INVALIDO')
    dados.tipo = tipo
  }
  if (dados.titulo.length < 1 || dados.titulo.length > 120) throw new Error('AVISO_TITULO_INVALIDO')
  if (dados.texto.length < 1 || dados.texto.length > 600) throw new Error('AVISO_TEXTO_INVALIDO')
  return dados
}

export async function criarAviso({ tipo, titulo, texto, ordem = 0 }) {
  const dados = { ...validar({ tipo, titulo, texto }), ordem }
  if (LOCAL) {
    await localDb.ready
    return localDb.criarAviso(dados)
  }
  const { error } = await supabase.from('avisos').insert(dados)
  if (error) throw error
}

export async function atualizarAviso(id, campos) {
  const dados = campos.titulo !== undefined || campos.texto !== undefined ? validar(campos) : {}
  if (typeof campos.ativo === 'boolean') dados.ativo = campos.ativo
  if (LOCAL) {
    await localDb.ready
    return localDb.atualizarAviso(id, dados)
  }
  const { error } = await supabase.from('avisos').update(dados).eq('id', id)
  if (error) throw error
}

export async function excluirAviso(id) {
  if (LOCAL) {
    await localDb.ready
    return localDb.excluirAviso(id)
  }
  const { error } = await supabase.from('avisos').delete().eq('id', id)
  if (error) throw error
}

// ---- sinais na fila (painel) ----

// sinal = 'visto' | 'aparelho' | 'ajuda' | null (tira o sinal)
export async function definirSinal(ids, sinal) {
  const lista = Array.isArray(ids) ? ids : [ids]
  if (lista.length === 0) return
  if (sinal !== null && !SINAIS[sinal]) throw new Error('SINAL_INVALIDO')
  if (LOCAL) {
    localDb.setSinal(lista, sinal)
    return
  }
  const { error } = await supabase.from('queue_entries').update({ sinal }).in('id', lista)
  if (error) throw error
}

// mensagem do operador no chat de uma pessoa (mesma que o painel de chat manda)
export async function mensagemDoOperador(perfilId, texto) {
  if (LOCAL) {
    localDb.adminEnviar(perfilId, texto)
    return
  }
  const { error } = await supabase.from('chat_mensagens').insert({ perfil_id: perfilId, autor: 'admin', texto })
  if (error) throw error
}
