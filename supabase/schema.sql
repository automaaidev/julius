-- Juliu's — Videokê da Cidade
-- Schema: fila de karaokê + chat do sistema (single-tenant)
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
  -- política de abertura:
  --   'auto'    -> segue horario_funcionamento (padrão)
  --   'aberto'  -> força aberto  | 'fechado' -> força fechado
  abertura_modo text not null default 'auto'
    check (abertura_modo in ('auto', 'aberto', 'fechado')),
  status_aberto boolean, -- legado; nada mais lê (ver migration 20260904)
  horario_funcionamento jsonb not null default '{}'::jsonb,
  -- ex: {"seg":"fechado","ter":"fechado","qua":"19:00-23:00","qui":"19:00-23:00","sex":"19:00-01:00","sab":"19:00-01:00","dom":"18:00-23:00"}
  -- fila encerra à meia-noite (a faixa do dia vale só até 24h) e quem sobrou
  -- na fila é encerrado, com mensagem de agradecimento — ver encerrar_fila_vencida
  encerramento_automatico boolean not null default true,
  ultimo_encerramento date,
  -- quantas músicas cada pessoa pode ter ao mesmo tempo na fila (waiting/playing)
  limite_musicas int not null default 1 check (limite_musicas between 1 and 3),
  -- minutos até o mesmo número poder voltar pra fila (0 = desligado): barra
  -- música que já está na fila/no palco ou foi cantada há pouco
  intervalo_repetir_min int not null default 30 check (intervalo_repetir_min between 0 and 720),
  updated_at timestamptz not null default now()
);

insert into julius.settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- queue_entries
-- ============================================================
-- identidade do cliente = "perfil" (perfil_id: uuid gerado no navegador,
-- guardado no localStorage) + nome de exibição (pode ser o nome da dupla).
-- Sem login. Cada perfil tem no máx. `limite_musicas` (padrão 1) músicas
-- ativas (waiting/playing) por vez — ver julius._entrar_fila.
create table if not exists julius.queue_entries (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  perfil_id text not null,
  telefone text, -- legado (WhatsApp manual); não é mais coletado, fica p/ histórico
  numero_musica text not null,
  -- 'cancelled' = saiu da fila sem cantar (pessoa cancelou, ou virou o dia)
  status text not null default 'waiting' check (status in ('waiting','playing','done','cancelled')),
  posicao int not null,
  created_at timestamptz not null default now(),
  -- quando virou 'done' (carimbado pelo trigger); interno, anon não enxerga
  cantada_em timestamptz
);

create index if not exists idx_queue_status on julius.queue_entries (status);
create index if not exists idx_queue_posicao on julius.queue_entries (posicao);
create index if not exists idx_queue_perfil on julius.queue_entries (perfil_id);

-- só 1 música no palco por vez: índice único parcial trava um 2º UPDATE
-- concorrente que tente marcar outra entrada como 'playing'.
create unique index if not exists uq_queue_um_no_palco
  on julius.queue_entries ((true))
  where status = 'playing';

-- ============================================================
-- conversas — 1 por perfil_id (chat do sistema, substitui o aviso por
-- WhatsApp). "chave" é um segredo só desse navegador, conferido nas
-- funções abaixo antes de aceitar qualquer coisa em nome desse perfil.
-- ============================================================
create table if not exists julius.conversas (
  perfil_id text primary key,
  chave text not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 24),
  ultima_msg_em timestamptz,
  ultima_msg_texto text,
  nao_lidas_admin int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- chat_mensagens
-- ============================================================
create table if not exists julius.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  perfil_id text not null references julius.conversas (perfil_id) on delete cascade,
  autor text not null check (autor in ('cliente', 'admin', 'sistema')),
  texto text not null check (char_length(texto) between 1 and 500),
  -- cliente só manda o número da música — garantido no próprio banco
  check (autor <> 'cliente' or texto ~ '^[0-9]{1,5}$'),
  queue_entry_id uuid references julius.queue_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_perfil_created on julius.chat_mensagens (perfil_id, created_at);
create index if not exists idx_conversas_ultima_msg on julius.conversas (ultima_msg_em);

-- ============================================================
-- musicas — catálogo do aparelho: número -> título + cantor + categoria.
-- Carregado pelo painel (aba Músicas -> Catálogo -> Importar, a partir de
-- scripts/gerar-catalogo.py). Alimenta a busca (buscar_musicas) e o nome que
-- aparece nas sugestões e na fila. `destaque` = entra nas sugestões mesmo sem
-- ter sido cantada ainda.
-- ============================================================

-- minúscula, sem acento, pontuação vira espaço, apóstrofo some ("I'm" -> "im",
-- como a pessoa digita), espaços colapsados. Imutável, então dá pra usar em coluna
-- gerada. Espelha normalizar() em src/lib/catalogo.js.
create or replace function julius._norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(t, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ-_.,;:!?()[]"/&’´`''',
      'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn               '
    ),
    '\s+', ' ', 'g'
  ))
$$;

create table if not exists julius.musicas (
  numero text primary key check (numero ~ '^[0-9]{1,5}$'),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  artista text,
  categoria text,
  destaque boolean not null default false,
  busca text generated always as (julius._norm(titulo || ' ' || coalesce(artista, ''))) stored,
  -- chaves de ordenação do cardápio; collate "C" porque o texto já vem normalizado
  titulo_norm text collate "C" generated always as (julius._norm(titulo)) stored,
  artista_norm text collate "C" generated always as (julius._norm(artista)) stored,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table julius.settings enable row level security;
-- o cardápio lê direto dos índices (ordem + paginação), sem ordenar o catálogo
create index if not exists idx_musicas_titulo on julius.musicas (titulo_norm, numero);
create index if not exists idx_musicas_artista on julius.musicas (artista_norm, titulo_norm, numero);
create index if not exists idx_musicas_categoria on julius.musicas (categoria, titulo_norm, numero);

alter table julius.musicas enable row level security;
alter table julius.queue_entries enable row level security;
alter table julius.conversas enable row level security;
alter table julius.chat_mensagens enable row level security;

-- settings: leitura publica (site precisa saber aberto/fechado + horario), escrita só admin autenticado
create policy "settings_select_public" on julius.settings
  for select using (true);

create policy "settings_update_admin" on julius.settings
  for update using (auth.role() = 'authenticated');

-- queue_entries: leitura publica (cliente acompanha fila em tempo real sem login)
create policy "queue_select_public" on julius.queue_entries
  for select using (true);

-- telefone é legado (não coletado mais, ver conversas/chat_mensagens): fica
-- fora do que a anon key enxerga.
revoke select on julius.queue_entries from anon;
grant select (id, nome, perfil_id, numero_musica, status, posicao, created_at)
  on julius.queue_entries to anon;

-- insert só via função _entrar_fila (security definer) — bloqueia insert direto da anon key
create policy "queue_insert_blocked" on julius.queue_entries
  for insert with check (false);

-- update/delete só admin autenticado (concluir, reordenar, remover)
create policy "queue_update_admin" on julius.queue_entries
  for update using (auth.role() = 'authenticated');

create policy "queue_delete_admin" on julius.queue_entries
  for delete using (auth.role() = 'authenticated');

-- conversas: leitura pública é só um "ping" pra realtime (perfil_id +
-- ultima_msg_em) — nome e chave nunca vazam pra anon. Tudo mais é admin.
create policy "conversas_select_public" on julius.conversas
  for select using (true);

revoke select, insert, update, delete on julius.conversas from anon;
grant select (perfil_id, ultima_msg_em) on julius.conversas to anon;

create policy "conversas_update_admin" on julius.conversas
  for update using (auth.role() = 'authenticated');

-- chat_mensagens: cliente nunca lê/escreve direto na tabela (só via RPC
-- abaixo, security definer). Admin (authenticated) lê tudo, insere só
-- como 'admin' e pode apagar.
revoke all on julius.chat_mensagens from anon;

create policy "chat_select_admin" on julius.chat_mensagens
  for select using (auth.role() = 'authenticated');

create policy "chat_insert_admin" on julius.chat_mensagens
  for insert with check (auth.role() = 'authenticated' and autor = 'admin');

create policy "chat_delete_admin" on julius.chat_mensagens
  for delete using (auth.role() = 'authenticated');

-- musicas: leitura pública (sugestões na tela do cliente), escrita só admin
revoke insert, update, delete on julius.musicas from anon;

create policy "musicas_select_public" on julius.musicas
  for select using (true);

create policy "musicas_write_admin" on julius.musicas
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- _faixa_minutos / esta_aberto: estado efetivo da casa a partir de
-- abertura_modo + horario_funcionamento (fuso America/Sao_Paulo).
-- ============================================================
create or replace function julius._faixa_minutos(faixa text)
returns int[]
language plpgsql
immutable
as $$
declare
  ini text; fim text; a int; f int;
begin
  if faixa is null or faixa = 'fechado' or position('-' in faixa) = 0 then
    return null;
  end if;
  ini := split_part(faixa, '-', 1);
  fim := split_part(faixa, '-', 2);
  a := split_part(ini, ':', 1)::int * 60 + coalesce(nullif(split_part(ini, ':', 2), ''), '0')::int;
  f := split_part(fim, ':', 1)::int * 60 + coalesce(nullif(split_part(fim, ':', 2), ''), '0')::int;
  if f <= a then f := f + 1440; end if;
  return array[a, f];
exception when others then return null;
end;
$$;

create or replace function julius.esta_aberto()
returns boolean
language plpgsql
stable
as $$
declare
  s julius.settings;
  hora_local timestamp := (now() at time zone 'America/Sao_Paulo');
  dow int;
  min_agora int;
  chaves text[] := array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  fx int[];
begin
  select * into s from julius.settings where id = 1;
  if s.abertura_modo = 'aberto' then return true; end if;
  if s.abertura_modo = 'fechado' then return false; end if;

  dow := extract(dow from hora_local)::int;
  min_agora := extract(hour from hora_local)::int * 60 + extract(minute from hora_local)::int;

  fx := julius._faixa_minutos(s.horario_funcionamento ->> chaves[dow + 1]);

  if coalesce(s.encerramento_automatico, false) then
    return fx is not null and min_agora >= fx[1] and min_agora < least(fx[2], 1440);
  end if;

  if fx is not null and min_agora >= fx[1] and min_agora < fx[2] then
    return true;
  end if;

  fx := julius._faixa_minutos(s.horario_funcionamento ->> chaves[((dow + 6) % 7) + 1]);
  if fx is not null and fx[2] > 1440 and min_agora < fx[2] - 1440 then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function julius.esta_aberto() to anon, authenticated;

-- ============================================================
-- _entrar_fila: entrada atômica na fila (evita corrida entre 2 clientes
-- entrando ao mesmo tempo). security definer p/ contornar RLS de insert.
-- Função interna — só chamada por julius.chat_pedir_musica, nunca direto
-- pela anon key.
--
-- Regras:
--   1. casa tem que estar aberta (julius.esta_aberto())
--   2. no máx. 1 música ativa (waiting/playing) por perfil_id
-- ============================================================
create or replace function julius._entrar_fila(
  p_nome text,
  p_perfil text,
  p_numero_musica text
) returns julius.queue_entries
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_limite int;
  v_intervalo int;
  v_count_pessoa int;
  v_tail_posicao int;
  v_nova_posicao int;
  v_existente julius.queue_entries;
  v_min int;
  v_row julius.queue_entries;
begin
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'NOME_VAZIO' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_perfil), '') = '' then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  -- trava a fila inteira p/ essa transação: evita duas entradas
  -- concorrentes calculando a mesma posição (ordem de chegada = ordem da fila)
  -- ou as duas pedindo o mesmo número ao mesmo tempo.
  lock table julius.queue_entries in share row exclusive mode;

  if not julius.esta_aberto() then
    raise exception 'CASA_FECHADA' using errcode = 'P0001';
  end if;

  select coalesce(limite_musicas, 1), coalesce(intervalo_repetir_min, 0)
    into v_limite, v_intervalo
  from julius.settings where id = 1;
  v_limite := coalesce(v_limite, 1);
  v_intervalo := coalesce(v_intervalo, 0);

  if exists (
    select 1 from julius.queue_entries
    where perfil_id = p_perfil
      and status in ('waiting', 'playing')
      and numero_musica = p_numero_musica
  ) then
    raise exception 'MUSICA_REPETIDA' using errcode = 'P0001';
  end if;

  -- intervalo pra repetir (o operador, via admin_adicionar_fila, ignora)
  if v_intervalo > 0 and coalesce(current_setting('julius.ignorar_repeticao', true), '') <> 'on' then
    select * into v_existente
    from julius.queue_entries
    where numero_musica = p_numero_musica and status in ('waiting', 'playing')
    order by posicao
    limit 1;

    if v_existente.id is not null then
      -- detail: posição na fila ('0' = está no palco agora)
      raise exception 'MUSICA_NA_FILA' using errcode = 'P0001', detail = case
        when v_existente.status = 'playing' then '0'
        else (
          select (count(*) + 1)::text from julius.queue_entries
          where status in ('waiting', 'playing') and posicao < v_existente.posicao
        )
      end;
    end if;

    -- quanto falta (em min) pra liberar, se foi cantada dentro do intervalo
    select ceil(extract(epoch from (
             coalesce(cantada_em, created_at) + make_interval(mins => v_intervalo) - now()
           )) / 60)::int
      into v_min
    from julius.queue_entries
    where numero_musica = p_numero_musica
      and status = 'done'
      and coalesce(cantada_em, created_at) > now() - make_interval(mins => v_intervalo)
    order by coalesce(cantada_em, created_at) desc
    limit 1;

    if v_min is not null then
      raise exception 'MUSICA_RECENTE' using errcode = 'P0001', detail = greatest(v_min, 1)::text;
    end if;
  end if;

  select count(*) into v_count_pessoa
  from julius.queue_entries
  where perfil_id = p_perfil and status in ('waiting', 'playing');

  if v_count_pessoa >= v_limite then
    raise exception 'LIMITE_MUSICAS' using errcode = 'P0001';
  end if;

  select posicao into v_tail_posicao
  from julius.queue_entries
  where status in ('waiting', 'playing')
  order by posicao desc
  limit 1;

  v_nova_posicao := coalesce(v_tail_posicao, 0) + 1;

  insert into julius.queue_entries (nome, perfil_id, numero_musica, status, posicao)
  values (btrim(p_nome), p_perfil, p_numero_musica, 'waiting', v_nova_posicao)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function julius._entrar_fila(text, text, text) from public, anon, authenticated;

-- ============================================================
-- limpeza: conversa sem mensagem nova há 24h é apagada (cascade em
-- chat_mensagens). Não mexe em queue_entries — histórico/estatística da
-- fila continua intacto, só a conversa some. Sem cron: roda de graça toda
-- vez que alguém abre um chat (ver chat_iniciar).
-- ============================================================
create or replace function julius._limpar_conversas_antigas()
returns void
language sql
security definer
set search_path = julius
as $$
  delete from julius.conversas where ultima_msg_em < now() - interval '24 hours';
$$;

revoke execute on function julius._limpar_conversas_antigas() from public, anon, authenticated;

-- ============================================================
-- chat_iniciar: 1ª mensagem — cria (ou resincroniza) a conversa do perfil.
-- ============================================================
create or replace function julius.chat_iniciar(
  p_perfil text,
  p_chave text,
  p_nome text
) returns void
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_existing julius.conversas;
begin
  perform julius._limpar_conversas_antigas();

  if coalesce(btrim(p_perfil), '') = '' or coalesce(btrim(p_chave), '') = '' then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;
  if char_length(v_nome) < 1 or char_length(v_nome) > 24 then
    raise exception 'NOME_INVALIDO' using errcode = 'P0001';
  end if;

  select * into v_existing from julius.conversas where perfil_id = p_perfil;

  if v_existing.perfil_id is null then
    insert into julius.conversas (perfil_id, chave, nome)
    values (p_perfil, p_chave, v_nome);

    insert into julius.chat_mensagens (perfil_id, autor, texto)
    values (p_perfil, 'sistema', 'Oi, ' || v_nome || '! Manda o número da música que você quer cantar 🎤');
  elsif v_existing.chave <> p_chave then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  elsif v_existing.nome <> v_nome then
    update julius.conversas set nome = v_nome where perfil_id = p_perfil;
  end if;
end;
$$;

grant execute on function julius.chat_iniciar(text, text, text) to anon;

-- ============================================================
-- chat_mensagens_cliente: transcrição da própria conversa (refetch após
-- ping de realtime em `conversas`).
-- ============================================================
create or replace function julius.chat_mensagens_cliente(
  p_perfil text,
  p_chave text
) returns setof julius.chat_mensagens
language plpgsql
security definer
set search_path = julius
as $$
begin
  if not exists (
    select 1 from julius.conversas where perfil_id = p_perfil and chave = p_chave
  ) then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  return query
    select * from julius.chat_mensagens
    where perfil_id = p_perfil
    order by created_at asc
    limit 200;
end;
$$;

grant execute on function julius.chat_mensagens_cliente(text, text) to anon;

-- ============================================================
-- chat_pedir_musica: única forma do cliente pedir música — grava a
-- mensagem dele (sempre um número, checado pelo constraint da tabela),
-- tenta entrar na fila e responde com uma mensagem do sistema (sucesso
-- ou o motivo do erro). Anti-spam de 3s entre mensagens do cliente.
-- ============================================================
create or replace function julius.chat_pedir_musica(
  p_perfil text,
  p_chave text,
  p_numero text
) returns julius.chat_mensagens
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_conv julius.conversas;
  v_numero text := btrim(coalesce(p_numero, ''));
  v_ultima timestamptz;
  v_limite int;
  v_detalhe text;
  v_row julius.queue_entries;
  v_rank int;
  v_resposta julius.chat_mensagens;
begin
  select * into v_conv from julius.conversas where perfil_id = p_perfil;
  if v_conv.perfil_id is null or v_conv.chave <> p_chave then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  if v_numero !~ '^[0-9]{1,5}$' then
    raise exception 'NUMERO_INVALIDO' using errcode = 'P0001';
  end if;

  select max(created_at) into v_ultima
  from julius.chat_mensagens
  where perfil_id = p_perfil and autor = 'cliente';

  if v_ultima is not null and v_ultima > now() - interval '3 seconds' then
    raise exception 'DEVAGAR' using errcode = 'P0001';
  end if;

  perform julius.encerrar_fila_vencida();

  select coalesce(limite_musicas, 1) into v_limite from julius.settings where id = 1;
  v_limite := coalesce(v_limite, 1);

  insert into julius.chat_mensagens (perfil_id, autor, texto)
  values (p_perfil, 'cliente', v_numero);

  begin
    v_row := julius._entrar_fila(v_conv.nome, p_perfil, v_numero);

    select count(*) + 1 into v_rank
    from julius.queue_entries
    where status in ('waiting', 'playing') and posicao < v_row.posicao;

    insert into julius.chat_mensagens (perfil_id, autor, texto, queue_entry_id)
    values (p_perfil, 'sistema', 'Nº ' || v_numero || ' na fila — posição ' || v_rank, v_row.id)
    returning * into v_resposta;
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detalhe = pg_exception_detail;

      insert into julius.chat_mensagens (perfil_id, autor, texto)
      values (
        p_perfil,
        'sistema',
        case sqlerrm
          when 'CASA_FECHADA' then 'A casa está fechada agora — tenta de novo no horário de funcionamento.'
          when 'MUSICA_REPETIDA' then 'Essa música você já pediu — ela já está na fila.'
          when 'MUSICA_NA_FILA' then
            case when v_detalhe = '0'
              then 'Essa música está no palco agora. Escolhe outra.'
              else 'Essa música já está na fila (posição ' || coalesce(v_detalhe, '?') || '). Escolhe outra ou espera ela tocar.'
            end
          when 'MUSICA_RECENTE' then
            'Essa música acabou de ser cantada. Dá pra pedir de novo em uns ' || coalesce(v_detalhe, '?') || ' min — ou escolhe outra.'
          when 'LIMITE_MUSICAS' then
            case when v_limite = 1
              then 'Você já tem 1 música na fila. Espera ela terminar pra pedir outra.'
              else 'Você já tem ' || v_limite || ' músicas na fila. Espera uma terminar pra pedir outra.'
            end
          else 'Não deu pra entrar na fila agora. Tenta de novo.'
        end
      )
      returning * into v_resposta;
  end;

  return v_resposta;
end;
$$;

grant execute on function julius.chat_pedir_musica(text, text, text) to anon;

-- ============================================================
-- pedidos do dono da casa (2026-10-02): encerramento à meia-noite, cancelar
-- a própria música, operador inclui quem não tem celular, sugestões.
-- (Detalhes de cada uma em supabase/migrations/20261002_pedidos_do_cliente.sql)
-- ============================================================

create or replace function julius.encerrar_fila_vencida()
returns int
language plpgsql
security definer
set search_path = julius
as $$
declare
  s julius.settings;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio timestamptz := (v_hoje::timestamp) at time zone 'America/Sao_Paulo';
  v_fechadas int := 0;
begin
  -- caminho rápido, sem lock
  select * into s from julius.settings where id = 1;
  if s.id is null
     or not coalesce(s.encerramento_automatico, false)
     or coalesce(s.ultimo_encerramento >= v_hoje, false) then
    return 0;
  end if;

  select * into s from julius.settings where id = 1 for update;
  if coalesce(s.ultimo_encerramento >= v_hoje, false) then
    return 0;
  end if;

  -- o trigger de status não manda "valeu, pede a próxima" pra quem foi
  -- encerrado em lote (a fila acabou de fechar)
  perform set_config('julius.encerrando', 'on', true);

  update julius.queue_entries
     set status = 'done'
   where status = 'playing' and created_at < v_inicio;

  update julius.queue_entries
     set status = 'cancelled'
   where status = 'waiting' and created_at < v_inicio;
  get diagnostics v_fechadas = row_count;

  if now() < v_inicio + interval '6 hours' then
    insert into julius.chat_mensagens (perfil_id, autor, texto)
    select perfil_id, 'sistema', 'Valeu por cantar com a gente! A fila encerrou à meia-noite. Até a próxima 🎤'
      from julius.conversas
     where ultima_msg_em < v_inicio
       and ultima_msg_em >= v_inicio - interval '1 day';
  end if;

  perform set_config('julius.encerrando', 'off', true);

  update julius.settings set ultimo_encerramento = v_hoje where id = 1;
  return v_fechadas;
end;
$$;

grant execute on function julius.encerrar_fila_vencida() to anon, authenticated;

create or replace function julius.chat_cancelar_musica(
  p_perfil text,
  p_chave text,
  p_entrada uuid
) returns julius.chat_mensagens
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_conv julius.conversas;
  v_entrada julius.queue_entries;
  v_resposta julius.chat_mensagens;
begin
  select * into v_conv from julius.conversas where perfil_id = p_perfil;
  if v_conv.perfil_id is null or v_conv.chave <> p_chave then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  select * into v_entrada
  from julius.queue_entries
  where id = p_entrada and perfil_id = p_perfil
  for update;

  if v_entrada.id is null then
    raise exception 'ENTRADA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;
  if v_entrada.status <> 'waiting' then
    raise exception 'NAO_PODE_CANCELAR' using errcode = 'P0001';
  end if;

  update julius.queue_entries set status = 'cancelled' where id = v_entrada.id;

  insert into julius.chat_mensagens (perfil_id, autor, texto)
  values (p_perfil, 'sistema', 'Nº ' || v_entrada.numero_musica || ' saiu da fila. Manda o número certo quando quiser 🎶')
  returning * into v_resposta;

  return v_resposta;
end;
$$;

grant execute on function julius.chat_cancelar_musica(text, text, uuid) to anon;

create or replace function julius.admin_adicionar_fila(
  p_nome text,
  p_numero text
) returns julius.queue_entries
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_numero text := btrim(coalesce(p_numero, ''));
begin
  if auth.role() <> 'authenticated' then
    raise exception 'NAO_AUTORIZADO' using errcode = 'P0001';
  end if;
  if char_length(v_nome) < 1 or char_length(v_nome) > 24 then
    raise exception 'NOME_INVALIDO' using errcode = 'P0001';
  end if;
  if v_numero !~ '^[0-9]{1,5}$' then
    raise exception 'NUMERO_INVALIDO' using errcode = 'P0001';
  end if;

  perform julius.encerrar_fila_vencida();

  -- só vale nesta transação; quem decide repetir (dueto, pedido especial) é o
  -- operador, então ele não esbarra no intervalo
  perform set_config('julius.ignorar_repeticao', 'on', true);

  -- perfil próprio por inclusão: sem celular não tem identidade pra amarrar,
  -- então cada inclusão manual é uma "pessoa" nova (limite por pessoa não vale).
  return julius._entrar_fila(v_nome, 'manual-' || gen_random_uuid()::text, v_numero);
end;
$$;

revoke execute on function julius.admin_adicionar_fila(text, text) from public, anon;

-- Cardápio + busca. Sem texto: o catálogo inteiro, em ordem alfabética (por música
-- ou por cantor), paginado com p_limite/p_offset — caminho rápido, direto pelos
-- índices (sem ordenar nem contar o catálogo todo a cada página). Com texto: número
-- digitado casa pelo começo; texto casa se TODAS as palavras aparecem em título ou
-- cantor (em qualquer ordem), e o filtro de texto só vale a partir de 2 caracteres.
-- Resultado do filtro: número exato, começa com o que foi digitado, depois a ordem
-- pedida. `total` = quantas músicas casam (sem contar a paginação).
drop function if exists julius.buscar_musicas(text, text, int);
drop function if exists julius.buscar_musicas(text, text, int, int, text);

create or replace function julius.buscar_musicas(
  p_q text default '',
  p_categoria text default null,
  p_limite int default 50,
  p_offset int default 0,
  p_ordem text default 'titulo'
)
returns table (numero text, titulo text, artista text, categoria text, destaque boolean, total bigint)
language plpgsql
stable
security definer
set search_path = julius
as $$
#variable_conflict use_column
declare
  v_txt text := julius._norm(p_q);
  v_palavras text[];
  v_limite int := greatest(1, least(coalesce(p_limite, 50), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total bigint;
begin
  if char_length(v_txt) < 2 then
    v_txt := '';
  end if;

  -- cardápio sem filtro de texto: índice + limit, sem sort
  if v_txt = '' then
    -- o total só é contado na primeira página; nas seguintes vem 0 (o cliente já tem)
    if v_offset = 0 then
      select count(*) into v_total
        from julius.musicas m
       where p_categoria is null or m.categoria = p_categoria;
    else
      v_total := 0;
    end if;

    if p_ordem = 'artista' then
      return query
        select m.numero, m.titulo, m.artista, m.categoria, m.destaque, v_total
          from julius.musicas m
         where p_categoria is null or m.categoria = p_categoria
         order by m.artista_norm, m.titulo_norm, m.numero
         limit v_limite offset v_offset;
    else
      return query
        select m.numero, m.titulo, m.artista, m.categoria, m.destaque, v_total
          from julius.musicas m
         where p_categoria is null or m.categoria = p_categoria
         order by m.titulo_norm, m.numero
         limit v_limite offset v_offset;
    end if;
    return;
  end if;

  -- palavra longa perde o "s" do plural: "evidencias" acha "Evidência"
  v_palavras := array(
    select case when char_length(w) >= 5 then regexp_replace(w, 's$', '') else w end
      from unnest(string_to_array(v_txt, ' ')) w
     where w <> ''
  );

  return query
    with achadas as (
      select m.*
        from julius.musicas m
       where (p_categoria is null or m.categoria = p_categoria)
         and (
           m.numero like v_txt || '%'
           or not exists (
             select 1 from unnest(v_palavras) w where m.busca not like '%' || w || '%'
           )
         )
    )
    select a.numero, a.titulo, a.artista, a.categoria, a.destaque, count(*) over ()
      from achadas a
     order by (a.numero = v_txt) desc,
              (a.busca like v_txt || '%') desc,
              case when p_ordem = 'artista' then a.artista_norm end,
              a.titulo_norm,
              a.numero
     limit v_limite offset v_offset;
end;
$$;

grant execute on function julius.buscar_musicas(text, text, int, int, text) to anon, authenticated;

-- sugestões: mais cantadas (contagem automática) + destaques
create or replace function julius.musicas_sugeridas(p_limite int default 8)
returns table (numero text, titulo text, artista text, vezes int, destaque boolean)
language sql
stable
security definer
set search_path = julius
as $$
  with q as (
    select numero_musica as numero, count(*)::int as vezes
      from julius.queue_entries
     where status in ('playing', 'done')
     group by numero_musica
  ), base as (
    select q.numero, q.vezes from q
    union all
    select m.numero, 0
      from julius.musicas m
     where m.destaque and not exists (select 1 from q where q.numero = m.numero)
  )
  select b.numero, m.titulo, m.artista, b.vezes, coalesce(m.destaque, false) as destaque
    from base b
    left join julius.musicas m on m.numero = b.numero
   order by b.vezes desc, m.titulo nulls last, b.numero
   limit greatest(1, least(coalesce(p_limite, 8), 100));
$$;

grant execute on function julius.musicas_sugeridas(int) to anon, authenticated;

-- ============================================================
-- triggers: mensagens automáticas
-- ============================================================

-- toda mensagem nova atualiza o resumo da conversa (pra ordenar o inbox
-- do admin) e soma +1 na badge de não lidas quando quem manda é o cliente.
create or replace function julius._chat_msg_after_insert()
returns trigger
language plpgsql
security definer
set search_path = julius
as $$
begin
  update julius.conversas
     set ultima_msg_em = new.created_at,
         ultima_msg_texto = new.texto,
         nao_lidas_admin = nao_lidas_admin + case when new.autor = 'cliente' then 1 else 0 end
   where perfil_id = new.perfil_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_msg_after_insert on julius.chat_mensagens;
create trigger trg_chat_msg_after_insert
  after insert on julius.chat_mensagens
  for each row execute function julius._chat_msg_after_insert();

-- "Chamar" (-> playing) avisa quem foi chamado + quem é o próximo.
-- "Concluir" (playing -> done) avisa que pode mandar a próxima.
create or replace function julius._queue_status_after_update()
returns trigger
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_prox julius.queue_entries;
begin
  if new.status = old.status then
    return new;
  end if;

  -- só a coluna cantada_em muda: o trigger é "after update of status", então
  -- esse update não dispara ele de novo
  if new.status = 'done' then
    update julius.queue_entries set cantada_em = now() where id = new.id;
  end if;

  if current_setting('julius.encerrando', true) = 'on' then
    return new;
  end if;

  if new.status = 'playing' then
    if exists (select 1 from julius.conversas where perfil_id = new.perfil_id) then
      insert into julius.chat_mensagens (perfil_id, autor, texto, queue_entry_id)
      values (new.perfil_id, 'sistema', 'É a sua vez! Nº ' || new.numero_musica || ' — sobe no palco 🎤', new.id);
    end if;

    select * into v_prox
    from julius.queue_entries
    where status = 'waiting'
    order by posicao asc
    limit 1;

    if v_prox.id is not null and exists (select 1 from julius.conversas where perfil_id = v_prox.perfil_id) then
      insert into julius.chat_mensagens (perfil_id, autor, texto, queue_entry_id)
      values (v_prox.perfil_id, 'sistema', 'Se prepara: você é o próximo, Nº ' || v_prox.numero_musica || ' 👀', v_prox.id);
    end if;
  elsif new.status = 'done' and old.status = 'playing' then
    if exists (select 1 from julius.conversas where perfil_id = new.perfil_id) then
      insert into julius.chat_mensagens (perfil_id, autor, texto, queue_entry_id)
      values (new.perfil_id, 'sistema', 'Valeu por cantar! Quando quiser, manda o número da próxima 🎶', new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_queue_status_after_update on julius.queue_entries;
create trigger trg_queue_status_after_update
  after update of status on julius.queue_entries
  for each row execute function julius._queue_status_after_update();

-- realtime — queue_entries publica só as colunas públicas (telefone fica fora do stream)
alter publication supabase_realtime add table julius.queue_entries
  (id, nome, perfil_id, numero_musica, status, posicao, created_at);
alter publication supabase_realtime add table julius.settings;
alter publication supabase_realtime add table julius.conversas (perfil_id, ultima_msg_em);
alter publication supabase_realtime add table julius.chat_mensagens;

-- ============================================================
-- admin: apagar fila + chat de verdade (produção). RLS não deixa DELETE em
-- `conversas` direto (só select/update) — função security definer resolve.
--
-- Exige a app_metadata claim "role: admin" (não basta authenticated —
-- Postgres compartilhado com outros projetos, ver comentário na migration
-- 20260929_admin_limpar_dados.sql sobre como marcar o usuário admin).
-- ============================================================
create or replace function julius.admin_limpar_dados()
returns void
language plpgsql
security definer
set search_path = julius
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'NAO_AUTORIZADO' using errcode = 'P0001';
  end if;

  delete from julius.chat_mensagens where true;
  delete from julius.conversas where true;
  delete from julius.queue_entries where true;
end;
$$;

revoke execute on function julius.admin_limpar_dados() from public, anon;
grant execute on function julius.admin_limpar_dados() to authenticated;

-- reinicia só os chats (conversas + mensagens), sem mexer na fila
create or replace function julius.admin_reiniciar_chats()
returns void
language plpgsql
security definer
set search_path = julius
as $$
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'NAO_AUTORIZADO' using errcode = 'P0001';
  end if;

  delete from julius.chat_mensagens where true;
  delete from julius.conversas where true;
end;
$$;

revoke execute on function julius.admin_reiniciar_chats() from public, anon;
grant execute on function julius.admin_reiniciar_chats() to authenticated;
