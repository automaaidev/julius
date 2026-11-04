// Quanto da fila o cliente enxerga. Da posição 5 pra trás o número não aparece (o dono
// não quer o cliente contando "estou em 12º"): ele recebe uma mensagem simples e o
// número volta a aparecer quando faltam poucas (1 a 4 — a mesma sequência que o
// operador monta no aparelho). O painel do operador sempre mostra tudo.
export const POSICAO_VISIVEL_ATE = 4

export const mostraPosicao = (rank) => rank <= POSICAO_VISIVEL_ATE

// Quando um número que alguém já pediu libera pra outra pessoa (settings.repetir_modo):
// 'livre' | 'ao_terminar' | 'tempo' | 'musicas'. Sem a migration 20261103 a coluna não
// existe e o intervalo em minutos fazia tudo (0 = desligado).
export function modoRepetir(settings) {
  return settings?.repetir_modo ?? ((settings?.intervalo_repetir_min ?? 0) > 0 ? 'tempo' : 'livre')
}

export const AVISO_NA_FILA ='Sua música já está na fila. Fique por perto — avisamos aqui quando você for o próximo.'

// Texto de uma mensagem do chat "pro cliente": tira o número da posição quando ele não deve
// aparecer. As mensagens vêm prontas do servidor (chat_pedir_musica) e do modo local.
export function textoParaCliente(texto) {
  return String(texto)
    .replace(/^(Nº \d+) na fila — posição (\d+)$/, (m, nome, pos) =>
      mostraPosicao(Number(pos)) ? m : `${nome} entrou na fila! Avisamos aqui quando você for o próximo. 🎶`
    )
    .replace(/ \(posição (\d+)\)/, (m, pos) => (mostraPosicao(Number(pos)) ? m : ''))
}
