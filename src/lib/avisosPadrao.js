// Textos de exemplo do banco de avisos (tipo, título/pergunta, texto, ordem).
// ESPELHA o insert da migration supabase/migrations/20261005_avisos_e_sinais.sql —
// aqui é só o seed do modo local (SQLite). O dono edita os de verdade no painel (aba Avisos).
export const AVISOS_PADRAO = [
  ["faq", "Como peço uma música?", "Digite seu nome e depois é só mandar o número da música aqui no chat. Quem manda primeiro entra primeiro na fila — não precisa esperar ninguém.", 1],
  ["faq", "Não sei o número da música", "Toque em “Cardápio de músicas”, procure pelo nome da música ou do cantor e toque nela. O número aparece ao lado do nome.", 2],
  ["faq", "Mandei o número errado", "Toque em “Errou o número? Cancelar e mandar outro” no seu pedido e mande o número certo. Você entra de novo no fim da fila.", 3],
  ["faq", "Em que posição estou? Quanto falta?", "A sua posição aparece no pedido e se atualiza sozinha. Quando você for o próximo — e quando for a sua vez — o sistema avisa aqui no chat.", 4],
  ["faq", "Posso pedir mais de uma música?", "Cada pessoa pode ter um número limitado de músicas na fila ao mesmo tempo. Se você já estiver no limite, o sistema avisa; quando uma terminar, é só pedir outra.", 5],
  ["faq", "O que significam os sinais no meu pedido?", "👀 Visto: a equipe já viu o seu pedido. 🎶 No aparelho: a sua música já está na sequência. ❓ Confirmar: a equipe precisa conferir o número com você. ✅ Já cantou: a música foi concluída.", 6],
  ["faq", "Como anoto o que já cantei?", "Use a aba “Meu caderninho”: anote o que quer cantar e marque o que já cantou. É só seu — fica guardado neste celular, sem papel e caneta.", 7],
  ["faq", "A que horas a fila encerra?", "A fila encerra automaticamente à meia-noite. Quem ainda estava esperando recebe uma mensagem de agradecimento.", 8],
  ["resposta", "Conferir número", "Não achei esse número no aparelho. Confere se digitou certo ou procura pelo nome no “Cardápio de músicas”. 😉", 1],
  ["resposta", "Fila cheia", "A fila está cheia hoje, mas a sua música está garantida! O sistema avisa quando for a sua vez. 🎶", 2],
  ["resposta", "Tá chegando", "Tá chegando a sua vez — vai se preparando perto do palco! 🎤", 3],
  ["resposta", "Aparelho ajustando", "Estamos ajustando o aparelho rapidinho. Já volta ao normal, valeu pela paciência! 🙏", 4],
  ["resposta", "Obrigado", "Valeu por cantar com a gente! Volta sempre. 🎶", 5],
]
