import { SINAIS } from '../lib/avisosCasa'

// "👀 Visto pela equipe" etc. — o sinal que o operador pôs no pedido. Sem sinal, não mostra nada.
export default function SinalChip({ sinal, curto = false }) {
  const s = SINAIS[sinal]
  if (!s) return null
  return (
    <span className={`sinal-chip sinal-chip--${sinal}`}>
      <span aria-hidden="true">{s.emoji}</span> {curto ? s.curto : s.rotulo}
    </span>
  )
}
