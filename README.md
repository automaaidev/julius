# Juliu's — Sistema de Videokê

React (Vite) + Supabase. Fila e chat em tempo real via Supabase Realtime.

## Setup

1. Crie um projeto em supabase.com.
2. No SQL Editor do projeto, rode `supabase/schema.sql` inteiro (instalação do zero).
   - Se o banco já existe numa versão anterior, rode as migrations que faltam
     em `supabase/migrations/`, em ordem (a mais nova é
     `20261005_avisos_e_sinais.sql`; antes dela `20261004_catalogo_musicas.sql`
     — catálogo e cardápio — e `20261003_intervalo_repetir_musica.sql`, depois da
     `20261002_pedidos_do_cliente.sql`: encerramento à meia-noite, limite de
     músicas por pessoa, cancelar música, incluir sem celular, sugestões).
     Elas são idempotentes — pode rodar de novo sem medo.
3. Em Authentication → Users, crie o usuário admin (email/senha) manualmente.
4. Copie `.env.example` para `.env` e preencha com URL + anon key do projeto (Settings → API).
5. `npm install && npm run dev`

## Rotas

- `/` — redireciona pra `/minha-fila` (a casa só usa o sistema de fila, sem
  site de apresentação)
- `/minha-fila` — chat do cliente: diz o nome, depois só manda o número da
  música. Mostra se a casa está aberta, as músicas mais pedidas (sugestões) e
  o **caderninho** (aba "Meu caderninho")
- `/fila/:id` — acompanhar uma música específica em tempo real
- `/app/admin/login` — login do admin
- `/app/admin` — painel: palco (1 música por vez), barra "montar no aparelho"
  (próximas 4), fila (sinais 👀🎶❓ e inclui quem não tem celular), chat
  (com respostas prontas), músicas (cardápio e sugestões), avisos (banco de
  avisos, dúvidas e respostas prontas) e casa (horário + regras da fila)

## Identidade do cliente

Sem login. Cada navegador tem um `perfil_id` (uuid no `localStorage`) + uma
`chave` (segredo do navegador, também no `localStorage`) — ver
`src/lib/perfil.js`. O servidor confere `perfil_id` + `chave` antes de aceitar
qualquer mensagem, pra ninguém falar pela conversa de outra pessoa.

## Chat do sistema

Não é WhatsApp — é uma conversa por cliente (`julius.conversas` +
`julius.chat_mensagens`), dentro do próprio site:

- **Cliente**: primeira mensagem é o nome (`chat_iniciar`); a partir daí só
  pode mandar o número da música (`chat_pedir_musica` valida `^[0-9]{1,5}$`
  no servidor — a tabela também tem esse `check`, então nem um cliente
  arbitrário na API consegue mandar texto livre). Anti-spam de 3s entre
  mensagens.
- **Admin**: vê o inbox (1 conversa por cliente), escreve texto livre,
  apaga mensagem.
- **Automáticas** (triggers no Postgres): "Chamar" avisa quem foi chamado +
  quem é o próximo; "Concluir" avisa que já pode pedir a próxima.
- **Retenção**: conversa sem mensagem nova há 24h é apagada (cascade nas
  mensagens) — não mexe em `queue_entries`, só no chat. Sem cron: a limpeza
  roda de graça toda vez que alguém abre um chat novo (`chat_iniciar` chama
  `julius._limpar_conversas_antigas()`).

## Regras de negócio (implementadas em `julius._entrar_fila` + triggers, Postgres)

- **Ordem de chegada**: quem manda o número primeiro entra primeiro — a
  posição é o fim da fila no momento do envio (sob lock de tabela), sem
  esperar ninguém.
- **Músicas por pessoa** (`settings.limite_musicas`, 1 a 3, padrão 1; muda na
  aba Casa) — quem estiver no limite espera uma terminar. A mesma música não
  entra duas vezes pra mesma pessoa.
- **Intervalo pra repetir música** (`settings.intervalo_repetir_min`, em
  minutos, padrão 30, 0 desliga; o admin escolhe na aba Casa): com ele ligado,
  o mesmo número não entra na fila se já está na fila/no palco (de qualquer
  pessoa) nem se foi cantado há menos de N minutos (`queue_entries.cantada_em`,
  carimbado por trigger ao virar `done`). O operador (`admin_adicionar_fila`)
  ignora a regra — é ele quem decide, por exemplo, um dueto. Migration:
  `20261003_intervalo_repetir_musica.sql`.
- **Cancelar a própria música** (`chat_cancelar_musica`): só enquanto espera;
  vira `status = 'cancelled'` e a pessoa manda o número certo — entra de novo
  no fim da fila.
- **Encerramento à meia-noite** (`settings.encerramento_automatico`, padrão
  ligado): a casa fecha pra novos pedidos às 00:00 mesmo que o horário passe
  disso; ao virar o dia quem estava no palco vira `done`, quem esperava vira
  `cancelled`, e quem conversou ontem recebe o agradecimento
  (`encerrar_fila_vencida`). Sem cron: quem estiver com o site ou o painel
  aberto chama a função a cada minuto (idempotente, 1 execução por dia).
  `cancelled` não conta no placar nem no ranking de mais cantadas.
- **Sugestões** (`musicas_sugeridas`): ranking das músicas que foram pro
  palco + títulos cadastrados na aba Músicas do painel (tabela `musicas`).
  O catálogo em si vive no aparelho de karaokê — aqui só números e o que o
  painel nomeou.
- **Caderninho** (`src/lib/cantadas.js`): lista pessoal de "quero cantar" /
  "já cantei". Fica só no `localStorage` do celular — privado, sem servidor.
  Música concluída entra sozinha em "já cantei", e pedir de novo uma que já
  foi cantada pergunta antes.
- **Banco de avisos** (`julius.avisos`, aba **Avisos** do painel): três tipos de
  texto que o dono edita sem mexer em código. `faq` = perguntas e respostas que o
  cliente abre no botão **Dúvidas** (ele tira a dúvida sem ir ao balcão); `aviso` =
  recado da casa que aparece no topo da tela do cliente enquanto estiver ligado;
  `resposta` = respostas prontas, viram botões no chat do operador (um toque
  manda). Cada texto pode ser ligado/desligado, editado e excluído. O cliente só
  lê o que está ativo e é dele (`faq`/`aviso`); `resposta` é só do operador (RLS).
  Os textos de exemplo entram na primeira vez que a migration roda.
- **Sinais no pedido** (`queue_entries.sinal`): o operador marca cada pedido na
  aba Fila com 👀 visto, 🎶 no aparelho ou ❓ confirmar número (o ❓ também manda
  uma mensagem no chat da pessoa; tocar de novo tira o sinal; há um botão pra marcar
  todos como vistos de uma vez). O cliente enxerga o sinal no cartão da própria
  música, ao vivo. ✅ **Já cantou** é o status `done` (aviso no chat + caderninho).
- **Duas músicas por vez**: é só `limite_musicas = 2` na aba Casa — os dois pedidos
  aparecem como cartões separados e cada um pode ser cancelado/sinalizado.
- **1 música no palco por vez**: índice único parcial em
  `queue_entries (status = 'playing')` barra um 2º `UPDATE` concorrente; o
  painel também desabilita o botão "Chamar" enquanto já tem alguém no palco.
- Tudo roda dentro de uma transação com lock de tabela — evita corrida
  quando dois clientes entram ao mesmo tempo.
- Client (anon key) não tem permissão de `insert`/`update` direto em
  `queue_entries` nem em `chat_mensagens` (RLS bloqueia) — só via as
  funções `security definer` acima.

## Pendente / decisões em aberto

- Pedidos do dono ainda **sem decisão dele** (não implementados): os casos de
  borda (dueto, música pra outra pessoa, subir/baixar tom, voltar, atraso pra
  chegar ao palco). Sinais (👀🎶❓) e banco de avisos estão prontos; o conjunto de
  emojis e os textos de exemplo são sugestão — o dono ajusta os textos na aba Avisos.
- O encerramento é fixo à meia-noite; dá pra desligar na aba Casa → "Regras
  da fila", mas o horário (ex: 00:30) não é configurável.
- Single-tenant: sem `empresa_id`. Se for vender pra outras casas, revisar
  RLS pra multi-tenant antes.
- Coluna `telefone` em `queue_entries` é legado (não é mais coletada);
  mantida só pra não perder histórico de quem já tinha WhatsApp salvo.
