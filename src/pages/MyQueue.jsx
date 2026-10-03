import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Send,
  Radio,
  Lock,
  AlertCircle,
  RefreshCw,
  Mic2,
  NotebookPen,
  Flame,
  Moon,
} from 'lucide-react'
import { LOCAL } from '../lib/flags'
import { useSettings } from '../hooks/useSettings'
import { abertoAgora, proximaAbertura } from '../lib/schedule'
import { useQueue, activeRanked } from '../hooks/useQueue'
import { useChatCliente } from '../hooks/useChat'
import { useSugestoes } from '../hooks/useSugestoes'
import { useAgora } from '../hooks/useAgora'
import { useEncerramento } from '../hooks/useEncerramento'
import { getPerfilId, getPerfilChave, getPerfilNome, setPerfilNome } from '../lib/perfil'
import { useTitulos } from '../hooks/useTitulos'
import { useCantadas, registrarCantada, jaCantei, adicionarMusica } from '../lib/cantadas'
import BuscaMusicas, { BotaoCardapio } from '../components/BuscaMusicas'
import Caderninho from './Caderninho'
import './queue.css'
import './chat.css'

export default function MyQueue() {
  const { settings, loading: settingsLoading } = useSettings()
  const { entries, loading: queueLoading, refetch: refetchQueue } = useQueue()
  const { sugestoes } = useSugestoes(10)
  const { itens: cantadas } = useCantadas()
  const agora = useAgora()
  useEncerramento(settings?.encerramento_automatico === true)

  const [perfilId] = useState(getPerfilId)
  const [chave] = useState(getPerfilChave)
  const [nome, setNome] = useState(getPerfilNome())
  const [identificando, setIdentificando] = useState(!getPerfilNome())
  const [campoNome, setCampoNome] = useState('')
  const [campoNumero, setCampoNumero] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('pedir')
  const [repetida, setRepetida] = useState(null) // número que a pessoa já cantou, esperando confirmação
  const [cancelando, setCancelando] = useState(null) // id da entrada com "tirar da fila?" aberto
  const [buscando, setBuscando] = useState(false) // folha de busca de música aberta

  const { mensagens, loading: chatLoading, iniciar, enviarNumero, cancelarMusica } = useChatCliente(perfilId, chave)

  const scrollRef = useRef(null)
  const numeroRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens.length])

  // já se identificou antes nesse navegador -> resincroniza com o servidor
  // (idempotente) sem precisar passar pela tela de nome de novo.
  useEffect(() => {
    if (getPerfilNome()) iniciar(getPerfilNome())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ranked = activeRanked(entries)
  const minhas = ranked.filter((e) => e.perfil_id === perfilId)
  const titulos = useTitulos(minhas.map((e) => e.numero_musica))

  // música minha que foi pro palco e terminou -> vira "já cantei" no caderninho
  useEffect(() => {
    for (const e of entries) {
      if (e.perfil_id === perfilId && e.status === 'done') registrarCantada(e.id, e.numero_musica)
    }
  }, [entries, perfilId])

  const limite = settings?.limite_musicas ?? 1
  const noLimite = minhas.length >= limite
  const aberto = settings ? abertoAgora(settings, agora) : undefined
  const fechadoConfirmado = !settingsLoading && settings != null && !aberto
  const abreEm = fechadoConfirmado ? proximaAbertura(settings.horario_funcionamento, agora) : null
  const podePedir = !identificando && !fechadoConfirmado && !noLimite
  const motivoSemPedir = identificando
    ? 'Coloque seu nome no chat pra poder pedir música.'
    : fechadoConfirmado
      ? 'A casa está fechada agora.'
      : noLimite
        ? limite === 1
          ? 'Você já tem 1 música na fila.'
          : `Você já tem ${limite} músicas na fila.`
        : null

  // sugestões: tira o que a pessoa já tem na fila, o que já cantou e — com o
  // intervalo pra repetir ligado — o que qualquer um já tem na fila (o
  // servidor barraria de qualquer jeito)
  const minhasNumeros = new Set(minhas.map((e) => e.numero_musica))
  const naFilaNumeros = new Set(ranked.map((e) => e.numero_musica))
  const bloqueiaRepetida = (settings?.intervalo_repetir_min ?? 0) > 0
  const dicas = sugestoes
    .filter(
      (s) =>
        !minhasNumeros.has(s.numero) &&
        !jaCantei(cantadas, s.numero) &&
        !(bloqueiaRepetida && naFilaNumeros.has(s.numero))
    )
    .slice(0, 6)

  function escolherNumero(n) {
    setCampoNumero(n)
    setRepetida(null)
    setErro('')
    setAba('pedir')
    setTimeout(() => numeroRef.current?.focus(), 60)
  }

  async function confirmarNome(e) {
    e.preventDefault()
    const n = campoNome.trim()
    if (!n) return
    setEnviando(true)
    setErro('')
    try {
      const r = await iniciar(n)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setPerfilNome(n)
      setNome(n)
      setIdentificando(false)
      setCampoNome('')
    } finally {
      setEnviando(false)
    }
  }

  async function enviar(n) {
    setEnviando(true)
    setErro('')
    try {
      const r = await enviarNumero(n)
      setCampoNumero('')
      setRepetida(null)
      if (!r.ok) setErro(r.erro)
      refetchQueue()
    } finally {
      setEnviando(false)
    }
  }

  function enviarMsg(e) {
    e.preventDefault()
    const n = campoNumero.trim()
    if (!n) return
    // já cantou essa (pelo caderninho)? pergunta antes — evita pedir a mesma
    // música e bagunçar a ordem da fila
    if (jaCantei(cantadas, n)) {
      setRepetida(n)
      return
    }
    enviar(n)
  }

  async function tirarDaFila(id) {
    setEnviando(true)
    setErro('')
    try {
      const r = await cancelarMusica(id)
      if (!r.ok) setErro(r.erro)
      setCancelando(null)
      refetchQueue()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="q-page">
      <div className="q-shell q-shell--top">
        {LOCAL && (
          <p className="q-local" role="status">
            Modo teste — dados falsos deste navegador, não o banco real.
          </p>
        )}
        <div className="q-top">
          <Link to="/minha-fila" className="q-brand">
            <img className="q-brand__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
          </Link>
          {!identificando && (
            <button
              type="button"
              className="q-back"
              onClick={() => {
                setIdentificando(true)
                setErro('')
              }}
            >
              <ArrowLeft size={15} /> Trocar nome
            </button>
          )}
        </div>

        <div className="q-head">
          <h1>{nome ? `Oi, ${nome}!` : 'Minha fila'}</h1>
          <p>Manda o número da música aqui no chat — sem senha, sem cadastro.</p>
          {aberto !== undefined && (
            <p className="q-status">
              <span className={`q-status__pill ${aberto ? 'is-on' : 'is-off'}`}>
                <span className="q-status__dot" /> {aberto ? 'Casa aberta' : 'Casa fechada'}
              </span>
              {!aberto && abreEm && <span className="q-status__hint">{abreEm.label}</span>}
              {aberto && settings?.encerramento_automatico === true && (
                <span className="q-status__hint"><Moon size={12} /> A fila encerra à meia-noite</span>
              )}
            </p>
          )}
        </div>

        <div className="q-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'pedir'}
            className={`q-tab ${aba === 'pedir' ? 'is-active' : ''}`}
            onClick={() => setAba('pedir')}
          >
            <Mic2 size={15} /> Pedir música
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'caderninho'}
            className={`q-tab ${aba === 'caderninho' ? 'is-active' : ''}`}
            onClick={() => setAba('caderninho')}
          >
            <NotebookPen size={15} /> Meu caderninho
          </button>
        </div>

        <div className="q-busca">
          <BotaoCardapio onClick={() => setBuscando(true)}>Cardápio de músicas — veja o número</BotaoCardapio>
        </div>

        {aba === 'caderninho' && <Caderninho onPedir={escolherNumero} podePedir={podePedir} />}

        {aba === 'pedir' && (
          <>
            {minhas.length > 0 && (
              <div className="q-stack" style={{ marginBottom: '0.8rem' }}>
                {minhas.map((minha) => (
                  <motion.div
                    key={minha.id}
                    className={`q-card ${minha.status === 'playing' ? 'q-card--now' : ''}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Link to={`/fila/${minha.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      {minha.status === 'playing' ? (
                        <div className="q-now">
                          <Radio size={26} className="q-now__icon" />
                          <span className="q-now__txt">
                            <strong>É a sua vez!</strong>
                            <span>
                              {titulos.get(minha.numero_musica)?.titulo
                                ? `${titulos.get(minha.numero_musica).titulo} (Nº ${minha.numero_musica})`
                                : `Nº ${minha.numero_musica}`}{' '}
                              — sobe no palco
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="q-song">
                          <span className="q-song__rank">
                            <b>{minha.rank}</b>
                            <span>na fila</span>
                          </span>
                          <span className="q-song__body">
                            <span className="q-song__title">
                              {titulos.get(minha.numero_musica)?.titulo ?? `Nº ${minha.numero_musica}`}
                            </span>
                            <span className="q-song__meta">
                              {titulos.get(minha.numero_musica)?.titulo && `Nº ${minha.numero_musica} · `}
                              {minha.rank === 1 ? 'você é o próximo' : `${minha.rank - 1} na frente`}
                            </span>
                          </span>
                        </div>
                      )}
                    </Link>

                    {minha.status === 'waiting' &&
                      (cancelando === minha.id ? (
                        <div className="q-cancel">
                          <span>Tirar a Nº {minha.numero_musica} da fila?</span>
                          <div className="q-cancel__acts">
                            <button
                              type="button"
                              className="q-btn q-btn--danger q-btn--sm"
                              onClick={() => tirarDaFila(minha.id)}
                              disabled={enviando}
                            >
                              Sim, cancelar
                            </button>
                            <button
                              type="button"
                              className="q-btn q-btn--ghost q-btn--sm"
                              onClick={() => setCancelando(null)}
                              disabled={enviando}
                            >
                              Voltar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="q-linkbtn" onClick={() => setCancelando(minha.id)}>
                          Errou o número? Cancelar e mandar outro
                        </button>
                      ))}
                  </motion.div>
                ))}
              </div>
            )}

            <div className="q-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 380 }}>
              <div className="chat-thread" ref={scrollRef}>
                {(chatLoading || queueLoading) && <p className="q-note">Carregando…</p>}
                {!chatLoading &&
                  mensagens.map((m) =>
                    m.queue_entry_id ? (
                      <Link key={m.id} to={`/fila/${m.queue_entry_id}`} className={`chat-bubble chat-bubble--${m.autor}`}>
                        {m.texto}
                      </Link>
                    ) : (
                      <div key={m.id} className={`chat-bubble chat-bubble--${m.autor}`}>
                        {m.texto}
                      </div>
                    )
                  )}
              </div>

              {erro && (
                <p className="q-error">
                  <AlertCircle size={16} /> {erro}
                </p>
              )}

              {repetida && (
                <div className="q-warn" role="alert">
                  <span>
                    Você já cantou a <b>Nº {repetida}</b> (tá marcada no seu caderninho). Quer pedir de novo mesmo assim?
                  </span>
                  <div className="q-cancel__acts">
                    <button
                      type="button"
                      className="q-btn q-btn--primary q-btn--sm"
                      onClick={() => enviar(repetida)}
                      disabled={enviando}
                    >
                      Pedir mesmo assim
                    </button>
                    <button
                      type="button"
                      className="q-btn q-btn--ghost q-btn--sm"
                      onClick={() => {
                        setRepetida(null)
                        setCampoNumero('')
                      }}
                      disabled={enviando}
                    >
                      Escolher outra
                    </button>
                  </div>
                </div>
              )}

              {identificando ? (
                <form className="chat-composer" onSubmit={confirmarNome}>
                  <input
                    value={campoNome}
                    onChange={(e) => setCampoNome(e.target.value.slice(0, 24))}
                    placeholder="Qual seu nome (ou da dupla)?"
                    minLength={1}
                    maxLength={24}
                    autoFocus
                    required
                  />
                  <button className="q-iconbtn" type="submit" disabled={enviando} aria-label="Enviar">
                    <Send size={16} />
                  </button>
                </form>
              ) : fechadoConfirmado ? (
                <p className="chat-lock">
                  <Lock size={13} /> Casa fechada agora. Volte no horário de funcionamento pra pedir música.
                </p>
              ) : noLimite ? (
                <p className="chat-lock">
                  {limite === 1
                    ? 'Você já tem 1 música na fila. Quando terminar, dá pra pedir outra aqui.'
                    : `Você já tem ${limite} músicas na fila. Quando uma terminar, dá pra pedir outra aqui.`}
                </p>
              ) : (
                <form className="chat-composer" onSubmit={enviarMsg}>
                  <input
                    ref={numeroRef}
                    value={campoNumero}
                    onChange={(e) => {
                      setCampoNumero(e.target.value.replace(/\D/g, '').slice(0, 5))
                      setRepetida(null)
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Número da música"
                    maxLength={5}
                    required
                  />
                  <button className="q-iconbtn" type="submit" disabled={enviando} aria-label="Enviar">
                    <Send size={16} />
                  </button>
                </form>
              )}
            </div>

            {podePedir && dicas.length > 0 && (
              <div className="q-card q-sug">
                <h3 className="q-sug__h"><Flame size={14} /> Sem ideia do que cantar? As mais pedidas</h3>
                <div className="q-sug__list">
                  {dicas.map((s) => (
                    <button key={s.numero} type="button" className="q-chip" onClick={() => escolherNumero(s.numero)}>
                      <b>{s.numero}</b>
                      <span>{s.titulo || (s.vezes > 0 ? `cantada ${s.vezes}×` : '')}</span>
                    </button>
                  ))}
                </div>
                <p className="q-sug__hint">Toca numa pra preencher o número e é só enviar.</p>
              </div>
            )}

            {!queueLoading && (
              <p className="q-hint">
                <RefreshCw size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Atualiza sozinho enquanto a fila anda.
              </p>
            )}
          </>
        )}

        {buscando && (
          <BuscaMusicas
            onFechar={() => setBuscando(false)}
            principal={{
              rotulo: 'Pedir',
              desabilitada: !podePedir,
              dica: motivoSemPedir ?? undefined,
              onClick: (m) => {
                escolherNumero(m.numero)
                return { fechar: true }
              },
            }}
            secundaria={{
              rotulo: 'Anotar no caderninho',
              Icone: NotebookPen,
              onClick: (m) => {
                const r = adicionarMusica({ numero: m.numero, titulo: m.titulo })
                return { feito: !r.ok ? 'Cheio' : r.repetida ? 'Já anotada' : 'Anotada' }
              },
            }}
            aviso={motivoSemPedir ? `${motivoSemPedir} Dá pra anotar no caderninho e pedir depois.` : null}
          />
        )}
      </div>
    </div>
  )
}
