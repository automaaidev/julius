import { useState } from 'react'
import { Play, Check, ChevronUp, ChevronDown, Trash2, MessageSquare, AlertCircle, UserPlus, Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { activeRanked } from '../hooks/useQueue'
import { useTitulos } from '../hooks/useTitulos'
import { useConferirNumero } from '../hooks/useConferirNumero'
import { rotuloMusica } from '../lib/catalogo'
import BuscaMusicas from '../components/BuscaMusicas'
import SinalChip from '../components/SinalChip'
import { SINAIS, definirSinal, mensagemDoOperador } from '../lib/avisosCasa'
import { mapErroAdmin } from './erros'

// fila do painel admin: chamar/concluir, reordenar, apagar e abrir o chat
// do cliente daquela entrada. "Chamar" fica travado enquanto já tem
// alguém no palco — o banco garante isso de verdade (índice único em
// status = 'playing'), aqui é só UX pra não deixar nem tentar.
export default function FilaPanel({ entries, onAbrirChat, onChanged }) {
  const ranked = activeRanked(entries)
  const done = entries.filter((e) => e.status === 'done')
  const temNoPalco = ranked.some((e) => e.status === 'playing')
  const titulos = useTitulos(ranked.map((e) => e.numero_musica))
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

  // sinal no pedido: 👀 visto · 🎶 no aparelho · ❓ confirmar o número. Tocar de novo tira.
  async function marcar(e, sinal) {
    setErro('')
    const novo = e.sinal === sinal ? null : sinal
    try {
      await definirSinal(e.id, novo)
      if (novo === 'ajuda') {
        await mensagemDoOperador(
          e.perfil_id,
          `❓ Sobre a Nº ${e.numero_musica}: a equipe precisa confirmar o número com você. Confere se está certo ou procura pelo nome no “Cardápio de músicas”.`
        )
      }
      onChanged?.()
    } catch (err) {
      setErro(mapErroAdmin(err.message))
    }
  }

  const semSinal = ranked.filter((e) => e.status === 'waiting' && !e.sinal)

  async function marcarTodosVistos() {
    setErro('')
    try {
      await definirSinal(semSinal.map((e) => e.id), 'visto')
      onChanged?.()
    } catch (err) {
      setErro(mapErroAdmin(err.message))
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

      {semSinal.length > 0 && (
        <button type="button" className="q-btn q-btn--ghost q-btn--sm adm-vistos" onClick={marcarTodosVistos}>
          <span aria-hidden="true">👀</span> Marcar {semSinal.length === 1 ? 'o pedido' : `os ${semSinal.length} pedidos`} como visto{semSinal.length === 1 ? '' : 's'}
        </button>
      )}

      {ranked.length === 0 && (
        <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>Fila vazia.</p>
      )}

      <div className="adm-queue">
        {ranked.map((e, i) => (
          <div key={e.id} className={`adm-item ${e.status === 'playing' ? 'adm-item--playing' : ''}`}>
            <span className="adm-item__rank">{e.rank}</span>
            <div className="adm-item__body">
              <div className="adm-item__title">Nº {e.numero_musica} · {e.nome}</div>
              {titulos.get(e.numero_musica)?.titulo && (
                <div className="adm-item__song">{rotuloMusica(titulos.get(e.numero_musica))}</div>
              )}
              <div className="adm-item__meta">
                <span className={`adm-chip adm-chip--${e.status}`}>
                  {e.status === 'playing' ? 'no palco' : 'aguardando'}
                </span>
                <SinalChip sinal={e.sinal} curto />
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
              {e.status === 'waiting' && (
                <span className="adm-sinais" role="group" aria-label={`Sinal da Nº ${e.numero_musica}`}>
                  {Object.entries(SINAIS).map(([chave, s]) => (
                    <button
                      key={chave}
                      type="button"
                      className={`adm-sinal ${e.sinal === chave ? 'is-on' : ''}`}
                      onClick={() => marcar(e, chave)}
                      aria-pressed={e.sinal === chave}
                      aria-label={`${s.rotulo} (Nº ${e.numero_musica})`}
                      title={s.rotulo}
                    >
                      {s.emoji}
                    </button>
                  ))}
                </span>
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
  const [buscando, setBuscando] = useState(false)
  const conferido = useConferirNumero(numero)

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
        <button
          type="button"
          className="q-iconbtn q-iconbtn--lg"
          onClick={() => setBuscando(true)}
          aria-label="Abrir o cardápio de músicas"
          title="Cardápio de músicas"
        >
          <Search size={17} />
        </button>
      </div>
      {conferido.estado === 'existe' && <p className="adm-incluir__musica">{rotuloMusica(conferido.musica)}</p>}
      {conferido.estado === 'nao' && (
        <p className="adm-incluir__musica is-aviso">
          Nº {numero} não está no cardápio — confira o número (dá pra incluir mesmo assim).
        </p>
      )}
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

      {buscando && (
        <BuscaMusicas
          admin
          onFechar={() => setBuscando(false)}
          principal={{
            rotulo: 'Usar',
            onClick: (m) => {
              setNumero(m.numero)
              return { fechar: true }
            },
          }}
        />
      )}
    </form>
  )
}
