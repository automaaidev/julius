import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, CircleHelp } from 'lucide-react'
import { useAvisos } from '../hooks/useAvisos'
import './busca.css'

// Botão que abre as dúvidas frequentes (mesma linha do botão do cardápio).
export function BotaoDuvidas({ onClick }) {
  return (
    <button type="button" className="busca-btn busca-btn--duvidas" onClick={onClick}>
      <CircleHelp size={16} aria-hidden="true" />
      <span>Dúvidas</span>
    </button>
  )
}

// Perguntas e respostas da casa (aba Avisos do painel): a pessoa tira a dúvida aqui
// em vez de ir no balcão. Usa a mesma folha do cardápio.
export default function Duvidas({ onFechar }) {
  const { itens, loading, erro } = useAvisos('faq')
  const painelRef = useRef(null)
  const fecharRef = useRef(onFechar)
  useEffect(() => {
    fecharRef.current = onFechar
  }, [onFechar])

  // Esc fecha, Tab fica dentro da janela, a página de trás não rola e o foco volta
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
      const focaveis = [...painelRef.current.querySelectorAll('button:not(:disabled), summary')]
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

  return createPortal(
    <div
      className="busca"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
    >
      <div className="busca__painel" role="dialog" aria-modal="true" aria-labelledby="duvidas-titulo" ref={painelRef}>
        <header className="busca__topo">
          <h2 id="duvidas-titulo">Dúvidas frequentes</h2>
          <button type="button" className="busca__fechar" onClick={onFechar} aria-label="Fechar dúvidas" autoFocus>
            <X size={18} />
          </button>
        </header>

        <div className="busca__corpo">
          {loading && <p className="busca__status">Carregando…</p>}

          {!loading && erro && (
            <p className="busca__erro" role="alert">
              Não deu pra carregar agora. Tenta de novo em instantes.
            </p>
          )}

          {!loading && !erro && itens.length === 0 && (
            <div className="busca__vazio">
              <CircleHelp size={26} aria-hidden="true" />
              <p>Ainda não há perguntas por aqui.</p>
              <small>Fale com a equipe da casa.</small>
            </div>
          )}

          {itens.length > 0 && (
            <ul className="duvidas__lista">
              {itens.map((p) => (
                <li key={p.id}>
                  <details className="duvidas__item">
                    <summary>{p.titulo}</summary>
                    <p>{p.texto}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
