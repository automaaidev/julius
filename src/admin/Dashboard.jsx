import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, LogOut, Mic2, Check, ListMusic, MessageSquare, Settings2, Music2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { contarMusicas } from '../lib/stats'
import { abertoAgora } from '../lib/schedule'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useQueue, activeRanked } from '../hooks/useQueue'
import { useConversas } from '../hooks/useChat'
import { useEncerramento } from '../hooks/useEncerramento'
import { useAgora } from '../hooks/useAgora'
import FilaPanel from './FilaPanel'
import ChatPanel from './ChatPanel'
import CasaPanel from './CasaPanel'
import MusicasPanel from './MusicasPanel'
import ProximasBar from './ProximasBar'
import BuscaMusicas, { BotaoCardapio } from '../components/BuscaMusicas'
import { copiarTexto } from '../lib/clipboard'
import '../pages/queue.css'
import '../pages/chat.css'
import './admin.css'

const ABAS = [
  ['fila', 'Fila', ListMusic],
  ['chat', 'Chat', MessageSquare],
  ['musicas', 'Músicas', Music2],
  ['casa', 'Casa', Settings2],
]

export default function Dashboard() {
  const { signOut } = useAuth()
  const { settings, loading: loadingSettings, refetch: refetchSettings } = useSettings()
  const { entries, loading: loadingQueue, refetch: refetchQueue } = useQueue()
  const { conversas, loading: loadingConversas, refetch: refetchConversas } = useConversas()
  const agora = useAgora()
  // sem cron no banco: o painel aberto também empurra o encerramento da meia-noite
  useEncerramento(settings?.encerramento_automatico === true)

  const [aba, setAba] = useState('fila')
  const [chatAberto, setChatAberto] = useState(null)
  const [erroPalco, setErroPalco] = useState('')
  const [buscando, setBuscando] = useState(false)

  const ranked = activeRanked(entries)
  const tocando = ranked.find((e) => e.status === 'playing')
  const proximo = ranked.find((e) => e.status === 'waiting')
  const aberto = settings ? abertoAgora(settings, agora) : false
  const naoLidas = conversas.reduce((acc, c) => acc + (c.nao_lidas_admin || 0), 0)

  function abrirChatDoPerfil(perfilId) {
    setChatAberto(perfilId)
    setAba('chat')
  }

  async function chamar(id) {
    setErroPalco('')
    try {
      if (LOCAL) {
        localDb.setEntryStatus(id, 'playing')
      } else {
        const { error } = await supabase.from('queue_entries').update({ status: 'playing' }).eq('id', id)
        if (error) throw error
      }
    } catch (e) {
      setErroPalco(
        e.code === '23505' || e.message === 'JA_TEM_UM_NO_PALCO'
          ? 'Já tem alguém no palco. Conclua antes de chamar outra.'
          : 'Não deu pra atualizar. Tenta de novo.'
      )
    } finally {
      refetchQueue()
    }
  }

  async function concluir(id) {
    setErroPalco('')
    try {
      if (LOCAL) {
        localDb.setEntryStatus(id, 'done')
      } else {
        const { error } = await supabase.from('queue_entries').update({ status: 'done' }).eq('id', id)
        if (error) throw error
      }
    } catch {
      setErroPalco('Não deu pra atualizar. Tenta de novo.')
    } finally {
      refetchQueue()
    }
  }

  async function limparTudo() {
    const { error } = await supabase.rpc('admin_limpar_dados')
    refetchQueue()
    refetchConversas()
    return { ok: !error, erro: error?.message }
  }

  async function reiniciarChats() {
    const { error } = await supabase.rpc('admin_reiniciar_chats')
    refetchConversas()
    return { ok: !error, erro: error?.message }
  }

  return (
    <div className="q-page">
      <div className="adm-shell">
        {LOCAL && (
          <p className="q-local" role="status">
            Modo teste — dados falsos deste navegador, não o banco real. Pra usar o Supabase, configure
            VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env e tire o VITE_LOCAL.
          </p>
        )}
        <div className="adm-topbar">
          <span className="q-brand">
            <img className="q-brand__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
            Painel
          </span>
          <div className="adm-actions">
            <BotaoCardapio compacto onClick={() => setBuscando(true)}>Cardápio</BotaoCardapio>
            <Link to="/" className="q-back"><ExternalLink size={14} /> Ver fila</Link>
            {LOCAL && (
              <button type="button" className="q-back" onClick={() => localDb.reset()}>Resetar dados</button>
            )}
            <button type="button" className="q-back" onClick={signOut}><LogOut size={14} /> Sair</button>
          </div>
        </div>

        <div className="adm-top-grid">
          <div className={`adm-palco ${tocando ? 'adm-palco--on' : ''}`}>
            <span className={`adm-status__badge ${aberto ? 'adm-status__badge--on' : 'adm-status__badge--off'}`}>
              <span className="adm-status__dot" /> {aberto ? 'Casa aberta' : 'Casa fechada'}
            </span>

            {erroPalco && <p className="q-error">{erroPalco}</p>}

            {tocando ? (
              <>
                <div className="adm-palco__now">
                  <Mic2 size={22} />
                  <div>
                    <b>Nº {tocando.numero_musica}</b>
                    <span>{tocando.nome} — no palco</span>
                  </div>
                </div>
                <button className="q-btn q-btn--primary" onClick={() => concluir(tocando.id)}>
                  <Check size={16} /> Concluir
                </button>
              </>
            ) : proximo ? (
              <>
                <div className="adm-palco__now adm-palco__now--off">
                  <Mic2 size={22} />
                  <div>
                    <b>Nº {proximo.numero_musica}</b>
                    <span>{proximo.nome} — a seguir</span>
                  </div>
                </div>
                <button className="q-btn q-btn--primary" onClick={() => chamar(proximo.id)}>
                  <Mic2 size={16} /> Chamar
                </button>
              </>
            ) : (
              <p className="q-note q-note--soft">Ninguém na fila agora.</p>
            )}
          </div>

          {!loadingQueue && <StatsBody entries={entries} />}
        </div>

        {!loadingQueue && <ProximasBar ranked={ranked} />}

        <div className="adm-layout">
          <nav className="adm-sidebar" aria-label="Seções do painel">
            {ABAS.map(([val, label, Icon]) => (
              <button
                key={val}
                type="button"
                className={`adm-sidebar__item ${aba === val ? 'is-active' : ''}`}
                onClick={() => setAba(val)}
                aria-current={aba === val ? 'page' : undefined}
              >
                <Icon size={20} />
                <span>{label}</span>
                {val === 'chat' && naoLidas > 0 && <span className="adm-chat__badge adm-sidebar__badge">{naoLidas}</span>}
              </button>
            ))}
          </nav>

          <main className="adm-main">
            {aba === 'fila' && (
              <div className="q-card">
                <h3 className="adm-h2"><ListMusic size={15} /> Fila · {ranked.length} na vez</h3>
                {loadingQueue ? <p className="q-note">Carregando…</p> : <FilaPanel entries={entries} onAbrirChat={abrirChatDoPerfil} onChanged={refetchQueue} />}
              </div>
            )}

            {aba === 'chat' && (
              <ChatPanel
                aberta={chatAberto}
                onSelecionar={setChatAberto}
                conversas={conversas}
                loadingConversas={loadingConversas}
                onReiniciarChats={LOCAL ? null : reiniciarChats}
              />
            )}

            {aba === 'musicas' && <MusicasPanel />}

            {aba === 'casa' && !loadingSettings && settings && (
              <CasaPanel
                settings={settings}
                onChanged={refetchSettings}
                onLimparTudo={LOCAL ? null : limparTudo}
              />
            )}
          </main>
        </div>

        {buscando && (
          <BuscaMusicas
            admin
            onFechar={() => setBuscando(false)}
            principal={{
              rotulo: 'Copiar nº',
              onClick: async (m) => ((await copiarTexto(m.numero)) ? { feito: 'Copiado' } : { feito: 'Não copiou' }),
            }}
          />
        )}
      </div>
    </div>
  )
}

function StatsBody({ entries }) {
  const s = contarMusicas(entries)
  const tiles = [
    ['Hoje', s.dia],
    ['Semana', s.semana],
    ['Mês', s.mes],
    ['Ano', s.ano],
  ]
  return (
    <p className="adm-stats">
      {tiles.map(([label, n], i) => (
        <span key={label} className="adm-stats__item">
          {i > 0 && <span className="adm-stats__dot" aria-hidden="true">·</span>}
          <b>{n}</b> {label}
        </span>
      ))}
    </p>
  )
}
