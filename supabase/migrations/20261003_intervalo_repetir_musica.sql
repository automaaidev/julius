-- Juliu's — intervalo pra repetir música (2026-10-03).
--
-- Evita que o mesmo número entre em sequência na fila: com o intervalo ligado
-- (settings.intervalo_repetir_min > 0; o admin escolhe o valor na aba Casa →
-- Regras da fila), ninguém pede uma música que
--   * já está na fila ou no palco (de qualquer pessoa), nem
--   * foi cantada há menos de N minutos.
-- 0 desliga as duas regras. A regra "mesma pessoa não repete o mesmo número"
-- (MUSICA_REPETIDA) continua valendo sempre.
--
-- O operador (admin_adicionar_fila) ignora as duas regras: é ele quem decide
-- quando, por exemplo, uma dupla quer cantar junto.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois de
-- 20261002_pedidos_do_cliente.sql. Pode rodar de novo: é idempotente.

set search_path = julius;

-- 1. colunas -----------------------------------------------------------------
alter table julius.settings
  add column if not exists intervalo_repetir_min int not null default 30;

alter table julius.settings drop constraint if exists settings_intervalo_repetir_min_check;
alter table julius.settings
  add constraint settings_intervalo_repetir_min_check check (intervalo_repetir_min between 0 and 720);

-- quando a música foi cantada (virou 'done'). Interno: anon não enxerga (as
-- colunas liberadas pra anon são listadas uma a uma no schema.sql).
alter table julius.queue_entries
  add column if not exists cantada_em timestamptz;

-- 2. trigger de status: carimba cantada_em ------------------------------------
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

-- 3. _entrar_fila: intervalo pra repetir música ---------------------------------
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

-- 4. chat_pedir_musica: mensagens dos dois motivos novos ---------------------------
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

-- 5. admin_adicionar_fila: operador ignora o intervalo -------------------------------
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
grant execute on function julius.admin_adicionar_fila(text, text) to authenticated;
