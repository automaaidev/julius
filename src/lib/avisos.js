// Mensagens que o painel manda pro cliente no WhatsApp.
// Tom da casa Juliu's — ajuste o texto à vontade, não quebra nada.

// 'proximo' -> tá em 2º, prepara / 'vez' -> sobe no palco agora
export function mensagemAviso(tipo, entry) {
  const nome = entry?.nome || 'Você'
  const num = entry?.numero_musica || ''

  if (tipo === 'vez') {
    return `🎤 Juliu's\n\n${nome}, é a SUA VEZ! Sobe no palco e canta a música Nº ${num}. Bora! 🎶`
  }
  // proximo
  return `🎤 Juliu's\n\n${nome}, se prepara: você é o PRÓXIMO da fila (música Nº ${num}). Fica pertinho do palco! 👀`
}

// tipo de aviso conforme a posição/estado da entrada
export function tipoAviso(entry) {
  if (entry?.status === 'playing' || entry?.rank === 1) return 'vez'
  return 'proximo'
}
