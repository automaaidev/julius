import { useEffect, useState } from 'react'
import { Send, Trash2, User, MessageSquareOff } from 'lucide-react'
import { useThread } from '../hooks/useChat'
import { useAvisos } from '../hooks/useAvisos'
import AcaoPerigosa from './AcaoPerigosa'

function tempoRelativo(iso) {
  if (!iso) return ''
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return `${Math.round(diffH / 24)}d`
}

// inbox (1 conversa por perfil_id) + thread aberta. `aberta`/`onSelecionar`
// ficam no Dashboard pra sobreviver à troca de aba (ex: clicar "chat" numa
// entrada da fila já abre a conversa certa). `conversas`/`loadingConversas`
// também vêm do Dashboard — só 1 assinatura realtime pra essa lista, não 2
// (2 instâncias de useConversas() competiam pelo mesmo canal e derrubavam
// o app: "cannot add postgres_changes callbacks... after subscribe()").
export default function ChatPanel({ aberta, onSelecionar, conversas, loadingConversas: loading, onReiniciarChats }) {
  const conversaAberta = conversas.find((c) => c.perfil_id === aberta) || null

  return (
    <div className="adm-chat">
      <div className={`adm-chat__inbox ${aberta ? 'is-hidden-mobile' : ''}`}>
        {onReiniciarChats && (
          <div className="adm-chat__danger">
            <AcaoPerigosa
              primeira
              icone={MessageSquareOff}
              titulo="Reiniciar chats"
              descricao="Apaga todas as conversas e mensagens. A fila continua intacta."
              confirmacao="Isso apaga todos os chats e mensagens — pra sempre. A fila não é afetada."
              palavra="reiniciar"
              rotulo="Reiniciar chats"
              feedback="Chats reiniciados."
              executar={onReiniciarChats}
            />
          </div>
        )}
        {loading && <p className="q-note">Carregando…</p>}
        {!loading && conversas.length === 0 && (
          <p className="q-note q-note--soft">Nenhuma conversa ainda.</p>
        )}
        {conversas.map((c) => (
          <button
            key={c.perfil_id}
            type="button"
            className={`adm-chat__row ${aberta === c.perfil_id ? 'is-active' : ''}`}
            onClick={() => onSelecionar(c.perfil_id)}
          >
            <span className="adm-chat__avatar"><User size={16} /></span>
            <span className="adm-chat__row-body">
              <span className="adm-chat__row-top">
                <b>{c.nome}</b>
                <span className="adm-chat__time">{tempoRelativo(c.ultima_msg_em)}</span>
              </span>
              <span className="adm-chat__preview">{c.ultima_msg_texto}</span>
            </span>
            {c.nao_lidas_admin > 0 && <span className="adm-chat__badge">{c.nao_lidas_admin}</span>}
          </button>
        ))}
      </div>

      <div className={`adm-chat__thread ${!aberta ? 'is-hidden-mobile' : ''}`}>
        {conversaAberta ? (
          <Thread perfilId={aberta} nome={conversaAberta.nome} onVoltar={() => onSelecionar(null)} />
        ) : (
          <p className="q-note q-note--soft">Escolha uma conversa.</p>
        )}
      </div>
    </div>
  )
}

function Thread({ perfilId, nome, onVoltar }) {
  const { mensagens, loading, enviar, apagar, marcarLida } = useThread(perfilId)
  const { itens: respostas } = useAvisos('resposta') // respostas prontas (aba Avisos)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    marcarLida()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilId])

  async function onSubmit(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    setTexto('')
    await enviar(t)
  }

  return (
    <>
      <div className="adm-chat__head">
        <button type="button" className="adm-chat__back" onClick={onVoltar} aria-label="Voltar">‹</button>
        <b>{nome}</b>
      </div>

      <div className="chat-thread">
        {loading && <p className="q-note">Carregando…</p>}
        {mensagens.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.autor}`}>
            <span>{m.texto}</span>
            <button type="button" className="chat-bubble__del" onClick={() => apagar(m.id)} aria-label="Apagar mensagem">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {respostas.length > 0 && (
        <div className="adm-chat__quick">
          {respostas.map((r) => (
            <button key={r.id} type="button" className="adm-chat__chip" onClick={() => enviar(r.texto)} title={r.texto}>
              {r.titulo}
            </button>
          ))}
        </div>
      )}

      <form className="chat-composer" onSubmit={onSubmit}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma mensagem…" maxLength={500} />
        <button type="submit" className="q-iconbtn" aria-label="Enviar">
          <Send size={16} />
        </button>
      </form>
    </>
  )
}
