-- Juliu's — telefone do cliente pra aviso no WhatsApp.
--
-- O painel manda um WhatsApp pro cliente quando a vez tá chegando
-- ("você é o próximo") ou quando é a vez dele ("sobe no palco").
-- O envio é manual: o link wa.me abre o WhatsApp do admin com o texto pronto.
--
-- telefone NÃO é identidade na fila (isso continua sendo perfil_id).
-- Guardamos só dígitos, formato internacional sem "+": 55 + DDD + número.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.

set search_path = julius;

-- 1. coluna nova ------------------------------------------------------
alter table julius.queue_entries add column if not exists telefone text;

-- 2. telefone é PII: anon (cliente sem login) NÃO pode ler o dos outros.
--    Privilégio por coluna no REST — o painel admin (authenticated) enxerga tudo.
revoke select on julius.queue_entries from anon;
grant select (id, nome, perfil_id, numero_musica, status, posicao, created_at)
  on julius.queue_entries to anon;

-- Realtime: publica só as colunas públicas (Postgres 15+), telefone fica fora
-- do stream de mudanças que chega no navegador do cliente.
alter publication supabase_realtime drop table julius.queue_entries;
alter publication supabase_realtime add table julius.queue_entries
  (id, nome, perfil_id, numero_musica, status, posicao, created_at);

-- 3. join_queue passa a receber o telefone --------------------------
drop function if exists julius.join_queue(text, text, text);
drop function if exists julius.join_queue(text, text, text, text);

create or replace function julius.join_queue(
  p_nome text,
  p_perfil text,
  p_numero_musica text,
  p_telefone text
) returns julius.queue_entries
language plpgsql
security definer
set search_path = julius
as $$
declare
  v_tel text;
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

  -- só dígitos; exige 55 + DDD (2) + número (8 ou 9)
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) not between 12 and 13 then
    raise exception 'TELEFONE_INVALIDO' using errcode = 'P0001';
  end if;

  -- trava a fila inteira p/ essa transação: evita duas entradas
  -- concorrentes calculando a mesma posição.
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

  insert into julius.queue_entries (nome, perfil_id, telefone, numero_musica, status, posicao)
  values (btrim(p_nome), p_perfil, v_tel, p_numero_musica, 'waiting', v_nova_posicao)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function julius.join_queue(text, text, text, text) to anon, authenticated;
