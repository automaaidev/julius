import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Flame, Star, StarOff, Library, Download, Search, Check, Plus } from 'lucide-react'
import { contarCatalogo, definirDestaque, importarCatalogo, aoMudarCatalogo } from '../lib/catalogo'
import { useSugestoes } from '../hooks/useSugestoes'
import BuscaMusicas from '../components/BuscaMusicas'
import CardapioAdmin from './CardapioAdmin'
import { mapErroAdmin } from './erros'

const fmt = (n) => n.toLocaleString('pt-BR')

// Aba Músicas: o catálogo do aparelho (importar), o gerenciador do cardápio
// (adicionar, editar e excluir músicas) e as sugestões da tela do cliente. As
// sugestões são as mais cantadas (contagem automática da fila) + as que ficam
// fixadas com a estrela. O número sozinho não diz nada pra quem é de primeira
// viagem — por isso o nome.
export default function MusicasPanel() {
  const { sugestoes, loading, refetch } = useSugestoes(100)
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [numeroParaAdicionar, setNumeroParaAdicionar] = useState(null)
  const [versaoLista, setVersaoLista] = useState(0) // muda após importar: a lista do gerenciador recarrega

  async function fixar(n, valor) {
    setErro('')
    try {
      await definirDestaque(n, valor)
      refetch()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    }
  }

  const numeroUsado = useCallback(() => setNumeroParaAdicionar(null), [])

  return (
    <>
      <Catalogo onBuscar={() => setBuscando(true)} onImportado={() => setVersaoLista((v) => v + 1)} />

      <CardapioAdmin key={versaoLista} onMudou={refetch} numeroParaAdicionar={numeroParaAdicionar} onNumeroUsado={numeroUsado} />

      <div className="q-card">
        <h3 className="adm-h2"><Flame size={15} /> Sugestões de músicas</h3>
        <p className="adm-modo__desc">
          As mais cantadas aparecem pra quem entra no site e não sabe o que pedir. Fixe com a estrela as que você
          quer sempre sugerir — dá pra fixar também na lista de músicas acima.
        </p>

        {erro && (
          <p className="q-error" style={{ marginTop: '0.7rem' }}>
            <AlertCircle size={16} /> {erro}
          </p>
        )}

        {loading ? (
          <p className="q-note">Carregando…</p>
        ) : sugestoes.length === 0 ? (
          <p className="q-note q-note--soft" style={{ textAlign: 'left', marginTop: '1rem' }}>
            Nada por aqui ainda. Conforme as músicas forem cantadas elas aparecem na lista; ou fixe músicas do cardápio
            com a estrela.
          </p>
        ) : (
          <ul className="adm-mus-list">
            {sugestoes.map((s) => (
              <li key={s.numero} className="adm-mus-item">
                <b className="adm-mus-item__num">Nº {s.numero}</b>
                <span className="adm-mus-item__nome">
                  {s.titulo ? (
                    <>
                      {s.titulo}
                      {s.artista && <i> — {s.artista}</i>}
                    </>
                  ) : (
                    <>
                      <em>sem nome no cardápio</em>
                      <button type="button" className="q-linkbtn adm-mus-item__dar" onClick={() => setNumeroParaAdicionar(s.numero)}>
                        <Plus size={12} /> adicionar ao cardápio
                      </button>
                    </>
                  )}
                </span>
                <span className="adm-mus-item__vezes">{s.vezes > 0 ? `${s.vezes}× cantada` : 'nunca cantada'}</span>
                <button
                  type="button"
                  className={`q-iconbtn ${s.destaque ? 'is-fixada' : ''}`}
                  onClick={() => fixar(s.numero, !s.destaque)}
                  aria-label={s.destaque ? 'Tirar das sugestões fixas' : 'Fixar nas sugestões'}
                  aria-pressed={!!s.destaque}
                  title={s.destaque ? 'Fixada — toque pra soltar' : 'Fixar nas sugestões'}
                >
                  {s.destaque ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                </button>
              </li>
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
function Catalogo({ onBuscar, onImportado }) {
  const [total, setTotal] = useState(null) // null = ainda não sabe
  const [progresso, setProgresso] = useState(null) // { feito, total } enquanto importa
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const contar = useCallback(async () => {
    try {
      setTotal(await contarCatalogo())
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    }
  }, [])

  // conta de novo quando o catálogo muda (música adicionada/excluída/importação)
  useEffect(() => {
    contar()
    return aoMudarCatalogo(contar)
  }, [contar])

  async function importar() {
    setConfirmando(false)
    setErro('')
    setOk('')
    setProgresso({ feito: 0, total: 0 })
    try {
      const n = await importarCatalogo((feito, tot) => setProgresso({ feito, total: tot }))
      setOk(`${fmt(n)} músicas carregadas.`)
      onImportado?.()
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
        <button
          type="button"
          className="q-btn q-btn--primary q-btn--sm"
          onClick={() => (total ? setConfirmando(true) : importar())}
          disabled={importando}
        >
          <Download size={15} /> {importando ? 'Importando…' : total ? 'Recarregar lista original' : 'Importar catálogo'}
        </button>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onBuscar} disabled={importando}>
          <Search size={15} /> Ver cardápio
        </button>
      </div>

      {confirmando && (
        <div className="q-warn" role="alert">
          <span>
            Recarregar a lista original do aparelho <b>desfaz o que você mexeu</b>: músicas excluídas voltam e nomes
            editados são sobrescritos. Músicas que você adicionou por conta própria continuam. Continuar?
          </span>
          <div className="q-cancel__acts">
            <button type="button" className="q-btn q-btn--primary q-btn--sm" onClick={importar}>
              Sim, recarregar
            </button>
            <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
