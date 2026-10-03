import { useCallback, useEffect, useState } from 'react'
import { supabase, realtimeTopic } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

const ERROS_CHAT = {
  PERFIL_INVALIDO: 'Não foi possível te identificar. Recarregue a página.',
  NUMERO_INVALIDO: 'Manda só o número da música (até 5 dígitos).',
  DEVAGAR: 'Espera uns segundinhos antes de mandar outro número.',
  JA_TEM_UM_NO_PALCO: 'Já tem alguém no palco. Conclua antes de chamar outra.',
  ENTRADA_NAO_ENCONTRADA: 'Essa música não está mais na fila.',
  NAO_PODE_CANCELAR: 'Só dá pra cancelar enquanto a música ainda não foi chamada.',
  CASA_FECHADA: 'A casa está fechada agora.',
  NOME_INVALIDO: 'Coloque um nome de 1 a 24 letras.',
  NAO_AUTORIZADO: 'Sem permissão. Entra no painel de novo.',
}

function mapErro(msg) {
  return ERROS_CHAT[msg] || msg || 'Não deu pra enviar. Tenta de novo.'
}

// ---- cliente: a própria conversa ----
export function useChatCliente(perfilId, chave) {
  const [mensagens, setMensagens] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (LOCAL) {
      setMensagens(localDb.chatMensagens(perfilId))
      setLoading(false)
      return
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data } = await supabase.rpc('chat_mensagens_cliente', {
      p_perfil: perfilId,
      p_chave: chave,
    })
    setMensagens(data ?? [])
    setLoading(false)
  }, [perfilId, chave])

  useEffect(() => {
    if (LOCAL) {
      refetch()
      return localDb.subscribe(refetch)
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    refetch()
    // tópico novo a cada execução do efeito (perfilId pode trocar sem
    // desmontar) — nome fixo reusaria um canal ainda saindo e o realtime
    // morreria em silêncio até a próxima troca.
    const channel = supabase
      .channel(realtimeTopic('chat-cliente'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'julius', table: 'conversas', filter: `perfil_id=eq.${perfilId}` },
        () => refetch()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [perfilId, refetch])

  async function iniciar(nome) {
    if (LOCAL) {
      try {
        await localDb.ready // sem isso, chamar no mount corre antes do
        // SQLite carregar: grava em banco vazio (no-op) e o perfil nunca
        // fica salvo de verdade
        localDb.chatIniciar({ perfil: perfilId, chave, nome })
        refetch()
        return { ok: true }
      } catch (e) {
        return { ok: false, erro: mapErro(e.message) }
      }
    }
    if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
    const { error } = await supabase.rpc('chat_iniciar', {
      p_perfil: perfilId,
      p_chave: chave,
      p_nome: nome,
    })
    if (error) return { ok: false, erro: mapErro(error.message) }
    await refetch()
    return { ok: true }
  }

  async function enviarNumero(numero) {
    if (LOCAL) {
      try {
        localDb.chatPedirMusica({ perfil: perfilId, chave, numero })
        return { ok: true }
      } catch (e) {
        return { ok: false, erro: mapErro(e.message) }
      }
    }
    if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
    const { error } = await supabase.rpc('chat_pedir_musica', {
      p_perfil: perfilId,
      p_chave: chave,
      p_numero: numero,
    })
    if (error) return { ok: false, erro: mapErro(error.message) }
    await refetch()
    return { ok: true }
  }

  // errou o número: tira a música da fila (só enquanto espera) — a pessoa
  // manda o certo em seguida e entra de novo, no fim da fila.
  async function cancelarMusica(entryId) {
    if (LOCAL) {
      try {
        localDb.cancelarMusica({ perfil: perfilId, chave, entryId })
        return { ok: true }
      } catch (e) {
        return { ok: false, erro: mapErro(e.message) }
      }
    }
    if (!supabase) return { ok: false, erro: 'Supabase não configurado.' }
    const { error } = await supabase.rpc('chat_cancelar_musica', {
      p_perfil: perfilId,
      p_chave: chave,
      p_entrada: entryId,
    })
    if (error) return { ok: false, erro: mapErro(error.message) }
    await refetch()
    return { ok: true }
  }

  return { mensagens, loading, iniciar, enviarNumero, cancelarMusica }
}

// ---- admin: inbox de conversas ----
export function useConversas() {
  const [conversas, setConversas] = useState([])
  const [loading, setLoading] = useState(true)
  const [topic] = useState(() => realtimeTopic('conversas-admin'))

  const refetch = useCallback(async () => {
    if (LOCAL) {
      setConversas(localDb.getConversas())
      setLoading(false)
      return
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('conversas')
      .select('*')
      .order('ultima_msg_em', { ascending: false })
    setConversas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (LOCAL) {
      refetch()
      return localDb.subscribe(refetch)
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    refetch()
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', schema: 'julius', table: 'conversas' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'julius', table: 'chat_mensagens' }, () => refetch())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [refetch, topic])

  return { conversas, loading, refetch }
}

// ---- admin: uma conversa aberta ----
export function useThread(perfilId) {
  const [mensagens, setMensagens] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!perfilId) return
    if (LOCAL) {
      setMensagens(localDb.getMensagens(perfilId))
      setLoading(false)
      return
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('chat_mensagens')
      .select('*')
      .eq('perfil_id', perfilId)
      .order('created_at', { ascending: true })
    setMensagens(data ?? [])
    setLoading(false)
  }, [perfilId])

  useEffect(() => {
    if (!perfilId) {
      setMensagens([])
      return
    }
    setLoading(true)
    if (LOCAL) {
      refetch()
      return localDb.subscribe(refetch)
    }
    if (!supabase) {
      setLoading(false)
      return
    }
    refetch()
    const channel = supabase
      .channel(realtimeTopic('chat-thread'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'julius', table: 'chat_mensagens', filter: `perfil_id=eq.${perfilId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMensagens((atual) =>
              atual.some((m) => m.id === payload.new.id) ? atual : [...atual, payload.new]
            )
          } else if (payload.eventType === 'DELETE') {
            setMensagens((atual) => atual.filter((m) => m.id !== payload.old.id))
          } else {
            refetch()
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [perfilId, refetch])

  async function enviar(texto) {
    if (LOCAL) return localDb.adminEnviar(perfilId, texto)
    // otimista: aparece na hora, sem esperar o round-trip do realtime.
    // troca pelo id de verdade quando o INSERT confirmado chega (ou some
    // se der erro), pra não duplicar quando o próprio evento realtime bater.
    const tempId = `tmp-${Math.random().toString(36).slice(2)}`
    const otimista = {
      id: tempId,
      perfil_id: perfilId,
      autor: 'admin',
      texto,
      created_at: new Date().toISOString(),
    }
    setMensagens((atual) => [...atual, otimista])
    const { data, error } = await supabase
      .from('chat_mensagens')
      .insert({ perfil_id: perfilId, autor: 'admin', texto })
      .select()
      .single()
    setMensagens((atual) => {
      if (error) return atual.filter((m) => m.id !== tempId)
      return atual.map((m) => (m.id === tempId ? data : m))
    })
  }

  async function apagar(id) {
    if (LOCAL) return localDb.apagarMensagem(id)
    setMensagens((atual) => atual.filter((m) => m.id !== id))
    await supabase.from('chat_mensagens').delete().eq('id', id)
  }

  async function marcarLida() {
    if (LOCAL) return localDb.marcarLida(perfilId)
    await supabase.from('conversas').update({ nao_lidas_admin: 0 }).eq('perfil_id', perfilId)
  }

  return { mensagens, loading, enviar, apagar, marcarLida }
}
