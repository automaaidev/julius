-- Juliu's — 1 música por vez no palco + chat do sistema (substitui o aviso
-- manual por WhatsApp). Cada perfil passa a ter só 1 música ativa na fila.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, num banco que já
-- tem o schema.sql antigo (com `telefone` e `join_queue`) ou uma versão
-- anterior deste mesmo arquivo — pode rodar de novo. Pra instalação do zero,
-- use `supabase/schema.sql` direto — já está com tudo isso.

set search_path = julius;

-- 1. normaliza a fila antes de travar "1 no palco": se por acaso tem mais
--    de uma entrada 'playing' (o app antigo não impedia isso), mantém só a
--    de menor posição e volta o resto pra 'waiting'.
update julius.queue_entries
   set status = 'waiting'
 where status = 'playing'
   and posicao <> (
     select min(posicao) from julius.queue_entries where status = 'playing'
   );

create unique index if not exists uq_queue_um_no_palco
  on julius.queue_entries ((true))
  where status = 'playing';

-- 2. conversas + chat_mensagens -----------------------------------------
create table if not exists julius.conversas (
  perfil_id text primary key,
  chave text not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 24),
  ultima_msg_em timestamptz,
  ultima_msg_texto text,
  nao_lidas_admin int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists julius.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  perfil_id text not null references julius.conversas (perfil_id) on delete cascade,
  autor text not null check (autor in ('cliente', 'admin', 'sistema')),
  texto text not null check (char_length(texto) between 1 and 500),
  check (autor <> 'cliente' or texto ~ '^[0-9]{1,5}$'),
  queue_entry_id uuid references julius.queue_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_perfil_created on julius.chat_mensagens (perfil_id, created_at);
create index if not exists idx_conversas_ultima_msg on julius.conversas (ultima_msg_em);

alter table julius.conversas enable row level security;
alter table julius.chat_mensagens enable row level security;

drop policy if exists "conversas_select_public" on julius.conversas;
create policy "conversas_select_public" on julius.conversas
  for select using (true);

revoke select, insert, update, delete on julius.conversas from anon;
grant select (perfil_id, ultima_msg_em) on julius.conversas to anon;

drop policy if exists "conversas_update_admin" on julius.conversas;
create policy "conversas_update_admin" on julius.conversas
  for update using (auth.role() = 'authenticated');

revoke all on julius.chat_mensagens from anon;

drop policy if exists "chat_select_admin" on julius.chat_mensagens;
create policy "chat_select_admin" on julius.chat_mensagens
  for select using (auth.role() = 'authenticated');

drop policy if exists "chat_insert_admin" on julius.chat_mensagens;
create policy "chat_insert_admin" on julius.chat_mensagens
  for insert with check (auth.role() = 'authenticated' and autor = 'admin');

drop policy if exists "chat_delete_admin" on julius.chat_mensagens;
create policy "chat_delete_admin" on julius.chat_mensagens
  for delete using (auth.role() = 'authenticated');

-- 3. join_queue sai de cena — o cliente só entra na fila pelo chat -------
drop function if exists julius.join_queue(text, text, text);
drop function if exists julius.join_queue(text, text, text, text);

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
  v_count_pessoa int;
  v_tail_posicao int;
  v_nova_posicao int;
  v_row julius.queue_entries;
begin
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'NOME_VAZIO' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_perfil), '') = '' then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;

  lock table julius.queue_entries in share row exclusive mode;

  if not julius.esta_aberto() then
    raise exception 'CASA_FECHADA' using errcode = 'P0001';
  end if;

  select count(*) into v_count_pessoa
  from julius.queue_entries
  where perfil_id = p_perfil and status in ('waiting','playing');

  if v_count_pessoa >= 1 then
    raise exception 'LIMITE_1_MUSICA' using errcode = 'P0001';
  end if;

  select posicao into v_tail_posicao
  from julius.queue_entries
  where status in ('waiting','playing')
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

-- 4. limpeza automática: conversa sem mensagem nova há 24h é apagada
--    (cascade em chat_mensagens). Não mexe em queue_entries. Sem cron:
--    roda de graça toda vez que alguém abre um chat (ver chat_iniciar).
create or replace function julius._limpar_conversas_antigas()
returns void
language sql
security definer
set search_path = julius
as $$
  delete from julius.conversas where ultima_msg_em < now() - interval '24 hours';
$$;

revoke execute on function julius._limpar_conversas_antigas() from public, anon, authenticated;

-- 5. RPCs do chat ---------------------------------------------------------
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
      insert into julius.chat_mensagens (perfil_id, autor, texto)
      values (
        p_perfil,
        'sistema',
        case sqlerrm
          when 'CASA_FECHADA' then 'A casa está fechada agora — tenta de novo no horário de funcionamento.'
          when 'LIMITE_1_MUSICA' then 'Você já tem 1 música na fila. Espera ela terminar pra pedir outra.'
          else 'Não deu pra entrar na fila agora. Tenta de novo.'
        end
      )
      returning * into v_resposta;
  end;

  return v_resposta;
end;
$$;

grant execute on function julius.chat_pedir_musica(text, text, text) to anon;

-- 6. triggers de mensagem automática --------------------------------------
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

-- 7. realtime --------------------------------------------------------------
-- `add table` dá erro se a tabela já está na publicação (banco que já rodou uma
-- versão anterior deste arquivo) — confere antes, pra poder rodar de novo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'julius' and tablename = 'conversas'
  ) then
    alter publication supabase_realtime add table julius.conversas (perfil_id, ultima_msg_em);
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'julius' and tablename = 'chat_mensagens'
  ) then
    alter publication supabase_realtime add table julius.chat_mensagens;
  end if;
end $$;
