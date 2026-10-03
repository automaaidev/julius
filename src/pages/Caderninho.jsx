import { useState } from 'react'
import { Check, Mic2, Plus, Trash2, Lock } from 'lucide-react'
import { useCantadas, adicionarMusica, marcarFeita, removerItem } from '../lib/cantadas'
import { obterMusicas } from '../lib/catalogo'

function quando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return 'hoje'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// "Meu caderninho": lista só da pessoa (fica no navegador dela) pra anotar o
// que quer cantar e marcar o que já cantou — sem papel e caneta no balcão.
export default function Caderninho({ onPedir, podePedir }) {
  const { itens } = useCantadas()
  const [numero, setNumero] = useState('')
  const [titulo, setTitulo] = useState('')
  const [aviso, setAviso] = useState('')

  const querCantar = itens.filter((i) => !i.feita)
  const jaCantei = itens
    .filter((i) => i.feita)
    .sort((a, b) => String(b.feitaEm).localeCompare(String(a.feitaEm)))

  async function anotar(e) {
    e.preventDefault()
    // só o número digitado: o nome vem do catálogo, se a música estiver lá
    let nome = titulo
    if (!nome.trim() && numero) nome = (await obterMusicas([numero])).get(numero)?.titulo ?? ''
    const r = adicionarMusica({ numero, titulo: nome })
    if (!r.ok) {
      setAviso(r.erro || 'Coloca o número da música.')
      return
    }
    setAviso(r.repetida ? 'Essa já está no seu caderninho.' : '')
    setNumero('')
    setTitulo('')
  }

  return (
    <>
      <div className="q-card">
        <form className="cad-add" onSubmit={anotar}>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Nº"
            maxLength={5}
            aria-label="Número da música"
            required
          />
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value.slice(0, 40))}
            placeholder="Nome (opcional)"
            maxLength={40}
            aria-label="Nome da música"
          />
          <button className="q-iconbtn q-iconbtn--lg" type="submit" aria-label="Anotar">
            <Plus size={18} />
          </button>
        </form>
        {aviso && <p className="cad-aviso">{aviso}</p>}

        {itens.length === 0 && (
          <p className="q-note q-note--soft cad-vazio">
            Anota aqui as músicas que você quer cantar e marca as que já cantou — sem papel e caneta.
          </p>
        )}

        {querCantar.length > 0 && (
          <>
            <h3 className="cad-h">Quero cantar · {querCantar.length}</h3>
            <ul className="cad-list">
              {querCantar.map((i) => (
                <li key={i.id} className="cad-item">
                  <button
                    type="button"
                    className="cad-check"
                    onClick={() => marcarFeita(i.id, true)}
                    aria-label={`Marcar Nº ${i.numero} como já cantada`}
                  />
                  <span className="cad-item__txt">
                    <b>Nº {i.numero}</b>
                    {i.titulo && <span>{i.titulo}</span>}
                  </span>
                  <button
                    type="button"
                    className="q-btn q-btn--primary q-btn--sm cad-pedir"
                    onClick={() => onPedir(i.numero)}
                    disabled={!podePedir}
                    title={podePedir ? undefined : 'Agora não dá pra pedir música'}
                  >
                    <Mic2 size={14} /> Pedir
                  </button>
                  <button type="button" className="q-iconbtn" onClick={() => removerItem(i.id)} aria-label="Apagar do caderninho">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {jaCantei.length > 0 && (
          <details className="cad-feitas">
            <summary>Já cantei · {jaCantei.length}</summary>
            <ul className="cad-list">
              {jaCantei.map((i) => (
                <li key={i.id} className="cad-item cad-item--feita">
                  <button
                    type="button"
                    className="cad-check is-on"
                    onClick={() => marcarFeita(i.id, false)}
                    aria-label={`Desmarcar Nº ${i.numero}`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>
                  <span className="cad-item__txt">
                    <b>Nº {i.numero}</b>
                    {i.titulo && <span>{i.titulo}</span>}
                  </span>
                  <span className="cad-when">{quando(i.feitaEm)}</span>
                  <button type="button" className="q-iconbtn" onClick={() => removerItem(i.id)} aria-label="Apagar do caderninho">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <p className="q-hint">
        <Lock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
        Só você vê — fica guardado neste celular. Se limpar os dados do navegador, a lista some.
      </p>
    </>
  )
}
