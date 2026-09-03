// Abertura da casa: automática pelo horario_funcionamento, com override manual.
//
// settings.abertura_modo:
//   'auto'    -> segue o horário cadastrado (padrão)
//   'aberto'  -> força aberto, ignora horário
//   'fechado' -> força fechado, ignora horário
//
// horario_funcionamento: { sex: '19:00-01:00', sab: 'fechado', ... }
// Faixa que vira o dia ("19:00-01:00") mantém a casa aberta na madrugada
// seguinte.

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
    if (Number.isNaN(h)) return null
    return h * 60 + (m || 0)
  }
  const abre = toMin(ini)
  let fecha = toMin(fim)
  if (abre == null || fecha == null) return null
  if (fecha <= abre) fecha += 1440 // fecha de madrugada
  return { abre, fecha }
}

// "1140" (minutos) -> "19h" ou "19h30"
export function formatHora(min) {
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function faixaDoDia(horario, jsDay) {
  if (!horario) return null
  return parseFaixa(horario[chaveDoDia(jsDay)])
}

/**
 * A casa está aberta AGORA pelo horário cadastrado?
 * Considera também a faixa de ontem que vira a madrugada de hoje.
 */
export function abertoPorHorario(horario, now = new Date()) {
  if (!horario) return false
  const minAgora = now.getHours() * 60 + now.getMinutes()

  const hoje = faixaDoDia(horario, now.getDay())
  if (hoje && minAgora >= hoje.abre && minAgora < hoje.fecha) return true

  // faixa de ontem que passou da meia-noite (ex: sex 19:00-01:00 -> sáb 01:00)
  const ontem = faixaDoDia(horario, (now.getDay() + 6) % 7)
  if (ontem && ontem.fecha > 1440 && minAgora < ontem.fecha - 1440) return true

  return false
}

/**
 * Estado efetivo da casa, resolvendo o modo de abertura.
 * @param {{abertura_modo?: string, horario_funcionamento?: object}} settings
 * @returns {boolean}
 */
export function abertoAgora(settings, now = new Date()) {
  if (!settings) return false
  if (settings.abertura_modo === 'aberto') return true
  if (settings.abertura_modo === 'fechado') return false
  return abertoPorHorario(settings.horario_funcionamento, now)
}

/**
 * Próxima abertura a partir de `now`, varrendo os próximos 7 dias.
 * @returns {{ label: string } | null}
 *   ex: "Abrimos hoje às 19h" | "Abrimos amanhã às 19h" | "Abrimos sexta às 19h"
 *   null quando não há nenhuma faixa cadastrada na semana.
 */
export function proximaAbertura(horario, now = new Date()) {
  if (!horario) return null
  const minAgora = now.getHours() * 60 + now.getMinutes()

  for (let offset = 0; offset < 7; offset++) {
    const jsDay = (now.getDay() + offset) % 7
    const faixa = faixaDoDia(horario, jsDay)
    if (!faixa) continue
    if (offset === 0 && faixa.abre <= minAgora) continue // já passou da abertura hoje

    let quando
    if (offset === 0) quando = 'hoje'
    else if (offset === 1) quando = 'amanhã'
    else quando = LABEL_DIA[chaveDoDia(jsDay)]

    return { label: `Abrimos ${quando} às ${formatHora(faixa.abre)}` }
  }

  return null
}
