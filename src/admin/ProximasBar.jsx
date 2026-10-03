import { useState } from 'react'
import { Copy, Check, ListOrdered } from 'lucide-react'

const VAGAS = 4

// copia mesmo em http puro (celular na rede local): navigator.clipboard só
// existe em contexto seguro, então cai pro textarea + execCommand.
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

// "Montar no aparelho": as próximas 4 músicas que esperam, na ordem da fila —
// o operador lança essa sequência no aparelho de karaokê sem ficar
// conferindo a lista. Muda sozinha quando a fila anda ou é reordenada.
export default function ProximasBar({ ranked }) {
  const proximas = ranked.filter((e) => e.status === 'waiting').slice(0, VAGAS)
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
