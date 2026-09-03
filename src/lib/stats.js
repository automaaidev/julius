// Contagem de músicas pedidas por período, a partir de created_at das
// entradas da fila (inclui as já concluídas). Períodos são de calendário:
// hoje = desde 00:00; semana = desde segunda 00:00; mês = dia 1; ano = 1º jan.
//
// Obs: se o admin "Remover" uma entrada, ela sai da contagem também.

export function contarMusicas(entries, now = new Date()) {
  const inicioDia = new Date(now)
  inicioDia.setHours(0, 0, 0, 0)

  const inicioSemana = new Date(inicioDia)
  inicioSemana.setDate(inicioDia.getDate() - ((inicioDia.getDay() + 6) % 7)) // segunda

  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
  const inicioAno = new Date(now.getFullYear(), 0, 1)

  const acc = { dia: 0, semana: 0, mes: 0, ano: 0, total: entries.length }

  for (const e of entries) {
    const t = new Date(e.created_at)
    if (Number.isNaN(t.getTime())) continue
    if (t >= inicioAno) acc.ano++
    if (t >= inicioMes) acc.mes++
    if (t >= inicioSemana) acc.semana++
    if (t >= inicioDia) acc.dia++
  }

  return acc
}
