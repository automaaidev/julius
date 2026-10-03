import { useState } from 'react'
import { Plus, Save, Trash2, AlertCircle, Flame } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { useSugestoes } from '../hooks/useSugestoes'
import { mapErroAdmin } from './erros'

// Sugestões da tela do cliente: as mais cantadas (contagem automática da fila)
// + títulos cadastrados aqui. O número sozinho não diz nada pra quem é de
// primeira viagem — dar o nome pra música é o que faz a lista servir.
export default function MusicasPanel() {
  const { sugestoes, loading, refetch } = useSugestoes(100)
  const [numero, setNumero] = useState('')
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(n, t) {
    setErro('')
    try {
      if (LOCAL) {
        localDb.salvarMusica(n, t)
      } else {
        const { error } = await supabase.from('musicas').upsert({ numero: n, titulo: t }, { onConflict: 'numero' })
        if (error) throw error
      }
      refetch()
      return true
    } catch (e) {
      setErro(mapErroAdmin(e.message))
      return false
    }
  }

  async function removerTitulo(n) {
    setErro('')
    try {
      if (LOCAL) {
        localDb.removerMusica(n)
      } else {
        const { error } = await supabase.from('musicas').delete().eq('numero', n)
        if (error) throw error
      }
      refetch()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    }
  }

  async function adicionar(e) {
    e.preventDefault()
    setSalvando(true)
    const ok = await salvar(numero.trim(), titulo.trim())
    setSalvando(false)
    if (ok) {
      setNumero('')
      setTitulo('')
    }
  }

  return (
    <div className="q-card">
      <h3 className="adm-h2"><Flame size={15} /> Sugestões de músicas</h3>
      <p className="adm-modo__desc">
        As mais cantadas aparecem pra quem entra no site e não sabe o que pedir. Dê o nome às músicas pra
        lista fazer sentido — o número sozinho não diz nada pra quem é de primeira viagem.
      </p>

      <form className="adm-mus-add" onSubmit={adicionar}>
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="Nº"
          aria-label="Número da música"
          required
        />
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value.slice(0, 80))}
          placeholder="Nome da música"
          aria-label="Nome da música"
          required
        />
        <button className="q-btn q-btn--primary q-btn--sm" type="submit" disabled={salvando}>
          <Plus size={15} /> Adicionar
        </button>
      </form>

      {erro && (
        <p className="q-error" style={{ marginTop: '0.7rem' }}>
          <AlertCircle size={16} /> {erro}
        </p>
      )}

      {loading ? (
        <p className="q-note">Carregando…</p>
      ) : sugestoes.length === 0 ? (
        <p className="q-note q-note--soft" style={{ textAlign: 'left', marginTop: '1rem' }}>
          Nada por aqui ainda. Conforme as músicas forem cantadas elas aparecem na lista; ou adicione as que
          você quer sugerir.
        </p>
      ) : (
        <ul className="adm-mus-list">
          {sugestoes.map((s) => (
            <Linha key={`${s.numero}:${s.titulo ?? ''}`} musica={s} onSalvar={salvar} onRemover={removerTitulo} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Linha({ musica, onSalvar, onRemover }) {
  const [titulo, setTitulo] = useState(musica.titulo ?? '')
  const mudou = titulo.trim() !== (musica.titulo ?? '')

  async function salvarTitulo(e) {
    e.preventDefault()
    const t = titulo.trim()
    if (!t || !mudou) return
    await onSalvar(musica.numero, t)
  }

  return (
    <li className="adm-mus-item">
      <b className="adm-mus-item__num">Nº {musica.numero}</b>
      <form className="adm-mus-item__form" onSubmit={salvarTitulo}>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value.slice(0, 80))}
          placeholder="Dar um nome…"
          aria-label={`Nome da música ${musica.numero}`}
        />
        {mudou && titulo.trim() && (
          <button type="submit" className="q-iconbtn" aria-label="Salvar nome">
            <Save size={14} />
          </button>
        )}
      </form>
      <span className="adm-mus-item__vezes">{musica.vezes > 0 ? `${musica.vezes}× cantada` : 'nunca cantada'}</span>
      {musica.titulo && (
        <button type="button" className="q-iconbtn" onClick={() => onRemover(musica.numero)} aria-label="Remover nome">
          <Trash2 size={14} />
        </button>
      )}
    </li>
  )
}
