-- Juliu's — RPC pra admin apagar fila + chat de verdade (produção). Antes só
-- dava pra remover 1 entrada de cada vez (FilaPanel) ou pra apagar mensagem
-- por mensagem (ChatPanel). RLS não deixa DELETE em `conversas` de jeito
-- nenhum hoje (só tem policy de select/update) — função security definer
-- resolve isso sem abrir um DELETE geral pra role authenticated.
--
-- Por que não basta `auth.role() = 'authenticated'` (convenção usada no
-- resto do schema pra admin): este Postgres é compartilhado com outros
-- projetos (ver comentário em supabaseClient.js). Se o Auth (GoTrue)
-- também for compartilhado entre eles, "authenticated" só significa
-- "logado em ALGUM projeto desse host" — não necessariamente no painel da
-- Juliu's. Pras ações incrementais (mudar status, editar horário) esse
-- risco já existe mas é tolerável; pra um wipe total e irreversível não é.
-- Por isso essa função exige a app_metadata claim "role: admin" no JWT,
-- que só existe se você marcar explicitamente o usuário admin (ver abaixo).
--
-- Depois de rodar este arquivo no SQL Editor do Supabase, marca o(s)
-- usuário(s) admin (rode 1x por email que vai logar no painel):
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
--    where email = 'EMAIL_DO_ADMIN_AQUI';
-- (o usuário precisa deslogar/logar de novo depois, pra pegar um JWT novo
-- com a claim.)

set search_path = julius;

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

  -- chat_mensagens tem FK pra conversas com "on delete cascade", mas apaga
  -- explícito mesmo assim — não depende de ordem/side-effect implícito.
  -- `where true` de propósito: o Supabase carrega a extensão pg_safeupdate, que
  -- recusa DELETE sem WHERE ("DELETE requires a WHERE clause") até dentro de função.
  delete from julius.chat_mensagens where true;
  delete from julius.conversas where true;
  delete from julius.queue_entries where true;
end;
$$;

revoke execute on function julius.admin_limpar_dados() from public, anon;
grant execute on function julius.admin_limpar_dados() to authenticated;
