import { useState } from 'react'
import { Copy, Check, ListOrdered } from 'lucide-react'
import { copiarTexto } from '../lib/clipboard'
import { useTitulos } from '../hooks/useTitulos'

const VAGAS = 4

// "Montar no aparelho": as próximas 4 músicas que esperam, na ordem da fila —
// o operador lança essa sequência no aparelho de karaokê sem ficar
// conferindo a lista. Muda sozinha quando a fila anda ou é reordenada.
export default function ProximasBar({ ranked }) {
  const proximas = ranked.filter((e) => e.status === 'waiting').slice(0, VAGAS)
  const titulos = useTitulos(proximas.map((e) => e.numero_musica))
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    const ok = await copiarTexto(proximas.map((e) => e.numero_musica).join(', '))
    if (!ok) return
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <section className="adm-seq" aria-label="Próximas músicas pra montar no aparelho">
      <div className="adm-seq__head">
        <span className="adm-seq__title"><ListOrdered size={15} /> Montar no aparelho</span>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={copiar} disabled={proximas.length === 0}>
          {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar números'}
        </button>
      </div>
      <ol className="adm-seq__list">
        {Array.from({ length: VAGAS }, (_, i) => proximas[i]).map((e, i) =>
          e ? (
            <li key={e.id} className="adm-seq__slot">
              <span className="adm-seq__pos">{i + 1}</span>
              <span className="adm-seq__txt">
                <b>Nº {e.numero_musica}</b>
                {titulos.get(e.numero_musica)?.titulo && <em>{titulos.get(e.numero_musica).titulo}</em>}
                <span>{e.nome}</span>
              </span>
            </li>
          ) : (
            <li key={`vaga-${i}`} className="adm-seq__slot is-empty">
              <span className="adm-seq__pos">{i + 1}</span>
              <span className="adm-seq__txt"><span>vaga livre</span></span>
            </li>
          )
        )}
      </ol>
    </section>
  )
}
