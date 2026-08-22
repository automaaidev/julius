# Juliu's — Sistema de Videokê

React (Vite) + Supabase. Fila em tempo real via Supabase Realtime.

## Setup

1. Crie um projeto em supabase.com.
2. No SQL Editor do projeto, rode `supabase/schema.sql` inteiro.
3. Em Authentication → Users, crie o usuário admin (email/senha) manualmente.
4. Copie `.env.example` para `.env` e preencha com URL + anon key do projeto (Settings → API).
5. `npm install && npm run dev`

## Rotas

- `/` — site institucional (status aberto/fechado, horário, links)
- `/entrar` — cliente entra na fila (nome, telefone, número da música)
- `/fila/:id` — acompanhar posição em tempo real (link recebido ao entrar)
- `/minha-fila` — reencontrar sua posição buscando pelo telefone
- `/admin/login` — login do admin
- `/admin` — painel: abrir/fechar casa, horário, gerenciar fila

## Regras de negócio (implementadas na função `join_queue`, Postgres)

- Máx. 2 músicas ativas (waiting/playing) por telefone.
- Não-consecutivo: se a última posição ativa da fila já é da mesma pessoa
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
