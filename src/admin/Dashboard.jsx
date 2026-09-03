import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ExternalLink,
  LogOut,
  DoorOpen,
  DoorClosed,
  Clock,
  Save,
  ListMusic,
  Play,
  Check,
  ChevronUp,
  ChevronDown,
  Trash2,
  BarChart3,
  CalendarClock,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { contarMusicas } from '../lib/stats'
import { abertoAgora } from '../lib/schedule'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useQueue, activeRanked } from '../hooks/useQueue'
import '../pages/queue.css'
import './admin.css'

const DIAS = [
  ['seg', 'segunda'], ['ter', 'terça'], ['qua', 'quarta'], ['qui', 'quinta'],
  ['sex', 'sexta'], ['sab', 'sábado'], ['dom', 'domingo'],
]

export default function Dashboard() {
  const { signOut } = useAuth()
  const { settings, loading: loadingSettings } = useSettings()
  const { entries, loading: loadingQueue } = useQueue()

  return (
    <div className="q-page">
      <div className="adm-shell">
        <div className="adm-topbar">
          <span className="q-brand">
            <img className="q-brand__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
            Painel
          </span>
          <div className="adm-actions">
            <Link to="/" className="q-back"><ExternalLink size={14} /> Ver site</Link>
            <button type="button" className="q-back" onClick={signOut}><LogOut size={14} /> Sair</button>
          </div>
        </div>

        <div className="adm-grid">
          <div className="adm-col">
            {!loadingQueue && <StatsPanel entries={entries} />}
            {!loadingSettings && settings && <SettingsPanel settings={settings} />}
          </div>
          <div className="adm-col adm-col--queue">
            {!loadingQueue && <QueuePanel entries={entries} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatsPanel({ entries }) {
  const s = contarMusicas(entries)
  const tiles = [
    ['Hoje', s.dia],
    ['Semana', s.semana],
    ['Mês', s.mes],
    ['Ano', s.ano],
  ]
  return (
    <motion.div
      className="q-card adm-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="adm-h2"><BarChart3 size={15} /> Músicas pedidas</p>
      <div className="adm-stats">
        {tiles.map(([label, n]) => (
          <div key={label} className="adm-stat">
            <b>{n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

const MODOS = [
  ['auto', 'Automático', CalendarClock],
  ['aberto', 'Forçar aberto', DoorOpen],
  ['fechado', 'Forçar fechado', DoorClosed],
]

function SettingsPanel({ settings }) {
  const [horario, setHorario] = useState(settings.horario_funcionamento || {})
  const [salvando, setSalvando] = useState(false)
  const modo = settings.abertura_modo || 'auto'
  const aberto = abertoAgora(settings)

  async function setModo(novo) {
    if (novo === modo) return
    if (LOCAL) return localDb.updateSettings({ abertura_modo: novo })
    await supabase.from('settings').update({ abertura_modo: novo }).eq('id', 1)
  }

  async function salvarHorario(e) {
    e.preventDefault()
    setSalvando(true)
    if (LOCAL) localDb.updateSettings({ horario_funcionamento: horario })
    else await supabase.from('settings').update({ horario_funcionamento: horario }).eq('id', 1)
    setSalvando(false)
  }

  return (
    <>
      <motion.div
        className="q-card adm-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="adm-status">
          <span className={`adm-status__badge ${aberto ? 'adm-status__badge--on' : 'adm-status__badge--off'}`}>
            <span className="adm-status__dot" />
            {aberto ? 'Casa aberta agora' : 'Casa fechada agora'}
          </span>
        </div>
        <div className="adm-modos">
          {MODOS.map(([val, label, Icon]) => (
            <button
              key={val}
              type="button"
              className={`adm-modo ${modo === val ? 'adm-modo--on' : ''}`}
              onClick={() => setModo(val)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="adm-modo__hint">
          {modo === 'auto'
            ? 'Abre e fecha sozinho pelo horário de funcionamento abaixo.'
            : modo === 'aberto'
              ? 'Casa forçada aberta — ignora o horário até você voltar pra Automático.'
              : 'Casa forçada fechada — ignora o horário até você voltar pra Automático.'}
        </p>
      </motion.div>

      <motion.form
        className="q-card adm-card"
        onSubmit={salvarHorario}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="adm-h2"><Clock size={15} /> Horário de funcionamento</p>
        <div className="adm-hlist">
          {DIAS.map(([key, label]) => (
            <label key={key} className="adm-hrow">
              <span>{label}</span>
              <input
                value={horario[key] || ''}
                placeholder="19:00-23:00  ou  fechado"
                onChange={(e) => setHorario({ ...horario, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button className="q-btn q-btn--ghost q-btn--sm" type="submit" disabled={salvando}>
          <Save size={15} /> {salvando ? 'Salvando…' : 'Salvar horário'}
        </button>
      </motion.form>
    </>
  )
}

function QueuePanel({ entries }) {
  const ranked = activeRanked(entries)
  const done = entries.filter((e) => e.status === 'done')

  async function setStatus(id, status) {
    if (LOCAL) return localDb.setEntryStatus(id, status)
    await supabase.from('queue_entries').update({ status }).eq('id', id)
  }

  async function remover(id) {
    if (LOCAL) return localDb.deleteEntry(id)
    await supabase.from('queue_entries').delete().eq('id', id)
  }

  async function mover(index, direction) {
    const alvo = ranked[index]
    const vizinho = ranked[index + direction]
    if (!alvo || !vizinho) return
    if (LOCAL) return localDb.swapPositions(alvo.id, vizinho.id)
    await supabase.from('queue_entries').update({ posicao: vizinho.posicao }).eq('id', alvo.id)
    await supabase.from('queue_entries').update({ posicao: alvo.posicao }).eq('id', vizinho.id)
  }

  return (
    <motion.div
      className="q-card adm-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <p className="adm-h2"><ListMusic size={15} /> Fila · {ranked.length} na vez</p>

      {ranked.length === 0 && <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>Fila vazia.</p>}

      <div className="adm-queue">
        {ranked.map((e, i) => (
          <div key={e.id} className={`adm-item ${e.status === 'playing' ? 'adm-item--playing' : ''}`}>
            <span className="adm-item__rank">{e.rank}</span>
            <div className="adm-item__body">
              <div className="adm-item__title">Nº {e.numero_musica} · {e.nome}</div>
              <div className="adm-item__meta">
                <span className={`adm-chip adm-chip--${e.status}`}>
                  {e.status === 'playing' ? 'no palco' : 'aguardando'}
                </span>
              </div>
            </div>
            <div className="adm-item__acts">
              <button className="q-iconbtn" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                <ChevronUp size={15} />
              </button>
              <button className="q-iconbtn" onClick={() => mover(i, 1)} disabled={i === ranked.length - 1} aria-label="Descer">
                <ChevronDown size={15} />
              </button>
              {e.status === 'waiting' && (
                <button className="q-btn q-btn--primary q-btn--sm" onClick={() => setStatus(e.id, 'playing')}>
                  <Play size={14} /> Chamar
                </button>
              )}
              {e.status === 'playing' && (
                <button className="q-btn q-btn--primary q-btn--sm" onClick={() => setStatus(e.id, 'done')}>
                  <Check size={14} /> Concluir
                </button>
              )}
              <button className="q-iconbtn" onClick={() => remover(e.id)} aria-label="Remover">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <details className="adm-done">
          <summary>Concluídas ({done.length})</summary>
          {done.map((e) => (
            <div key={e.id} className="adm-done__item">Nº {e.numero_musica} — {e.nome}</div>
          ))}
        </details>
      )}
    </motion.div>
  )
}
