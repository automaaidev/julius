-- Juliu's — Videokê da Cidade
-- Schema: fila de karaokê (single-tenant)
-- Banco compartilhado com outros projetos — tudo isolado no schema "julius".

create extension if not exists "pgcrypto";

create schema if not exists julius;

-- expõe o schema via API (equivalente a incluir "julius" em PGRST_DB_SCHEMAS)
grant usage on schema julius to anon, authenticated, service_role;
alter default privileges in schema julius grant all on tables to anon, authenticated, service_role;
alter default privileges in schema julius grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema julius grant all on functions to anon, authenticated, service_role;

-- ============================================================
-- settings (linha única, controla status aberto/fechado + horário)
-- ============================================================
create table if not exists julius.settings (
  id int primary key default 1 check (id = 1), -- singleton row
  status_aberto boolean not null default false,
  horario_funcionamento jsonb not null default '{}'::jsonb,
  -- ex: {"seg":"fechado","ter":"fechado","qua":"19:00-23:00","qui":"19:00-23:00","sex":"19:00-01:00","sab":"19:00-01:00","dom":"18:00-23:00"}
  updated_at timestamptz not null default now()
);

insert into julius.settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- queue_entries
-- ============================================================
-- identidade do cliente = "perfil" (perfil_id: uuid gerado no navegador,
-- guardado no localStorage) + nome de exibição (pode ser o nome da dupla).
-- Sem login. O limite de músicas vale por perfil_id.
create table if not exists julius.queue_entries (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  perfil_id text not null,
  numero_musica text not null,
  status text not null default 'waiting' check (status in ('waiting','playing','done')),
  posicao int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_queue_status on julius.queue_entries (status);
create index if not exists idx_queue_posicao on julius.queue_entries (posicao);
create index if not exists idx_queue_perfil on julius.queue_entries (perfil_id);

-- ============================================================
-- RLS
-- ============================================================
alter table julius.settings enable row level security;
alter table julius.queue_entries enable row level security;

-- settings: leitura publica (site precisa saber aberto/fechado + horario), escrita só admin autenticado
create policy "settings_select_public" on julius.settings
  for select using (true);

create policy "settings_update_admin" on julius.settings
  for update using (auth.role() = 'authenticated');

-- queue_entries: leitura publica (cliente acompanha fila em tempo real sem login)
create policy "queue_select_public" on julius.queue_entries
  for select using (true);

-- insert só via função join_queue (security definer) — bloqueia insert direto da anon key
create policy "queue_insert_blocked" on julius.queue_entries
  for insert with check (false);

-- update/delete só admin autenticado (concluir, reordenar, remover)
create policy "queue_update_admin" on julius.queue_entries
  for update using (auth.role() = 'authenticated');

create policy "queue_delete_admin" on julius.queue_entries
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- join_queue: entrada atômica na fila (evita corrida entre 2 clientes
-- entrando ao mesmo tempo). security definer p/ contornar RLS de insert.
--
-- Regras:
--   1. casa tem que estar aberta
--   2. máx 2 músicas (status waiting/playing) por perfil_id
--   3. não-consecutivo: se a última posição ativa da fila já é desse
--      perfil, a nova entrada pula uma posição — a menos que não haja
--      mais ninguém (outro perfil) ativo na fila.
-- ============================================================
create or replace function julius.join_queue(
  p_nome text,
  p_perfil text,
  p_numero_musica text
) returns julius.queue_entries
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_aberto boolean;
  v_count_pessoa int;
  v_tail_posicao int;
  v_tail_perfil text;
  v_outros_ativos int;
  v_nova_posicao int;
  v_row julius.queue_entries;
begin
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'NOME_VAZIO' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_perfil), '') = '' then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  -- trava a fila inteira p/ essa transação: evita duas entradas
  -- concorrentes calculando a mesma posição.
  lock table julius.queue_entries in share row exclusive mode;

  select status_aberto into v_aberto from julius.settings where id = 1;
  if not v_aberto then
    raise exception 'CASA_FECHADA' using errcode = 'P0001';
  end if;

  select count(*) into v_count_pessoa
  from julius.queue_entries
  where perfil_id = p_perfil and status in ('waiting','playing');

  if v_count_pessoa >= 2 then
    raise exception 'LIMITE_2_MUSICAS' using errcode = 'P0001';
  end if;

  select posicao, perfil_id into v_tail_posicao, v_tail_perfil
  from julius.queue_entries
  where status in ('waiting','playing')
  order by posicao desc
  limit 1;

  if v_tail_posicao is null then
    v_nova_posicao := 1;
  else
    select count(*) into v_outros_ativos
    from julius.queue_entries
    where status in ('waiting','playing') and perfil_id <> p_perfil;

    if v_tail_perfil = p_perfil and v_outros_ativos > 0 then
      -- pularia posição consecutiva com música própria: pula uma
      v_nova_posicao := v_tail_posicao + 2;
    else
      v_nova_posicao := v_tail_posicao + 1;
    end if;
  end if;

  insert into julius.queue_entries (nome, perfil_id, numero_musica, status, posicao)
  values (btrim(p_nome), p_perfil, p_numero_musica, 'waiting', v_nova_posicao)
  returning * into v_row;

  return v_row;
end;
$$;

-- anon (cliente sem login) pode chamar a função, RLS interna dela cuida do resto
grant execute on function julius.join_queue(text, text, text) to anon, authenticated;

-- realtime
alter publication supabase_realtime add table julius.queue_entries;
alter publication supabase_realtime add table julius.settings;
