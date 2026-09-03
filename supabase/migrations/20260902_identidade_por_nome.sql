-- Juliu's — a identidade na fila deixa de ser telefone.
--
-- Agora cada navegador tem um "perfil" (perfil_id: uuid gerado no cliente,
-- guardado no localStorage) + um nome de exibição (ou nome da dupla).
-- O limite de 2 músicas e a regra de não-consecutivo passam a valer por
-- perfil_id — não por nome (evita que homônimos dividam o mesmo limite).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.

set search_path = julius;

-- 1. coluna nova ------------------------------------------------------
alter table julius.queue_entries add column if not exists perfil_id text;

-- registros antigos: cada um vira seu próprio perfil (histórico)
update julius.queue_entries
set perfil_id = gen_random_uuid()::text
where perfil_id is null;

alter table julius.queue_entries alter column perfil_id set not null;

-- 2. índices --------------------------------------------------------
drop index if exists julius.idx_queue_telefone;
create index if not exists idx_queue_perfil on julius.queue_entries (perfil_id);

-- 3. remove telefone ------------------------------------------------
alter table julius.queue_entries drop column if exists telefone;

-- 4. função join_queue: por perfil_id ------------------------------
drop function if exists julius.join_queue(text, text, text);

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

  -- limite: 2 músicas ativas (waiting/playing) por perfil
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

grant execute on function julius.join_queue(text, text, text) to anon, authenticated;
