import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic2,
  UserRound,
  UsersRound,
  ArrowLeft,
  Plus,
  X,
  Radio,
  ChevronRight,
  Lock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { useSettings } from '../hooks/useSettings'
import { abertoAgora } from '../lib/schedule'
import { useQueue, activeRanked } from '../hooks/useQueue'
import { getPerfilId, getPerfilNome, setPerfilNome } from '../lib/perfil'
import './queue.css'

const ERROS = {
  CASA_FECHADA: 'A casa está fechada no momento.',
  LIMITE_2_MUSICAS: 'Você já tem 2 músicas na fila. Espere uma terminar.',
  NOME_VAZIO: 'Coloque um nome.',
  PERFIL_INVALIDO: 'Não foi possível te identificar. Recarregue a página.',
}

const novaMusica = () => ({ numero: '', comParceiro: false, parceiro: '' })

export default function MyQueue() {
  const { settings, loading: settingsLoading } = useSettings()
  const { entries, loading } = useQueue()

  const [perfilId] = useState(getPerfilId)
  const [nome, setNome] = useState(getPerfilNome())
  // já se identificou nesse navegador -> pula direto pro resultado
  const [passo, setPasso] = useState(getPerfilNome() ? 'resultado' : 'identificacao')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [musicas, setMusicas] = useState([novaMusica()])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const ranked = activeRanked(entries)
  const minhas = ranked.filter((e) => e.perfil_id === perfilId)
  // só bloqueia o pedido quando a casa está confirmadamente fechada.
  // status desconhecido (settings não carregou) -> deixa tentar; a RPC
  // join_queue rejeita com CASA_FECHADA se for o caso.
  const fechadoConfirmado = !settingsLoading && settings != null && !abertoAgora(settings)
  const podePedir = !fechadoConfirmado
  const maxAdicionar = Math.max(0, 2 - minhas.length)

  function continuar(e) {
    e.preventDefault()
    setPerfilNome(nome.trim())
    setMostrarForm(false)
    setPasso('resultado')
  }

  function trocarNome() {
    setPasso('identificacao')
    setMostrarForm(false)
    setErro('')
  }

  function abrirForm() {
    setMusicas([novaMusica()])
    setErro('')
    setMostrarForm(true)
  }

  function patchMusica(i, patch) {
    setMusicas((atual) => atual.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  function adicionarInputMusica() {
    if (musicas.length < maxAdicionar) setMusicas([...musicas, novaMusica()])
  }

  function removerInputMusica(i) {
    setMusicas(musicas.filter((_, idx) => idx !== i))
  }

  async function entrarNaFila(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)

    const pedidos = musicas.filter((m) => m.numero.trim())
    for (const m of pedidos) {
      const parceiro = m.comParceiro ? m.parceiro.trim() : ''
      const nomeMusica = parceiro ? `${nome.trim()} e ${parceiro}` : nome.trim()

      let error = null
      if (LOCAL) {
        try {
          localDb.joinQueue({ nome: nomeMusica, perfil: perfilId, numero: m.numero.trim() })
        } catch (e) {
          error = { message: e.message }
        }
      } else {
        ;({ error } = await supabase.rpc('join_queue', {
          p_nome: nomeMusica,
          p_perfil: perfilId,
          p_numero_musica: m.numero.trim(),
        }))
      }

      if (error) {
        console.error('join_queue falhou:', error)
        setEnviando(false)
        setErro(
          ERROS[error.message] ||
            error.message ||
            'Não foi possível entrar na fila. Tente de novo.'
        )
        return
      }
    }

    setEnviando(false)
    setMostrarForm(false)
    setMusicas([novaMusica()])
  }

  return (
    <div className="q-page">
      <div className="q-shell">
        <div className="q-top">
          <Link to="/" className="q-brand">
            <img className="q-brand__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
          </Link>
          {passo === 'resultado' && (
            <button type="button" className="q-back" onClick={trocarNome}>
              <ArrowLeft size={15} /> Trocar nome
            </button>
          )}
        </div>

        <div className="q-head">
          <h1>Minha fila</h1>
          <p>
            {passo === 'identificacao'
              ? 'Seu nome abre sua fila — sem senha, sem cadastro.'
              : `Fila de ${nome}. Acompanhe sua vez em tempo real.`}
          </p>
        </div>

        {passo === 'identificacao' && (
          <motion.form
            className="q-card q-form"
            onSubmit={continuar}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <label className="q-field">
              <span><UserRound size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Seu nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value.slice(0, 24))}
                placeholder="Ex: Rafa"
                minLength={2}
                maxLength={24}
                required
                autoFocus
              />
            </label>
            <button className="q-btn q-btn--primary" type="submit">
              Continuar <ChevronRight size={18} />
            </button>
          </motion.form>
        )}

        {passo === 'resultado' && (
          <div className="q-stack">
            {loading && <p className="q-note">Carregando…</p>}

            {!loading && minhas.map((e, i) => {
              const naFrente = e.rank - 1
              if (e.status === 'playing') {
                return (
                  <motion.div
                    key={e.id}
                    className="q-card q-card--now"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Link to={`/fila/${e.id}`} className="q-now" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Radio size={30} className="q-now__icon" />
                      <span className="q-now__txt">
                        <strong>É a sua vez!</strong>
                        <span>Nº {e.numero_musica} · {e.nome} — sobe no palco</span>
                      </span>
                    </Link>
                  </motion.div>
                )
              }
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link to={`/fila/${e.id}`} className="q-card q-song">
                    <span className="q-song__rank">
                      <b>{e.rank}</b>
                      <span>na fila</span>
                    </span>
                    <span className="q-song__body">
                      <span className="q-song__title">Nº {e.numero_musica}</span>
                      <span className="q-song__meta">
                        {e.nome} · {naFrente === 0 ? 'você é o próximo' : `${naFrente} na frente`}
                      </span>
                    </span>
                    <ChevronRight size={20} className="q-song__go" />
                  </Link>
                </motion.div>
              )
            })}

            {!loading && minhas.length > 0 && !mostrarForm && (
              <div className="q-count" aria-label={`${minhas.length} de 2 músicas na fila`}>
                <span className="q-count__dots">
                  <i className={minhas.length >= 1 ? 'on' : ''} />
                  <i className={minhas.length >= 2 ? 'on' : ''} />
                </span>
                {minhas.length}/2 músicas na fila
              </div>
            )}

            {!loading && minhas.length === 0 && !mostrarForm && (
              <div className="q-card">
                {podePedir ? (
                  <>
                    <p className="q-note">Você ainda não tem música nessa fila.</p>
                    <button type="button" className="q-btn q-btn--primary" onClick={abrirForm}>
                      <Mic2 size={17} /> Pedir música
                    </button>
                  </>
                ) : (
                  <p className="q-note">
                    <Lock size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    Casa fechada agora. Volte no horário de funcionamento pra pedir música.
                  </p>
                )}
              </div>
            )}

            {!loading && minhas.length > 0 && podePedir && !mostrarForm && (
              maxAdicionar > 0 ? (
                <button type="button" className="q-btn q-btn--ghost" onClick={abrirForm}>
                  <Plus size={17} /> Pedir mais uma música
                </button>
              ) : (
                <p className="q-note q-note--soft">
                  Você atingiu o limite de 2 músicas. Quando uma terminar, dá pra pedir outra.
                </p>
              )
            )}

            {!loading && minhas.length > 0 && fechadoConfirmado && !mostrarForm && (
              <p className="q-note q-note--soft">
                <Lock size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Casa fechada — não dá pra pedir música agora.
              </p>
            )}

            {mostrarForm && (
              <motion.form
                className="q-card q-form"
                onSubmit={entrarNaFila}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>
                  Pedindo como <strong>{nome}</strong>.
                </p>

                {musicas.map((m, i) => (
                  <div key={i} className={`q-songblock ${musicas.length > 1 ? 'is-multi' : ''}`}>
                    {musicas.length > 1 && (
                      <div className="q-songblock__head">
                        <span>Música {i + 1}</span>
                        {i > 0 && (
                          <button
                            type="button"
                            className="q-iconbtn"
                            onClick={() => removerInputMusica(i)}
                            aria-label="Remover música"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    )}

                    <label className="q-field">
                      <span>Número da música</span>
                      <input
                        value={m.numero}
                        onChange={(e) => patchMusica(i, { numero: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="ex: 1234"
                        required
                        minLength={1}
                        maxLength={5}
                        autoFocus={i === 0}
                      />
                    </label>

                    <label className="q-check">
                      <input
                        type="checkbox"
                        checked={m.comParceiro}
                        onChange={(e) => patchMusica(i, { comParceiro: e.target.checked })}
                      />
                      <UsersRound size={16} /> Cantar essa com alguém
                    </label>

                    <AnimatePresence initial={false}>
                      {m.comParceiro && (
                        <motion.div
                          className="q-reveal"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <label className="q-field">
                            <span>Nome da outra pessoa</span>
                            <input
                              value={m.parceiro}
                              onChange={(e) => patchMusica(i, { parceiro: e.target.value.slice(0, 24) })}
                              placeholder="Ex: Bia"
                              minLength={2}
                              maxLength={24}
                              required={m.comParceiro}
                            />
                          </label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {musicas.length < maxAdicionar && (
                  <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={adicionarInputMusica}>
                    <Plus size={15} /> Mandar outra junto
                  </button>
                )}

                {erro && (
                  <p className="q-error">
                    <AlertCircle size={16} /> {erro}
                  </p>
                )}

                <button className="q-btn q-btn--primary" type="submit" disabled={enviando}>
                  <Mic2 size={17} /> {enviando ? 'Entrando…' : 'Entrar na fila'}
                </button>
              </motion.form>
            )}

            {!loading && minhas.length > 0 && (
              <p className="q-hint">
                <RefreshCw size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Atualiza sozinho enquanto a fila anda.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
