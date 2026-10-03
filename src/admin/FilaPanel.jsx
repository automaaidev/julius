import { useState } from 'react'
import { Play, Check, ChevronUp, ChevronDown, Trash2, MessageSquare, AlertCircle, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { activeRanked } from '../hooks/useQueue'
import { mapErroAdmin } from './erros'

// fila do painel admin: chamar/concluir, reordenar, apagar e abrir o chat
// do cliente daquela entrada. "Chamar" fica travado enquanto já tem
// alguém no palco — o banco garante isso de verdade (índice único em
// status = 'playing'), aqui é só UX pra não deixar nem tentar.
export default function FilaPanel({ entries, onAbrirChat, onChanged }) {
  const ranked = activeRanked(entries)
  const done = entries.filter((e) => e.status === 'done')
  const temNoPalco = ranked.some((e) => e.status === 'playing')
  const [erro, setErro] = useState('')

  async function setStatus(id, status) {
    setErro('')
    try {
      if (LOCAL) {
        localDb.setEntryStatus(id, status)
      } else {
        const { error } = await supabase.from('queue_entries').update({ status }).eq('id', id)
        if (error) throw error
      }
      onChanged?.()
    } catch (e) {
      if (e.code === '23505' || e.message === 'JA_TEM_UM_NO_PALCO') {
        setErro('Já tem alguém no palco. Conclua antes de chamar outra.')
      } else {
        setErro('Não deu pra atualizar. Tenta de novo.')
      }
    }
  }

  async function remover(id) {
    if (LOCAL) localDb.deleteEntry(id)
    else await supabase.from('queue_entries').delete().eq('id', id)
    onChanged?.()
  }

  async function mover(index, direction) {
    const alvo = ranked[index]
    const vizinho = ranked[index + direction]
    if (!alvo || !vizinho) return
    if (LOCAL) {
      localDb.swapPositions(alvo.id, vizinho.id)
    } else {
      await supabase.from('queue_entries').update({ posicao: vizinho.posicao }).eq('id', alvo.id)
      await supabase.from('queue_entries').update({ posicao: alvo.posicao }).eq('id', vizinho.id)
    }
    onChanged?.()
  }

  return (
    <>
      {erro && (
        <p className="q-error">
          <AlertCircle size={16} /> {erro}
        </p>
      )}

      <IncluirSemCelular onChanged={onChanged} />

      {ranked.length === 0 && (
        <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>Fila vazia.</p>
      )}

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
                <button
                  className="q-btn q-btn--primary q-btn--sm"
                  onClick={() => setStatus(e.id, 'playing')}
                  disabled={temNoPalco}
                  title={temNoPalco ? 'Conclua quem está no palco antes de chamar outra' : undefined}
                >
                  <Play size={14} /> Chamar
                </button>
              )}
              {e.status === 'playing' && (
                <button className="q-btn q-btn--primary q-btn--sm" onClick={() => setStatus(e.id, 'done')}>
                  <Check size={14} /> Concluir
                </button>
              )}
              <button className="q-iconbtn" onClick={() => onAbrirChat(e.perfil_id)} aria-label="Abrir chat">
                <MessageSquare size={15} />
              </button>
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
    </>
  )
}

// quem não tem celular: o operador inclui o nome + número na fila (vai pro
// fim, igual a quem pede pelo chat). Pra ajustar a ordem depois, é só subir
// ou descer na lista.
function IncluirSemCelular({ onChanged }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [numero, setNumero] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function incluir(e) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      if (LOCAL) {
        localDb.adminAdicionar({ nome, numero })
      } else {
        const { error } = await supabase.rpc('admin_adicionar_fila', { p_nome: nome, p_numero: numero })
        if (error) throw error
      }
      setNome('')
      setNumero('')
      onChanged?.()
    } catch (err) {
      setErro(mapErroAdmin(err.message))
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="q-btn q-btn--ghost q-btn--sm adm-incluir__open" onClick={() => setAberto(true)}>
        <UserPlus size={15} /> Incluir quem não tem celular
      </button>
    )
  }

  return (
    <form className="adm-incluir" onSubmit={incluir}>
      <div className="adm-incluir__row">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value.slice(0, 24))}
          placeholder="Nome"
          aria-label="Nome de quem vai cantar"
          maxLength={24}
          autoFocus
          required
        />
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="Nº"
          aria-label="Número da música"
          maxLength={5}
          required
        />
      </div>
      {erro && (
        <p className="q-error">
          <AlertCircle size={16} /> {erro}
        </p>
      )}
      <div className="adm-incluir__row">
        <button type="submit" className="q-btn q-btn--primary q-btn--sm" disabled={salvando}>
          <UserPlus size={15} /> {salvando ? 'Incluindo…' : 'Incluir na fila'}
        </button>
        <button
          type="button"
          className="q-btn q-btn--ghost q-btn--sm"
          onClick={() => {
            setAberto(false)
            setErro('')
          }}
        >
          Fechar
        </button>
      </div>
    </form>
  )
}
