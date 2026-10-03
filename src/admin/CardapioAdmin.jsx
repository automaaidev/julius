import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star, StarOff, Check, X, AlertCircle, Search, ListMusic } from 'lucide-react'
import {
  CATEGORIAS,
  adicionarMusicaCardapio,
  atualizarMusicaCardapio,
  excluirMusicaCardapio,
  definirDestaque,
} from '../lib/catalogo'
import { useBuscaMusicas } from '../hooks/useBuscaMusicas'
import { mapErroAdmin } from './erros'

const fmt = (n) => n.toLocaleString('pt-BR')
const VAZIO = { numero: '', titulo: '', artista: '', categoria: '' }

// Gerenciar o cardápio: o operador adiciona, edita e exclui músicas quando quiser.
// A lista é a mesma do cardápio do cliente (paginada, com filtro) — aqui cada linha
// tem editar, excluir e a estrela das sugestões. O código não muda numa edição (a
// fila e o caderninho guardam o número): código errado = excluir e adicionar de novo.
export default function CardapioAdmin({ onMudou, numeroParaAdicionar, onNumeroUsado }) {
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState(null)
  const { itens, total, carregando, carregandoMais, erro: erroLista, filtrando, temMais, carregarMais, ajustarItem } = useBuscaMusicas(q, categoria, 'titulo')

  const [adicionando, setAdicionando] = useState(false)
  const [novo, setNovo] = useState(VAZIO)
  const [editando, setEditando] = useState(null) // código da linha em edição
  const [form, setForm] = useState(VAZIO)
  const [excluindo, setExcluindo] = useState(null) // código com "excluir?" aberto
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  // "Dar nome" numa sugestão sem nome: abre o formulário já com o código
  useEffect(() => {
    if (!numeroParaAdicionar) return
    setAdicionando(true)
    setNovo({ ...VAZIO, numero: numeroParaAdicionar })
    setErro('')
    setAviso('')
    onNumeroUsado?.()
  }, [numeroParaAdicionar, onNumeroUsado])

  async function executar(acao) {
    setOcupado(true)
    setErro('')
    setAviso('')
    try {
      await acao()
      onMudou?.()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    } finally {
      setOcupado(false)
    }
  }

  function adicionar(e) {
    e.preventDefault()
    return executar(async () => {
      const dados = await adicionarMusicaCardapio(novo)
      setAviso(`Nº ${dados.numero} (${dados.titulo}) adicionada ao cardápio.`)
      setNovo(VAZIO)
      setAdicionando(false)
      setCategoria(null)
      setQ(dados.numero) // mostra a música nova na lista
    })
  }

  function abrirEdicao(m) {
    setEditando(m.numero)
    setExcluindo(null)
    setForm({ numero: m.numero, titulo: m.titulo ?? '', artista: m.artista ?? '', categoria: m.categoria ?? '' })
    setErro('')
    setAviso('')
  }

  function salvarEdicao(e) {
    e.preventDefault()
    return executar(async () => {
      const dados = await atualizarMusicaCardapio(editando, form)
      ajustarItem(editando, dados)
      setAviso(`Nº ${editando} atualizada.`)
      setEditando(null)
    })
  }

  function excluir(m) {
    return executar(async () => {
      await excluirMusicaCardapio(m.numero)
      ajustarItem(m.numero, null)
      setAviso(`Nº ${m.numero} (${m.titulo}) excluída do cardápio.`)
      setExcluindo(null)
    })
  }

  function alternarDestaque(m) {
    return executar(async () => {
      await definirDestaque(m.numero, !m.destaque)
      ajustarItem(m.numero, { destaque: !m.destaque })
    })
  }

  return (
    <div className="q-card adm-cm">
      <h3 className="adm-h2"><ListMusic size={15} /> Gerenciar músicas do cardápio</h3>
      <p className="adm-modo__desc">
        Adicione músicas que faltam, corrija nome, cantor ou categoria e exclua o que não vale mais. A mudança vale
        na hora pra todo mundo.
      </p>

      {!adicionando ? (
        <button
          type="button"
          className="q-btn q-btn--primary q-btn--sm"
          onClick={() => {
            setAdicionando(true)
            setEditando(null)
            setErro('')
            setAviso('')
          }}
        >
          <Plus size={15} /> Adicionar música
        </button>
      ) : (
        <form className="adm-cm__form" onSubmit={adicionar}>
          <div className="adm-cm__campos">
            <label className="adm-cm__campo adm-cm__campo--num">
              <span>Código</span>
              <input
                value={novo.numero}
                onChange={(e) => setNovo({ ...novo, numero: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                inputMode="numeric"
                placeholder="Nº"
                maxLength={5}
                autoFocus
                required
              />
            </label>
            <label className="adm-cm__campo adm-cm__campo--grande">
              <span>Nome da música</span>
              <input
                value={novo.titulo}
                onChange={(e) => setNovo({ ...novo, titulo: e.target.value.slice(0, 120) })}
                placeholder="Ex.: Evidências"
                required
              />
            </label>
            <label className="adm-cm__campo adm-cm__campo--grande">
              <span>Cantor</span>
              <input
                value={novo.artista}
                onChange={(e) => setNovo({ ...novo, artista: e.target.value.slice(0, 120) })}
                placeholder="Ex.: Chitãozinho e Xororó"
              />
            </label>
            <label className="adm-cm__campo">
              <span>Categoria</span>
              <select value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}>
                <option value="">Sem categoria</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="adm-cm__acts">
            <button type="submit" className="q-btn q-btn--primary q-btn--sm" disabled={ocupado}>
              <Check size={15} /> {ocupado ? 'Adicionando…' : 'Adicionar ao cardápio'}
            </button>
            <button
              type="button"
              className="q-btn q-btn--ghost q-btn--sm"
              onClick={() => {
                setAdicionando(false)
                setNovo(VAZIO)
                setErro('')
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aviso && (
        <p className="adm-cat__ok" role="status">
          <Check size={15} /> {aviso}
        </p>
      )}
      {erro && (
        <p className="q-error" style={{ marginTop: '0.7rem' }} role="alert">
          <AlertCircle size={16} /> {erro}
        </p>
      )}

      <div className="adm-cm__filtros">
        <label className="adm-cm__busca">
          <Search size={16} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 60))}
            placeholder="Procurar por nome, cantor ou código"
            aria-label="Procurar música no cardápio"
            autoComplete="off"
          />
        </label>
        <select value={categoria ?? ''} onChange={(e) => setCategoria(e.target.value || null)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <p className="adm-cm__status" aria-live="polite">
        {carregando && itens.length === 0
          ? 'Carregando…'
          : `${fmt(total)} ${total === 1 ? 'música' : 'músicas'}${filtrando ? ` com “${q.trim()}”` : ''}${categoria ? ` em ${categoria}` : ''}`}
      </p>

      {erroLista && (
        <p className="q-error" role="alert">
          <AlertCircle size={16} /> {mapErroAdmin(erroLista)}
        </p>
      )}

      {!carregando && !erroLista && itens.length === 0 && (
        <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>
          {filtrando || categoria
            ? 'Nada encontrado. Tenta outro pedaço do nome ou adicione a música acima.'
            : 'O cardápio está vazio. Importe o catálogo acima ou adicione músicas.'}
        </p>
      )}

      {itens.length > 0 && (
        <ul className="adm-cm__lista">
          {itens.map((m) =>
            editando === m.numero ? (
              <li key={m.numero} className="adm-cm__item is-editando">
                <form className="adm-cm__form" onSubmit={salvarEdicao}>
                  <p className="adm-cm__codigo">Editando Nº {m.numero}</p>
                  <div className="adm-cm__campos">
                    <label className="adm-cm__campo adm-cm__campo--grande">
                      <span>Nome da música</span>
                      <input
                        value={form.titulo}
                        onChange={(e) => setForm({ ...form, titulo: e.target.value.slice(0, 120) })}
                        autoFocus
                        required
                      />
                    </label>
                    <label className="adm-cm__campo adm-cm__campo--grande">
                      <span>Cantor</span>
                      <input value={form.artista} onChange={(e) => setForm({ ...form, artista: e.target.value.slice(0, 120) })} />
                    </label>
                    <label className="adm-cm__campo">
                      <span>Categoria</span>
                      <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                        <option value="">Sem categoria</option>
                        {CATEGORIAS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="adm-cm__acts">
                    <button type="submit" className="q-btn q-btn--primary q-btn--sm" disabled={ocupado}>
                      <Check size={15} /> {ocupado ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={m.numero} className="adm-cm__item">
                <b className="adm-cm__num">{m.numero}</b>
                <span className="adm-cm__txt">
                  <b>{m.titulo}</b>
                  <span>
                    {m.artista || 'sem cantor'}
                    {m.categoria && <i>{m.categoria}</i>}
                  </span>
                </span>
                <span className="adm-cm__botoes">
                  <button
                    type="button"
                    className={`q-iconbtn ${m.destaque ? 'is-fixada' : ''}`}
                    onClick={() => alternarDestaque(m)}
                    disabled={ocupado}
                    aria-pressed={!!m.destaque}
                    aria-label={m.destaque ? `Tirar a Nº ${m.numero} das sugestões` : `Fixar a Nº ${m.numero} nas sugestões`}
                    title={m.destaque ? 'Fixada nas sugestões — toque pra soltar' : 'Fixar nas sugestões do cliente'}
                  >
                    {m.destaque ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="q-iconbtn"
                    onClick={() => abrirEdicao(m)}
                    disabled={ocupado}
                    aria-label={`Editar a Nº ${m.numero}`}
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="q-iconbtn"
                    onClick={() => {
                      setExcluindo(excluindo === m.numero ? null : m.numero)
                      setErro('')
                    }}
                    disabled={ocupado}
                    aria-label={`Excluir a Nº ${m.numero}`}
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>

                {excluindo === m.numero && (
                  <div className="q-cancel adm-cm__confirma" role="alert">
                    <span>
                      Excluir a Nº {m.numero} — {m.titulo}? Ela some do cardápio dos clientes.
                    </span>
                    <div className="q-cancel__acts">
                      <button type="button" className="q-btn q-btn--danger q-btn--sm" onClick={() => excluir(m)} disabled={ocupado}>
                        <Trash2 size={14} /> Sim, excluir
                      </button>
                      <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setExcluindo(null)} disabled={ocupado}>
                        <X size={14} /> Voltar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}

      {temMais && !erroLista && (
        <div className="adm-cm__mais">
          <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={carregarMais} disabled={carregandoMais}>
            {carregandoMais ? 'Carregando…' : `Ver mais (${fmt(total - itens.length)})`}
          </button>
        </div>
      )}
    </div>
  )
}
