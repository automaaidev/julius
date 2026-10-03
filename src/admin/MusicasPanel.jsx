import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, AlertCircle, Flame, Star, StarOff, Library, Download, Search, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import { catalogoMudou, contarCatalogo, definirDestaque, importarCatalogo } from '../lib/catalogo'
import { useSugestoes } from '../hooks/useSugestoes'
import BuscaMusicas from '../components/BuscaMusicas'
import { mapErroAdmin } from './erros'

const fmt = (n) => n.toLocaleString('pt-BR')

// Aba Músicas: o catálogo do aparelho (busca de número por nome) e as sugestões
// da tela do cliente. As sugestões são as mais cantadas (contagem automática da
// fila) + as que ficam fixadas aqui (estrela). O número sozinho não diz nada pra
// quem é de primeira viagem — por isso o nome.
export default function MusicasPanel() {
  const { sugestoes, loading, refetch } = useSugestoes(100)
  const [numero, setNumero] = useState('')
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [buscando, setBuscando] = useState(false)

  // destaque: true = fixa nas sugestões (formulário de baixo); sem isso só muda o nome
  async function salvar(n, t, { destaque = false } = {}) {
    setErro('')
    try {
      if (LOCAL) {
        localDb.salvarMusica(n, t)
        if (destaque) localDb.definirDestaque(n, true)
      } else {
        const linha = destaque ? { numero: n, titulo: t, destaque: true } : { numero: n, titulo: t }
        const { error } = await supabase.from('musicas').upsert(linha, { onConflict: 'numero' })
        if (error) throw error
      }
      catalogoMudou() // o nome mudou: o cardápio e a fila não podem mostrar o antigo
      refetch()
      return true
    } catch (e) {
      setErro(mapErroAdmin(e.message))
      return false
    }
  }

  async function fixar(n, valor) {
    setErro('')
    try {
      await definirDestaque(n, valor)
      refetch()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    }
  }

  async function adicionar(e) {
    e.preventDefault()
    setSalvando(true)
    const ok = await salvar(numero.trim(), titulo.trim(), { destaque: true })
    setSalvando(false)
    if (ok) {
      setNumero('')
      setTitulo('')
    }
  }

  return (
    <>
      <Catalogo onBuscar={() => setBuscando(true)} />

      <div className="q-card">
        <h3 className="adm-h2"><Flame size={15} /> Sugestões de músicas</h3>
        <p className="adm-modo__desc">
          As mais cantadas aparecem pra quem entra no site e não sabe o que pedir. Fixe com a estrela as que você
          quer sempre sugerir, ou adicione abaixo uma música que não esteja no catálogo.
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
            onChange={(e) => setTitulo(e.target.value.slice(0, 120))}
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
            Nada por aqui ainda. Conforme as músicas forem cantadas elas aparecem na lista; ou busque no catálogo e
            fixe as que você quer sugerir.
          </p>
        ) : (
          <ul className="adm-mus-list">
            {sugestoes.map((s) => (
              <Linha key={`${s.numero}:${s.titulo ?? ''}`} musica={s} onSalvar={salvar} onFixar={fixar} />
            ))}
          </ul>
        )}
      </div>

      {buscando && (
        <BuscaMusicas
          admin
          onFechar={() => setBuscando(false)}
          principal={{
            rotulo: 'Fixar',
            onClick: async (m) => {
              try {
                await definirDestaque(m.numero, true)
                refetch()
                return { feito: 'Fixada' }
              } catch (e) {
                setErro(mapErroAdmin(e.message))
                return { feito: 'Erro' }
              }
            },
          }}
        />
      )}
    </>
  )
}

// Catálogo do aparelho: quantas músicas estão carregadas + importar/atualizar.
function Catalogo({ onBuscar }) {
  const [total, setTotal] = useState(null) // null = ainda não sabe
  const [progresso, setProgresso] = useState(null) // { feito, total } enquanto importa
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const contar = useCallback(async () => {
    try {
      setTotal(await contarCatalogo())
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    }
  }, [])

  useEffect(() => {
    contar()
  }, [contar])

  async function importar() {
    setErro('')
    setOk('')
    setProgresso({ feito: 0, total: 0 })
    try {
      const n = await importarCatalogo((feito, tot) => setProgresso({ feito, total: tot }))
      setOk(`${fmt(n)} músicas carregadas.`)
      await contar()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    } finally {
      setProgresso(null)
    }
  }

  const importando = progresso !== null
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0

  return (
    <div className="q-card">
      <h3 className="adm-h2"><Library size={15} /> Catálogo do aparelho</h3>
      <p className="adm-modo__desc">
        Número, nome e cantor das músicas do aparelho. Com o catálogo carregado o cliente e você buscam o número
        pelo nome, e a fila mostra o nome da música.
      </p>

      <p className="adm-cat__total">
        {total === null ? 'Carregando…' : total === 0 ? 'Catálogo vazio.' : `${fmt(total)} músicas no catálogo.`}
      </p>

      <div className="adm-cat__acts">
        <button type="button" className="q-btn q-btn--primary q-btn--sm" onClick={importar} disabled={importando}>
          <Download size={15} /> {importando ? 'Importando…' : total ? 'Atualizar catálogo' : 'Importar catálogo'}
        </button>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onBuscar} disabled={importando}>
          <Search size={15} /> Ver cardápio
        </button>
      </div>

      {importando && (
        <div className="adm-cat__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Importando catálogo">
          <span style={{ width: `${pct}%` }} />
          <small>{progresso.total > 0 ? `${fmt(progresso.feito)} de ${fmt(progresso.total)}` : 'Preparando…'}</small>
        </div>
      )}

      {ok && (
        <p className="adm-cat__ok" role="status">
          <Check size={15} /> {ok}
        </p>
      )}
      {erro && (
        <p className="q-error" style={{ marginTop: '0.7rem' }}>
          <AlertCircle size={16} /> {erro}
        </p>
      )}
    </div>
  )
}

function Linha({ musica, onSalvar, onFixar }) {
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
          onChange={(e) => setTitulo(e.target.value.slice(0, 120))}
          placeholder="Dar um nome…"
          aria-label={`Nome da música ${musica.numero}`}
        />
        {mudou && titulo.trim() && (
          <button type="submit" className="q-iconbtn" aria-label="Salvar nome">
            <Save size={14} />
          </button>
        )}
      </form>
      {musica.artista && <span className="adm-mus-item__artista">{musica.artista}</span>}
      <span className="adm-mus-item__vezes">{musica.vezes > 0 ? `${musica.vezes}× cantada` : 'nunca cantada'}</span>
      <button
        type="button"
        className={`q-iconbtn ${musica.destaque ? 'is-fixada' : ''}`}
        onClick={() => onFixar(musica.numero, !musica.destaque)}
        aria-label={musica.destaque ? 'Tirar das sugestões fixas' : 'Fixar nas sugestões'}
        aria-pressed={!!musica.destaque}
        title={musica.destaque ? 'Fixada — toque pra soltar' : 'Fixar nas sugestões'}
      >
        {musica.destaque ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
      </button>
    </li>
  )
}
