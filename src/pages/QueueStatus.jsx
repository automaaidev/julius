import { useParams, Link } from 'react-router-dom'
import { useQueue, activeRanked } from '../hooks/useQueue'

export default function QueueStatus() {
  const { id } = useParams()
  const { entries, loading } = useQueue()

  if (loading) {
    return <div className="container"><p>Carregando...</p></div>
  }

  const minha = entries.find((e) => e.id === id)

  if (!minha) {
    return (
      <div className="container">
        <p>Entrada não encontrada. <Link to="/">Voltar</Link></p>
      </div>
    )
  }

  const ranked = activeRanked(entries)
  const meuRank = ranked.find((e) => e.id === id)?.rank

  return (
    <div className="container" style={{ textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.6rem' }}>Nº {minha.numero_musica}</h1>
      <p style={{ color: 'var(--pessego-escuro)' }}>{minha.nome}</p>

      <div className="card" style={{ margin: '1.5rem 0' }}>
        {minha.status === 'done' ? (
          <p style={{ fontSize: '1.4rem' }}>Música concluída. Obrigado! 🎤</p>
        ) : minha.status === 'playing' ? (
          <p style={{ fontSize: '1.6rem', color: 'var(--pessego)' }}>É a sua vez agora!</p>
        ) : (
          <>
            <p>Sua posição na fila</p>
            <p className="display" style={{ fontSize: '3.5rem' }}>{meuRank ?? '-'}</p>
            <p style={{ color: 'var(--pessego-escuro)' }}>Atualiza automaticamente</p>
          </>
        )}
      </div>

      <Link to="/">Voltar para o início</Link>
    </div>
  )
}
