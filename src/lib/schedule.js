// Cálculo de "quando abrimos" a partir do horario_funcionamento (settings).
// Usado no hero quando a casa está FECHADA, pra dar um gancho ao visitante
// ("Abrimos hoje às 19h") em vez de só um "fechado" seco.

const LABEL_DIA = {
  seg: 'segunda',
  ter: 'terça',
  qua: 'quarta',
  qui: 'quinta',
  sex: 'sexta',
  sab: 'sábado',
  dom: 'domingo',
}

// jsDay: 0=domingo ... 6=sábado  ->  chave usada no settings
const JS_DAY_TO_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

export function chaveDoDia(jsDay) {
  return JS_DAY_TO_KEY[jsDay]
}

// "19:00-01:00" -> { abre: 1140, fecha: 1500 }  (minutos desde 00:00;
// fecha > 1440 quando a faixa vira o dia). "fechado"/vazio -> null.
export function parseFaixa(faixa) {
  if (!faixa || faixa === 'fechado') return null
  const [ini, fim] = String(faixa).split('-')
  if (!ini || !fim) return null
  const toMin = (s) => {
    const [h, m] = s.trim().split(':').map(Number)
    return h * 60 + (m || 0)
  }
  let abre = toMin(ini)
  let fecha = toMin(fim)
  if (fecha <= abre) fecha += 1440 // fecha de madrugada
  return { abre, fecha }
}

// "1140" (minutos) -> "19h" ou "19h30"
export function formatHora(min) {
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/**
 * Próxima abertura a partir de `now`, varrendo os próximos 7 dias.
 *
 * @param {Record<string,string>} horario  ex: { sex: '19:00-01:00', sab: 'fechado', ... }
 * @param {Date} now
 * @returns {{ label: string } | null}
 *   label ex: "Abrimos hoje às 19h" | "Abrimos amanhã às 19h" | "Abrimos sexta às 19h"
 *   null quando não há nenhuma faixa cadastrada na semana.
 *
 * TODO(user): implementar o loop de varredura — veja o pedido no chat.
 */
export function proximaAbertura(horario, now = new Date()) {
  if (!horario) return null
  const minAgora = now.getHours() * 60 + now.getMinutes()

  // TODO(user): varrer offset de 0..6 dias.
  //  - offset 0 = hoje: só conta se `abre` ainda está no futuro (abre > minAgora)
  //  - achou faixa válida -> montar label com prefixo "hoje" / "amanhã" / LABEL_DIA[chave]
  //  - usar chaveDoDia((now.getDay() + offset) % 7), parseFaixa, formatHora
  void minAgora
  void LABEL_DIA
  return null
}
