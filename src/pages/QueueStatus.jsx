import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic2, ArrowLeft, Radio, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useQueue, activeRanked } from '../hooks/useQueue'
import './queue.css'

export default function QueueStatus() {
  const { id } = useParams()
  const { entries, loading } = useQueue()

  const minha = loading ? null : entries.find((e) => e.id === id)
  const meuRank = minha ? activeRanked(entries).find((e) => e.id === id)?.rank : null

  return (
    <div className="q-page">
      <div className="q-shell">
        <div className="q-top">
          <Link to="/" className="q-brand">
            <span className="q-brand__mark"><Mic2 size={17} strokeWidth={2.4} /></span>
            JULIU&apos;S
          </Link>
          <Link to="/minha-fila" className="q-back">
            <ArrowLeft size={15} /> Minha fila
          </Link>
        </div>

        {loading && <p className="q-note">Carregando…</p>}

        {!loading && !minha && (
          <div className="q-card">
            <p className="q-note">Entrada não encontrada.</p>
            <Link to="/minha-fila" className="q-btn q-btn--primary">Ver minha fila</Link>
          </div>
        )}

        {!loading && minha && (
          <>
            <div className="q-head">
              <h1>Nº {minha.numero_musica}</h1>
              <p>{minha.nome}</p>
            </div>

            <motion.div
              className={`q-card ${minha.status === 'playing' ? 'q-card--now' : ''}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {minha.status === 'done' ? (
                <div className="q-now">
                  <CheckCircle2 size={30} style={{ color: 'var(--luz)', flexShrink: 0 }} />
                  <span className="q-now__txt">
                    <strong>Música concluída</strong>
                    <span>Valeu por cantar com a gente.</span>
                  </span>
                </div>
              ) : minha.status === 'playing' ? (
                <div className="q-now">
                  <Radio size={30} className="q-now__icon" />
                  <span className="q-now__txt">
                    <strong>É a sua vez!</strong>
                    <span>Sobe no palco e pega o microfone.</span>
                  </span>
                </div>
              ) : (
                <div className="q-big">
                  <div className="q-big__label">Sua posição na fila</div>
                  <div className="q-big__num">{meuRank ?? '—'}</div>
                  <span className="q-big__sub">
                    <RefreshCw size={12} /> Atualiza automaticamente
                  </span>
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}
