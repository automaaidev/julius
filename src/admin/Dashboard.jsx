import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useQueue, activeRanked } from '../hooks/useQueue'

const DIAS = [
  ['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'],
  ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo'],
]

const STATUS_LABEL = { waiting: 'Aguardando', playing: 'Tocando', done: 'Concluído' }

export default function Dashboard() {
  const { signOut } = useAuth()
  const { settings, loading: loadingSettings } = useSettings()
  const { entries, loading: loadingQueue } = useQueue()

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Painel — Juliu's</h1>
        <button className="btn-secondary" onClick={signOut}>Sair</button>
      </div>

      {!loadingSettings && <SettingsPanel settings={settings} />}
      {!loadingQueue && <QueuePanel entries={entries} />}
    </div>
  )
}

function SettingsPanel({ settings }) {
  const [horario, setHorario] = useState(settings.horario_funcionamento || {})
  const [salvando, setSalvando] = useState(false)

  async function toggleAberto() {
    await supabase.from('settings').update({ status_aberto: !settings.status_aberto }).eq('id', 1)
  }

  async function salvarHorario(e) {
    e.preventDefault()
    setSalvando(true)
    await supabase.from('settings').update({ horario_funcionamento: horario }).eq('id', 1)
    setSalvando(false)
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className={`badge ${settings.status_aberto ? 'badge-aberto' : 'badge-fechado'}`}>
          {settings.status_aberto ? 'ABERTO' : 'FECHADO'}
        </span>
        <button className="btn-primary" onClick={toggleAberto}>
          {settings.status_aberto ? 'Fechar casa' : 'Abrir casa'}
        </button>
      </div>

      <form onSubmit={salvarHorario} style={{ display: 'grid', gap: '0.5rem' }}>
        <p style={{ margin: 0, color: 'var(--pessego-escuro)' }}>Horário de funcionamento</p>
        {DIAS.map(([key, label]) => (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.5rem', alignItems: 'center' }}>
            <span>{label}</span>
            <input
              value={horario[key] || ''}
              placeholder="ex: 19:00-23:00 ou fechado"
              onChange={(e) => setHorario({ ...horario, [key]: e.target.value })}
            />
          </div>
        ))}
        <button className="btn-secondary" type="submit" disabled={salvando} style={{ justifySelf: 'start', marginTop: '0.5rem' }}>
          {salvando ? 'Salvando...' : 'Salvar horário'}
        </button>
      </form>
    </div>
  )
}

function QueuePanel({ entries }) {
  const ranked = activeRanked(entries)
  const done = entries.filter((e) => e.status === 'done')

  async function chamar(id) {
    await supabase.from('queue_entries').update({ status: 'playing' }).eq('id', id)
  }

  async function concluir(id) {
    await supabase.from('queue_entries').update({ status: 'done' }).eq('id', id)
  }

  async function remover(id) {
    await supabase.from('queue_entries').delete().eq('id', id)
  }

  async function mover(index, direction) {
    const alvo = ranked[index]
    const vizinho = ranked[index + direction]
    if (!alvo || !vizinho) return
    await supabase.from('queue_entries').update({ posicao: vizinho.posicao }).eq('id', alvo.id)
    await supabase.from('queue_entries').update({ posicao: alvo.posicao }).eq('id', vizinho.id)
  }

  return (
    <div className="card">
      <p style={{ margin: '0 0 1rem', color: 'var(--pessego-escuro)' }}>Fila ({ranked.length} aguardando/tocando)</p>

      {ranked.length === 0 && <p>Fila vazia.</p>}

      {ranked.map((e, i) => (
        <div
          key={e.id}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.6rem 0', borderBottom: '1px solid var(--vinho-escuro)',
          }}
        >
          <strong style={{ width: 28 }}>{e.rank}</strong>
          <div style={{ flex: 1 }}>
            <div><strong>Nº {e.numero_musica}</strong> — {e.nome}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--pessego-escuro)' }}>
              {e.telefone} · {STATUS_LABEL[e.status]}
            </div>
          </div>
          <button className="btn-secondary" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
          <button className="btn-secondary" onClick={() => mover(i, 1)} disabled={i === ranked.length - 1}>↓</button>
          {e.status === 'waiting' && <button className="btn-secondary" onClick={() => chamar(e.id)}>Chamar</button>}
          {e.status === 'playing' && <button className="btn-primary" onClick={() => concluir(e.id)}>Concluir</button>}
          <button className="btn-secondary" onClick={() => remover(e.id)}>Remover</button>
        </div>
      ))}

      {done.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ color: 'var(--pessego-escuro)', cursor: 'pointer' }}>Concluídas ({done.length})</summary>
          {done.map((e) => (
            <div key={e.id} style={{ padding: '0.4rem 0', opacity: 0.7 }}>
              Nº {e.numero_musica} — {e.nome}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
