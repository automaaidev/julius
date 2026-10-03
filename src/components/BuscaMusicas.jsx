import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Check, BookOpen, AlertCircle, ArrowDownAZ } from 'lucide-react'
import { CATEGORIAS, MIN_BUSCA } from '../lib/catalogo'
import { normalizar } from '../lib/normalizar'
import { useBuscaMusicas } from '../hooks/useBuscaMusicas'
import './busca.css'

const fmt = (n) => n.toLocaleString('pt-BR')

// o "fim do cardápio" só aparece quando a lista é grande o bastante pra ter sido rolada
const LISTA_LONGA = 20

// Botão que abre o cardápio. Mesmo componente no cliente (largura total, logo abaixo
// das abas) e no painel (pílula pequena na barra do topo).
export function BotaoCardapio({ onClick, compacto = false, children }) {
  return (
    <button type="button" className={`busca-btn ${compacto ? 'busca-btn--compacto' : ''}`} onClick={onClick}>
      <BookOpen size={compacto ? 14 : 16} aria-hidden="true" />
      <span>{children ?? 'Cardápio de músicas'}</span>
    </button>
  )
}

const MIGRATION_PENDENTE = /could not find the function|schema cache|does not exist/i

// Cardápio de músicas: o catálogo inteiro (nome + número), em ordem alfabética, e um
// campo pra filtrar pelo nome da música ou do cantor. Folha na parte de baixo
// (celular) / janela no meio (tela grande). A lista vem aos poucos, conforme rola.
//
//   principal   { rotulo, onClick(musica), desabilitada?, dica? } — o toque na linha
//   secundaria  { rotulo, Icone, onClick(musica) } — botão pequeno ao lado (opcional)
//   aviso       texto no topo da lista (por que a ação principal está desligada, por ex.)
//   onClick (pode ser async) devolve { fechar: true } pra fechar o cardápio ou
//   { feito: 'Copiado' } pra marcar a linha por um instante; qualquer outra coisa
//   deixa tudo como está.
export default function BuscaMusicas({ onFechar, principal, secundaria, aviso, admin = false }) {
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState(null)
  const [ordem, setOrdem] = useState('titulo')
  const [feitos, setFeitos] = useState({}) // numero -> texto do selo
  const { itens, total, carregando, carregandoMais, erro, filtrando, temMais, carregarMais } = useBuscaMusicas(q, categoria, ordem)
  const painelRef = useRef(null)
  const campoRef = useRef(null)
  const corpoRef = useRef(null)
  const fimRef = useRef(null)
  // o pai costuma passar uma função nova a cada render; o efeito de teclado/foco
  // abaixo roda uma vez só (senão devolveria o foco pra quem abriu a cada render)
  const fecharRef = useRef(onFechar)
  useEffect(() => {
    fecharRef.current = onFechar
  }, [onFechar])
  const tamanhoTermo = normalizar(q).length
  const umaLetra = tamanhoTermo > 0 && tamanhoTermo < MIN_BUSCA

  // Esc fecha, Tab fica dentro da janela, a página de trás não rola, e o foco
  // volta pra quem abriu.
  useEffect(() => {
    const antes = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function teclas(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        fecharRef.current()
        return
      }
      if (e.key !== 'Tab' || !painelRef.current) return
      const focaveis = [...painelRef.current.querySelectorAll('button:not(:disabled), input')]
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('keydown', teclas)
      document.body.style.overflow = overflow
      antes?.focus?.()
    }
  }, [])

  // outro filtro/categoria/ordem = lista nova: volta pro topo
  const filtroKey = `${tamanhoTermo >= MIN_BUSCA ? q : ''}|${categoria}|${ordem}`
  useEffect(() => {
    corpoRef.current?.scrollTo({ top: 0 })
  }, [filtroKey])

  // chegou perto do fim da lista: pede a próxima página
  useEffect(() => {
    const fim = fimRef.current
    if (!fim || !temMais || erro) return
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) carregarMais()
      },
      { root: corpoRef.current, rootMargin: '400px 0px' }
    )
    obs.observe(fim)
    return () => obs.disconnect()
  }, [temMais, erro, carregarMais, itens.length])

  async function executar(acao, musica) {
    if (!acao || acao.desabilitada) return
    const r = await acao.onClick(musica)
    if (r?.fechar) {
      onFechar()
    } else if (r?.feito) {
      setFeitos((f) => ({ ...f, [musica.numero]: r.feito }))
      setTimeout(
        () =>
          setFeitos((f) => {
            const resto = { ...f }
            delete resto[musica.numero]
            return resto
          }),
        2200
      )
    }
  }

  function limpar() {
    setQ('')
    campoRef.current?.focus()
  }

  const SecIcone = secundaria?.Icone
  const primeiraCarga = carregando && itens.length === 0
  const semResultado = !carregando && !erro && itens.length === 0

  return createPortal(
    <div
      className="busca"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
    >
      <div className="busca__painel" role="dialog" aria-modal="true" aria-labelledby="busca-titulo" ref={painelRef}>
        <header className="busca__topo">
          <h2 id="busca-titulo">Cardápio de músicas</h2>
          <button type="button" className="busca__fechar" onClick={onFechar} aria-label="Fechar cardápio">
            <X size={18} />
          </button>
        </header>

        <div className="busca__campo">
          <Search size={17} aria-hidden="true" />
          <input
            ref={campoRef}
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 60))}
            placeholder="Filtrar por música ou cantor"
            aria-label="Filtrar o cardápio pelo nome da música, do cantor ou pelo número"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {q && (
            <button type="button" className="busca__limpar" onClick={limpar} aria-label="Limpar filtro">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="busca__cats" role="group" aria-label="Filtrar por categoria">
          <button type="button" className={`busca__cat ${categoria === null ? 'is-on' : ''}`} aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
            Todas
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              className={`busca__cat ${categoria === c ? 'is-on' : ''}`}
              aria-pressed={categoria === c}
              onClick={() => setCategoria(categoria === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="busca__barra">
          <p className="busca__status" aria-live="polite">
            {primeiraCarga
              ? 'Carregando…'
              : erro
                ? ''
                : `${fmt(total)} ${total === 1 ? 'música' : 'músicas'}${filtrando ? ` com “${q.trim()}”` : ''}${categoria ? ` em ${categoria}` : ''}`}
          </p>
          <button
            type="button"
            className="busca__ordem"
            onClick={() => setOrdem(ordem === 'titulo' ? 'artista' : 'titulo')}
            aria-label={`Ordem alfabética por ${ordem === 'titulo' ? 'música' : 'cantor'}. Tocar pra ordenar por ${ordem === 'titulo' ? 'cantor' : 'música'}`}
          >
            <ArrowDownAZ size={14} aria-hidden="true" /> {ordem === 'titulo' ? 'Por música' : 'Por cantor'}
          </button>
        </div>

        <div className="busca__corpo" ref={corpoRef}>
          {aviso && <p className="busca__aviso">{aviso}</p>}

          {umaLetra && <p className="busca__dica">Digite pelo menos 2 letras pra filtrar.</p>}

          {erro && (
            <p className="busca__erro" role="alert">
              <AlertCircle size={16} />
              {admin && MIGRATION_PENDENTE.test(erro)
                ? 'Falta rodar a migration 20261004_catalogo_musicas.sql no SQL Editor do Supabase.'
                : 'Não deu pra carregar o cardápio agora. Tenta de novo em instantes.'}
            </p>
          )}

          {semResultado && (
            <div className="busca__vazio">
              {filtrando || categoria ? (
                <>
                  <p>{filtrando ? <>Nada encontrado pra “{q.trim()}”.</> : 'Nenhuma música nessa categoria.'}</p>
                  <small>
                    Tenta só uma parte do nome, outro jeito de escrever{categoria ? ' ou tira o filtro de categoria' : ''}.
                  </small>
                </>
              ) : (
                <>
                  <BookOpen size={26} aria-hidden="true" />
                  <p>O cardápio ainda está vazio.</p>
                  <small>{admin ? 'Importe o catálogo na aba Músicas.' : 'Fale com a equipe da casa.'}</small>
                </>
              )}
            </div>
          )}

          {itens.length > 0 && (
            <>
              {principal && !principal.desabilitada && (
                <p className="busca__dica">Toque numa música pra {principal.rotulo.toLowerCase()}.</p>
              )}
              <ul className={`busca__lista ${carregando ? 'is-carregando' : ''}`}>
                {itens.map((m) => (
                  <li key={m.numero} className="busca__item">
                    <button
                      type="button"
                      className="busca__linha"
                      onClick={() => executar(principal, m)}
                      disabled={!principal || principal.desabilitada}
                      title={principal?.desabilitada ? principal.dica : undefined}
                      aria-label={`${principal?.rotulo ?? 'Música'} Nº ${m.numero}, ${m.titulo}${m.artista ? `, ${m.artista}` : ''}`}
                    >
                      <span className="busca__num">{m.numero}</span>
                      <span className="busca__txt">
                        <b>{m.titulo}</b>
                        <span>{m.artista}</span>
                        {!categoria && m.categoria && <i>{m.categoria}</i>}
                      </span>
                      {feitos[m.numero] ? (
                        <span className="busca__selo busca__selo--feito">
                          <Check size={13} strokeWidth={3} /> {feitos[m.numero]}
                        </span>
                      ) : (
                        principal && !principal.desabilitada && <span className="busca__selo">{principal.rotulo}</span>
                      )}
                    </button>
                    {secundaria && SecIcone && (
                      <button
                        type="button"
                        className="busca__sec"
                        onClick={() => executar(secundaria, m)}
                        aria-label={`${secundaria.rotulo} Nº ${m.numero}`}
                        title={secundaria.rotulo}
                      >
                        <SecIcone size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {temMais && !erro && (
                <div className="busca__mais" ref={fimRef}>
                  <button type="button" className="busca__cat" onClick={carregarMais} disabled={carregandoMais}>
                    {carregandoMais ? 'Carregando…' : `Ver mais (${fmt(total - itens.length)})`}
                  </button>
                </div>
              )}
              {!temMais && itens.length > LISTA_LONGA && <p className="busca__fim">Fim do cardápio · {fmt(total)} músicas</p>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
