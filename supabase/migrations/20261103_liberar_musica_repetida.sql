-- Juliu's — quando uma música repetida libera pra outra pessoa (2026-11-03).
--
-- Pedido do dono: se o João pediu a música A, o Pedro só pede a mesma A
-- depois que o João cantar. Enquanto ela está na fila ou no palco, ninguém
-- pede de novo. O admin escolhe (aba Casa → Regras da fila) quando ela libera
-- depois de cantada, em settings.repetir_modo:
--   'livre'        sem regra: qualquer pessoa pede qualquer número, a qualquer hora
--   'ao_terminar'  libera assim que a música é cantada
--   'tempo'        libera N min depois de cantada (intervalo_repetir_min)
--   'musicas'      libera depois de mais N músicas cantadas (intervalo_repetir_musicas)
--
-- Antes só existia o intervalo em minutos, e 0 desligava tudo: não dava pra
-- barrar a música só enquanto ela está na fila. Quem estava com 0 vira
-- 'livre', o resto vira 'tempo' (nada muda até o admin escolher outra opção).
--
-- Continuam iguais: "a mesma pessoa não repete o mesmo número" (MUSICA_REPETIDA)
-- e o operador passando por cima da regra (admin_adicionar_fila, ex: dueto).
--
-- Segurança, de carona: chat_pedir_musica e chat_cancelar_musica aceitavam chave
-- null (`chave <> null` dá null e o if deixava passar), então qualquer um pedia ou
-- cancelava música em nome de outro perfil. Agora conferem com `is distinct from`.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois de
-- 20261003_intervalo_repetir_musica.sql. Pode rodar de novo: é idempotente.

set search_path = julius;

-- 1. colunas -----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'julius' and table_name = 'settings' and column_name = 'repetir_modo'
  ) then
    alter table julius.settings add column repetir_modo text not null default 'tempo';
    -- só na 1ª execução: intervalo 0 desligava a regra inteira, continua desligada
    update julius.settings set repetir_modo = 'livre' where intervalo_repetir_min = 0;
  end if;
end;
$$;

alter table julius.settings drop constraint if exists settings_repetir_modo_check;
alter table julius.settings
  add constraint settings_repetir_modo_check check (repetir_modo in ('livre', 'ao_terminar', 'tempo', 'musicas'));

alter table julius.settings
  add column if not exists intervalo_repetir_musicas int not null default 5;

alter table julius.settings drop constraint if exists settings_intervalo_repetir_musicas_check;
alter table julius.settings
  add constraint settings_intervalo_repetir_musicas_check check (intervalo_repetir_musicas between 1 and 50);

-- 'musicas' conta o que foi cantado depois de um horário: vai direto por aqui
create index if not exists idx_queue_cantada on julius.queue_entries (cantada_em) where status = 'done';

-- 2. _entrar_fila: escolhe quando a música repetida libera ----------------------
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
  v_modo text;
  v_intervalo int;
  v_musicas int;
  v_count_pessoa int;
  v_tail_posicao int;
  v_nova_posicao int;
  v_existente julius.queue_entries;
  v_min int;
  v_cantada_em timestamptz;
  v_depois int;
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

  select limite_musicas, repetir_modo, intervalo_repetir_min, intervalo_repetir_musicas
    into v_limite, v_modo, v_intervalo, v_musicas
  from julius.settings where id = 1;
  v_limite := coalesce(v_limite, 1);
  v_modo := coalesce(v_modo, 'livre');
  v_intervalo := coalesce(v_intervalo, 0);
  v_musicas := coalesce(v_musicas, 5);

  if exists (
    select 1 from julius.queue_entries
    where perfil_id = p_perfil
      and status in ('waiting', 'playing')
      and numero_musica = p_numero_musica
  ) then
    raise exception 'MUSICA_REPETIDA' using errcode = 'P0001';
  end if;

  -- música repetida (o operador, via admin_adicionar_fila, ignora)
  if v_modo <> 'livre' and coalesce(current_setting('julius.ignorar_repeticao', true), '') <> 'on' then
    -- na fila ou no palco: espera ser cantada
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

    -- já cantada: 'ao_terminar' libera na hora; 'tempo' e 'musicas' esperam mais
    if v_modo = 'tempo' and v_intervalo > 0 then
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
    elsif v_modo = 'musicas' then
      -- última vez que foi cantada nesta noite (12 h pra trás: o que sobrou do
      -- fim da noite de ontem não segura a música hoje)
      select max(cantada_em) into v_cantada_em
      from julius.queue_entries
      where numero_musica = p_numero_musica
        and status = 'done'
        and cantada_em > now() - interval '12 hours';

      if v_cantada_em is not null then
        select count(*) into v_depois
        from julius.queue_entries
        where status = 'done' and cantada_em > v_cantada_em;

        if v_depois < v_musicas then
          -- detail: quantas músicas ainda faltam
          raise exception 'MUSICA_RECENTE_MUSICAS' using errcode = 'P0001', detail = (v_musicas - v_depois)::text;
        end if;
      end if;
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

-- 3. chat_pedir_musica: mensagem do modo 'musicas' + chave conferida sem brecha pra null
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
  -- is distinct from: com `<>`, p_chave nulo dava null e o if deixava passar
  -- (qualquer um agia pelo perfil de outro, que a anon key enxerga na fila)
  if v_conv.perfil_id is null or v_conv.chave is distinct from p_chave then
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
          when 'MUSICA_RECENTE_MUSICAS' then
            case when v_detalhe = '1'
              then 'Essa música acabou de ser cantada. Dá pra pedir de novo depois da próxima música — ou escolhe outra.'
              else 'Essa música acabou de ser cantada. Dá pra pedir de novo depois de mais ' || coalesce(v_detalhe, '?') || ' músicas — ou escolhe outra.'
            end
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

-- 4. chat_cancelar_musica: chave conferida sem brecha pra null -----------------------
-- (antes: chave null passava e qualquer um tirava da fila a música de outra pessoa)
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
  -- is distinct from: com `<>`, p_chave nulo dava null e o if deixava passar
  -- (qualquer um agia pelo perfil de outro, que a anon key enxerga na fila)
  if v_conv.perfil_id is null or v_conv.chave is distinct from p_chave then
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
