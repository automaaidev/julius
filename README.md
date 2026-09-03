# Juliu's — Sistema de Videokê

React (Vite) + Supabase. Fila em tempo real via Supabase Realtime.

## Setup

1. Crie um projeto em supabase.com.
2. No SQL Editor do projeto, rode `supabase/schema.sql` inteiro.
   - Se o banco já existe na versão antiga (com `telefone`), rode em vez disso
     `supabase/migrations/20260902_identidade_por_nome.sql`.
3. Em Authentication → Users, crie o usuário admin (email/senha) manualmente.
4. Copie `.env.example` para `.env` e preencha com URL + anon key do projeto (Settings → API).
5. `npm install && npm run dev`

## Rotas

- `/` — landing page (status aberto/fechado, horário, como funciona, FAQ)
- `/minha-fila` — cliente se identifica pelo nome, vê a posição e pede música
- `/fila/:id` — acompanhar uma música específica em tempo real
- `/admin/login` — login do admin
- `/admin` — painel: abrir/fechar casa, horário, gerenciar fila

## Identidade do cliente

Sem login. Cada navegador tem um `perfil_id` (uuid no `localStorage`, ver
`src/lib/perfil.js`) + um nome de exibição (pode ser o nome da dupla). O
`perfil_id` é o que amarra as músicas de uma pessoa e o limite de 2.

## Regras de negócio (implementadas na função `join_queue`, Postgres)

- Máx. 2 músicas ativas (waiting/playing) por `perfil_id`.
- Não-consecutivo: se a última posição ativa da fila já é do mesmo perfil
  e existe mais alguém na fila, a nova música pula uma posição.
- Tudo roda dentro de uma transação com lock de tabela — evita corrida
  quando dois clientes entram ao mesmo tempo.
- Client (anon key) não tem permissão de `insert` direto em `queue_entries`
  (RLS bloqueia) — só via essa função, `security definer`.

## Pendente / decisões em aberto

- Single-tenant: sem `empresa_id`. Se for vender pra outras casas, revisar
  RLS pra multi-tenant antes.
- Sem timer automático — troca de vez é sempre ação manual do admin
  (botões "Chamar" e "Concluir" no painel).
