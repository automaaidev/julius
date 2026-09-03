-- Juliu's — a casa abre e fecha sozinha pelo horário de funcionamento.
--
-- Antes: settings.status_aberto (booleano) era ligado/desligado na mão.
-- Agora: settings.abertura_modo controla a política:
--   'auto'    -> segue horario_funcionamento (padrão)
--   'aberto'  -> força aberto, ignora horário
--   'fechado' -> força fechado, ignora horário
--
-- O estado efetivo é calculado por julius.esta_aberto() — usado tanto pelo
-- site (via RPC, opcional) quanto pelo join_queue (fonte da verdade).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.

set search_path = julius;

-- 1. coluna nova --------------------------------------------------------
alter table julius.settings
  add column if not exists abertura_modo text not null default 'auto';

alter table julius.settings
  drop constraint if exists settings_abertura_modo_check;
alter table julius.settings
  add constraint settings_abertura_modo_check
  check (abertura_modo in ('auto', 'aberto', 'fechado'));

-- registros existentes passam a seguir o horário
update julius.settings set abertura_modo = 'auto';

-- status_aberto vira legado (mantido pra rollback; nada mais lê)
alter table julius.settings alter column status_aberto drop not null;

-- 2. helper: "19:00-01:00" -> {1140, 1500} (minutos; fecha > 1440 = vira o dia)
create or replace function julius._faixa_minutos(faixa text)
returns int[]
language plpgsql
immutable
as $$
declare
  ini text;
  fim text;
  a int;
  f int;
begin
  if faixa is null or faixa = 'fechado' or position('-' in faixa) = 0 then
    return null;
  end if;
  ini := split_part(faixa, '-', 1);
  fim := split_part(faixa, '-', 2);
  a := split_part(ini, ':', 1)::int * 60 + coalesce(nullif(split_part(ini, ':', 2), ''), '0')::int;
  f := split_part(fim, ':', 1)::int * 60 + coalesce(nullif(split_part(fim, ':', 2), ''), '0')::int;
  if f <= a then
    f := f + 1440;
  end if;
  return array[a, f];
exception
  when others then return null;
end;
$$;

-- 3. estado efetivo da casa AGORA (fuso America/Sao_Paulo)
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

  dow := extract(dow from hora_local)::int;                        -- 0=dom .. 6=sab
  min_agora := extract(hour from hora_local)::int * 60
             + extract(minute from hora_local)::int;

  -- faixa de hoje
  fx := julius._faixa_minutos(s.horario_funcionamento ->> chaves[dow + 1]);
  if fx is not null and min_agora >= fx[1] and min_agora < fx[2] then
    return true;
  end if;

  -- faixa de ontem que passou da meia-noite (ex: sex 19:00-01:00)
  fx := julius._faixa_minutos(s.horario_funcionamento ->> chaves[((dow + 6) % 7) + 1]);
  if fx is not null and fx[2] > 1440 and min_agora < fx[2] - 1440 then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function julius.esta_aberto() to anon, authenticated;

-- 4. join_queue passa a consultar esta_aberto() -----------------------
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

  lock table julius.queue_entries in share row exclusive mode;

  if not julius.esta_aberto() then
    raise exception 'CASA_FECHADA' using errcode = 'P0001';
  end if;

  select count(*) into v_count_pessoa
  from julius.queue_entries
  where perfil_id = p_perfil and status in ('waiting', 'playing');

  if v_count_pessoa >= 2 then
    raise exception 'LIMITE_2_MUSICAS' using errcode = 'P0001';
  end if;

  select posicao, perfil_id into v_tail_posicao, v_tail_perfil
  from julius.queue_entries
  where status in ('waiting', 'playing')
  order by posicao desc
  limit 1;

  if v_tail_posicao is null then
    v_nova_posicao := 1;
  else
    select count(*) into v_outros_ativos
    from julius.queue_entries
    where status in ('waiting', 'playing') and perfil_id <> p_perfil;

    if v_tail_perfil = p_perfil and v_outros_ativos > 0 then
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
