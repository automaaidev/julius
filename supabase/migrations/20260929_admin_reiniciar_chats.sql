-- Juliu's — RPC pra admin reiniciar só os chats (conversas + mensagens),
-- sem mexer na fila. Mesmo modelo de autorização do admin_limpar_dados:
-- exige a app_metadata claim "role: admin" no JWT (ver comentário em
-- 20260929_admin_limpar_dados.sql pra marcar o usuário admin, se ainda não
-- fez isso).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.

set search_path = julius;

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

  -- chat_mensagens tem FK pra conversas com "on delete cascade", mas apaga
  -- explícito mesmo assim.
  -- `where true` de propósito: o Supabase carrega a extensão pg_safeupdate, que
  -- recusa DELETE sem WHERE ("DELETE requires a WHERE clause") até dentro de função.
  delete from julius.chat_mensagens where true;
  delete from julius.conversas where true;
end;
$$;

revoke execute on function julius.admin_reiniciar_chats() from public, anon;
grant execute on function julius.admin_reiniciar_chats() to authenticated;
