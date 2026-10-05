// Textos das mensagens automáticas do chat (sistema). Têm que ser os MESMOS
// textos gravados pela função julius.chat_pedir_musica / triggers (Postgres)
// — aqui é só o espelho pro modo local (SQLite no navegador). Ajuste o tom
// à vontade, só mantenha os dois lados iguais se mudar.

export const MSG = {
  boasVindas: (nome) => `Oi, ${nome}! Manda o número da música que você quer cantar 🎤`,
  entrouNaFila: (numero, posicao) => `Nº ${numero} na fila — posição ${posicao}`,
  casaFechada: 'A casa está fechada agora — tenta de novo no horário de funcionamento.',
  limiteMusicas: (limite) =>
    limite === 1
      ? 'Você já tem 1 música na fila. Espera ela terminar pra pedir outra.'
      : `Você já tem ${limite} músicas na fila. Espera uma terminar pra pedir outra.`,
  musicaRepetida: 'Essa música você já pediu — ela já está na fila.',
  // posicao '0' = está no palco agora
  musicaNaFila: (posicao) =>
    posicao === '0'
      ? 'Essa música está no palco agora. Escolhe outra.'
      : `Essa música já está na fila (posição ${posicao}). Escolhe outra ou espera ela tocar.`,
  musicaRecente: (min) => `Essa música acabou de ser cantada. Dá pra pedir de novo em uns ${min} min — ou escolhe outra.`,
  canceladaPelaPessoa: (numero) => `Nº ${numero} saiu da fila. Manda o número certo quando quiser 🎶`,
  encerramento: 'Valeu por cantar com a gente! A fila encerrou à meia-noite. Até a próxima 🎤',
  erroGenerico: 'Não deu pra entrar na fila agora. Tenta de novo.',
  suaVez: (numero) => `É a sua vez! Nº ${numero} — sobe no palco 🎤`,
  proximo: (numero) => `Se prepara: você é o próximo, Nº ${numero} 👀`,
  concluido: 'Valeu por cantar! Quando quiser, manda o número da próxima 🎶',
}

// As respostas prontas do operador (botões do chat) agora vivem no banco: aba Avisos do painel.
