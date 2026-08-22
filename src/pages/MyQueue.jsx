import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../hooks/useSettings'
import { useQueue, activeRanked } from '../hooks/useQueue'
import { IconMic } from './icons'

const ERROS = {
  CASA_FECHADA: 'A casa está fechada no momento.',
  LIMITE_2_MUSICAS: 'Esse telefone já tem 2 músicas aguardando na fila.',
}

const STATUS_TEXT = {
  waiting: (rank) => `posição ${rank} na fila`,
  playing: () => 'é a sua vez agora!',
  done: () => 'música concluída',
}

const telefoneSalvo = () => localStorage.getItem('juliu_telefone') || ''

export default function MyQueue() {
  const { settings } = useSettings()
  const { entries, loading } = useQueue()

  const [telefone, setTelefone] = useState(telefoneSalvo())
  // já visitou antes nesse navegador -> pula direto pro resultado, sem pedir telefone de novo
  const [passo, setPasso] = useState(telefoneSalvo() ? 'resultado' : 'telefone')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nome, setNome] = useState('')
  const [musicas, setMusicas] = useState([''])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const ranked = activeRanked(entries)
  const minhas = ranked.filter((e) => e.telefone === telefone.trim())
  const aberto = settings?.status_aberto
  const maxAdicionar = Math.max(0, 2 - minhas.length)

  function continuar(e) {
    e.preventDefault()
    localStorage.setItem('juliu_telefone', telefone.trim())
    setMostrarForm(false)
    setPasso('resultado')
  }

  function abrirForm() {
    setMusicas(Array(Math.min(maxAdicionar, 1)).fill(''))
    setErro('')
    setMostrarForm(true)
  }

  function atualizarMusica(i, valor) {
    const novas = [...musicas]
    novas[i] = valor.replace(/\D/g, '').slice(0, 5)
    setMusicas(novas)
  }

  function adicionarInputMusica() {
    if (musicas.length < maxAdicionar) setMusicas([...musicas, ''])
  }

  function removerInputMusica(i) {
    setMusicas(musicas.filter((_, idx) => idx !== i))
  }

  async function entrarNaFila(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)

    for (const numero of musicas.map((m) => m.trim()).filter(Boolean)) {
      const { error } = await supabase.rpc('join_queue', {
        p_nome: nome.trim(),
        p_telefone: telefone.trim(),
        p_numero_musica: numero,
      })

      if (error) {
        setEnviando(false)
        setErro(ERROS[error.message] || 'Não foi possível entrar na fila. Tente novamente.')
        return
      }
    }

    setEnviando(false)
    setMostrarForm(false)
    setNome('')
    setMusicas([''])
  }

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Minha fila</h1>
        <p style={{ color: 'var(--pessego-escuro)', margin: '0.3rem 0 0' }}>
          Digite seu telefone pra ver sua posição ou entrar na fila.
        </p>
      </div>

      {passo === 'telefone' && (
        <form onSubmit={continuar} className="card" style={{ display: 'grid', gap: '0.9rem' }}>
          <label>
            Telefone
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="11999998888"
              minLength={10}
              maxLength={11}
              required
              autoFocus
            />
          </label>
          <button className="btn-primary" type="submit">Continuar</button>
        </form>
      )}

      {passo === 'resultado' && (
        <>
          <button
            className="btn-secondary"
            style={{ marginBottom: '1rem' }}
            onClick={() => { setPasso('telefone'); setMostrarForm(false); setErro('') }}
          >
            ← Trocar telefone
          </button>

          {loading && <p>Carregando...</p>}

          {!loading && minhas.map((e) => (
            <Link
              key={e.id}
              to={`/fila/${e.id}`}
              className="card"
              style={{ display: 'block', marginBottom: '0.75rem' }}
            >
              <strong>Nº {e.numero_musica}</strong> — {e.nome} — {STATUS_TEXT[e.status](e.rank)}
            </Link>
          ))}

          {!loading && minhas.length === 0 && !mostrarForm && (
            <div className="card" style={{ textAlign: 'center' }}>
              {aberto ? (
                <>
                  <p>Nenhuma música aguardando pra esse telefone ainda.</p>
                  <button className="btn-primary" onClick={abrirForm}>
                    Entrar na fila
                  </button>
                </>
              ) : (
                <p>A casa está fechada no momento — não é possível entrar na fila agora.</p>
              )}
            </div>
          )}

          {!loading && maxAdicionar > 0 && minhas.length > 0 && aberto && !mostrarForm && (
            <button className="btn-secondary" style={{ width: '100%' }} onClick={abrirForm}>
              + Adicionar outra música
            </button>
          )}

          {mostrarForm && (
            <form onSubmit={entrarNaFila} className="card" style={{ display: 'grid', gap: '0.9rem' }}>
              <label>
                Nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} autoFocus />
              </label>

              {musicas.map((valor, i) => (
                <label key={i}>
                  {i === 0 ? 'Número da música' : `Número da música ${i + 1}`}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      value={valor}
                      onChange={(e) => atualizarMusica(i, e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="ex: 1234"
                      required
                      minLength={1}
                      maxLength={5}
                    />
                    {i > 0 && (
                      <button type="button" className="btn-secondary" onClick={() => removerInputMusica(i)}>
                        ×
                      </button>
                    )}
                  </div>
                </label>
              ))}

              {musicas.length < maxAdicionar && (
                <button type="button" className="btn-secondary" onClick={adicionarInputMusica}>
                  + Mandar outra música junto
                </button>
              )}

              {erro && <p style={{ color: 'var(--pessego)', margin: 0 }}>{erro}</p>}
              <button className="btn-primary" type="submit" disabled={enviando}>
                <IconMic width={16} height={16} style={{ verticalAlign: '-3px', marginRight: '0.4rem' }} />
                {enviando ? 'Entrando...' : 'Entrar na fila'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
