-- Juliu's — pedidos do dono da casa (2026-10-02).
--
--  * encerramento automático da fila à meia-noite + mensagem de agradecimento
--  * limite de músicas por pessoa configurável (padrão 1; o dono pode subir)
--  * sem repetir a mesma música na fila da mesma pessoa
--  * pessoa cancela a própria música (errou o número) e entra de novo
--  * operador inclui na fila quem não tem celular
--  * sugestões: mais cantadas (contagem automática) + títulos cadastrados
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, num banco que já tem
-- o schema.sql/migrations anteriores. Pra instalação do zero, use
-- `supabase/schema.sql` direto — já está com tudo isso. Pode rodar de novo:
-- é idempotente.

set search_path = julius;

-- 1. settings -----------------------------------------------------------
alter table julius.settings
  add column if not exists encerramento_automatico boolean not null default true,
  add column if not exists limite_musicas int not null default 1,
  add column if not exists ultimo_encerramento date;

alter table julius.settings drop constraint if exists settings_limite_musicas_check;
alter table julius.settings
  add constraint settings_limite_musicas_check check (limite_musicas between 1 and 3);

-- 2. status 'cancelled' (música tirada da fila sem ter sido cantada) -------
-- derruba qualquer check que olhe a coluna status (o nome varia conforme a
-- versão do schema que criou a tabela) e recria com o valor novo
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'julius.queue_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table julius.queue_entries drop constraint %I', c.conname);
  end loop;
end $$;

alter table julius.queue_entries
  add constraint queue_entries_status_check
  check (status in ('waiting', 'playing', 'done', 'cancelled'));

-- 3. musicas: título por número (sugestões) -----------------------------
create table if not exists julius.musicas (
  numero text primary key check (numero ~ '^[0-9]{1,5}$'),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  created_at timestamptz not null default now()
);

alter table julius.musicas enable row level security;

revoke insert, update, delete on julius.musicas from anon;

drop policy if exists "musicas_select_public" on julius.musicas;
create policy "musicas_select_public" on julius.musicas
  for select using (true);

drop policy if exists "musicas_write_admin" on julius.musicas;
create policy "musicas_write_admin" on julius.musicas
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. esta_aberto: com encerramento automático ligado a faixa do dia vale só
--    até 24h, e a madrugada da faixa de ontem não conta.
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

-- 5. _entrar_fila: limite configurável + sem repetir número ----------------
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

  -- trava a fila inteira p/ essa transação: evita duas entradas
  -- concorrentes calculando a mesma posição (ordem de chegada = ordem da fila).
  lock table julius.queue_entries in share row exclusive mode;

  if not julius.esta_aberto() then
    raise exception 'CASA_FECHADA' using errcode = 'P0001';
  end if;

  select coalesce(limite_musicas, 1) into v_limite from julius.settings where id = 1;
  v_limite := coalesce(v_limite, 1);

  if exists (
    select 1 from julius.queue_entries
    where perfil_id = p_perfil
      and status in ('waiting', 'playing')
      and numero_musica = p_numero_musica
  ) then
    raise exception 'MUSICA_REPETIDA' using errcode = 'P0001';
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

-- 6. encerramento automático à meia-noite -----------------------------------
-- Sem cron: roda de graça quando alguém (cliente, painel) chama — idempotente,
-- no máx. 1 execução por dia (settings.ultimo_encerramento). Ao virar o dia:
--   * quem estava no palco vira 'done'; quem esperava vira 'cancelled'
--     (não cantou — fora do ranking de mais cantadas e das estatísticas)
--   * quem conversou ontem recebe a mensagem de agradecimento (só se a virada
--     foi há menos de 6h — se ninguém chamou até a noite seguinte, limpa em
--     silêncio em vez de mandar "valeu" fora de hora)
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

-- 6b. trigger de status: ignora quem foi encerrado em lote (ver acima) -----
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

-- 7. chat_pedir_musica: encerra o dia vencido antes, mensagens por motivo ---
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
      insert into julius.chat_mensagens (perfil_id, autor, texto)
      values (
        p_perfil,
        'sistema',
        case sqlerrm
          when 'CASA_FECHADA' then 'A casa está fechada agora — tenta de novo no horário de funcionamento.'
          when 'MUSICA_REPETIDA' then 'Essa música você já pediu — ela já está na fila.'
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

-- 8. cancelar a própria música (errou o número): sai da fila, entra de novo
--    pelo chat — vai pro fim, como qualquer pedido novo.
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

-- 9. operador inclui na fila quem não tem celular --------------------------
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

  -- perfil próprio por inclusão: sem celular não tem identidade pra amarrar,
  -- então cada inclusão manual é uma "pessoa" nova (limite por pessoa não vale).
  return julius._entrar_fila(v_nome, 'manual-' || gen_random_uuid()::text, v_numero);
end;
$$;

revoke execute on function julius.admin_adicionar_fila(text, text) from public, anon;
grant execute on function julius.admin_adicionar_fila(text, text) to authenticated;

-- 10. sugestões: mais cantadas (contagem automática) + títulos cadastrados --
-- Conta só o que foi pro palco (playing/done). Músicas com título cadastrado
-- mas ainda nunca cantadas entram no fim da lista (vezes = 0).
create or replace function julius.musicas_sugeridas(p_limite int default 8)
returns table (numero text, titulo text, vezes int)
language sql
stable
security definer
set search_path = julius
as $$
  select coalesce(q.numero, m.numero) as numero,
         m.titulo,
         coalesce(q.vezes, 0)::int as vezes
    from (
      select numero_musica as numero, count(*) as vezes
        from julius.queue_entries
       where status in ('playing', 'done')
       group by numero_musica
    ) q
    full join julius.musicas m on m.numero = q.numero
   order by coalesce(q.vezes, 0) desc, m.titulo nulls last, coalesce(q.numero, m.numero)
   limit greatest(1, least(coalesce(p_limite, 8), 100));
$$;

grant execute on function julius.musicas_sugeridas(int) to anon, authenticated;
