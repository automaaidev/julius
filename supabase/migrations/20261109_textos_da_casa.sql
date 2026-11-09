-- Juliu's — textos novos da casa (2026-11-09).
--
-- O dono trocou os textos que o cliente lê:
--   * saudação do chat: "Oi, Ana Souza! Manda o número da música que você
--     quer cantar 🎤" vira "Ana Souza, envie a numeração de sua canção no
--     campo abaixo!" (chat_iniciar; conversas abertas também mudam já).
--   * "Cardápio de músicas" vira "Lista musical" nas dúvidas e respostas
--     prontas (julius.avisos) — só o nome do botão, o resto do texto que o
--     dono editou fica como está.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois de
-- 20261103_liberar_musica_repetida.sql. Pode rodar de novo: é idempotente.

set search_path = julius;

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
  v_ola_antigo text;
  v_ola_velho text;
  v_ola_novo text;
begin
  perform julius._limpar_conversas_antigas();

  if coalesce(btrim(p_perfil), '') = '' or coalesce(btrim(p_chave), '') = '' then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  end if;
  if char_length(v_nome) < 1 or char_length(v_nome) > 24 then
    raise exception 'NOME_INVALIDO' using errcode = 'P0001';
  end if;

  select * into v_existing from julius.conversas where perfil_id = p_perfil;
  v_ola_novo := v_nome || ', envie a numeração de sua canção no campo abaixo!';

  if v_existing.perfil_id is null then
    insert into julius.conversas (perfil_id, chave, nome)
    values (p_perfil, p_chave, v_nome);

    insert into julius.chat_mensagens (perfil_id, autor, texto)
    values (p_perfil, 'sistema', v_ola_novo);
  elsif v_existing.chave <> p_chave then
    raise exception 'PERFIL_INVALIDO' using errcode = 'P0001';
  elsif v_existing.nome <> v_nome then
    -- "will, envie..." vira "Will Souza, envie...": a saudação acompanha o nome novo
    -- (a de antes de 2026-11-09, "Oi, will! Manda...", também)
    v_ola_antigo := v_existing.nome || ', envie a numeração de sua canção no campo abaixo!';
    v_ola_velho := 'Oi, ' || v_existing.nome || '! Manda o número da música que você quer cantar 🎤';

    update julius.chat_mensagens
       set texto = v_ola_novo
     where perfil_id = p_perfil
       and autor = 'sistema'
       and texto in (v_ola_antigo, v_ola_velho);

    update julius.conversas
       set nome = v_nome,
           ultima_msg_texto = case when ultima_msg_texto in (v_ola_antigo, v_ola_velho) then v_ola_novo else ultima_msg_texto end
     where perfil_id = p_perfil;
  end if;
end;
$$;

grant execute on function julius.chat_iniciar(text, text, text) to anon;

-- conversas abertas: a saudação antiga já vira a nova (sem esperar a pessoa
-- trocar de nome ou a conversa ser apagada em 24h)
update julius.chat_mensagens m
   set texto = c.nome || ', envie a numeração de sua canção no campo abaixo!'
  from julius.conversas c
 where m.perfil_id = c.perfil_id
   and m.autor = 'sistema'
   and m.texto = 'Oi, ' || c.nome || '! Manda o número da música que você quer cantar 🎤';

update julius.conversas
   set ultima_msg_texto = nome || ', envie a numeração de sua canção no campo abaixo!'
 where ultima_msg_texto = 'Oi, ' || nome || '! Manda o número da música que você quer cantar 🎤';

-- dúvidas e respostas prontas: o botão agora se chama "Lista musical"
update julius.avisos
   set texto = replace(texto, '“Cardápio de músicas”', '“Lista musical”')
 where texto like '%“Cardápio de músicas”%';
