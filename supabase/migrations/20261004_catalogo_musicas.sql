-- Juliu's — catálogo de músicas com busca (2026-10-04).
--
-- A tabela `musicas` deixa de ser só "título cadastrado pra sugestão" e vira o
-- catálogo do aparelho (número -> título + cantor + categoria), carregado pelo
-- painel (aba Músicas -> Catálogo -> Importar). Com isso:
--   * o cliente e o operador abrem o cardápio inteiro (nome + número, paginado) e
--     filtram pelo nome da música ou do cantor (RPC buscar_musicas, sem diferenciar
--     acento nem maiúscula);
--   * as sugestões e a fila mostram o nome da música, não só o número.
--
-- As sugestões NÃO podem mais ser "tudo que tem título" (seriam as ~12 mil
-- músicas em ordem alfabética): agora são as mais cantadas + as marcadas como
-- `destaque` (as que o painel já tinha cadastrado até aqui viram destaque).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois de
-- 20261003_intervalo_repetir_musica.sql. Pode rodar de novo: é idempotente.

set search_path = julius;

-- 1. normalização pra busca ---------------------------------------------------
-- minúscula, sem acento, pontuação vira espaço, apóstrofo some ("I'm" -> "im",
-- como a pessoa digita), espaços colapsados. Imutável, então dá pra usar em coluna
-- gerada. Espelha normalizar() em src/lib/catalogo.js.
create or replace function julius._norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(t, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ-_.,;:!?()[]"/&’´`''',
      'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn               '
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- 2. colunas do catálogo ------------------------------------------------------
alter table julius.musicas drop constraint if exists musicas_titulo_check;
alter table julius.musicas
  add constraint musicas_titulo_check check (char_length(btrim(titulo)) between 1 and 120);

alter table julius.musicas add column if not exists artista text;
alter table julius.musicas add column if not exists categoria text;

-- destaque: só quando a coluna nasce, tudo que já estava na tabela vira
-- destaque (era assim que as sugestões funcionavam). Rodar de novo não mexe.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'julius' and table_name = 'musicas' and column_name = 'destaque'
  ) then
    alter table julius.musicas add column destaque boolean not null default false;
    update julius.musicas set destaque = true;
  end if;
end;
$$;

-- texto de busca (título + cantor), normalizado e mantido pelo banco
alter table julius.musicas drop column if exists busca;
alter table julius.musicas
  add column busca text generated always as (julius._norm(titulo || ' ' || coalesce(artista, ''))) stored;

-- chaves de ordenação do cardápio (alfabética sem acento nem pontuação), prontas
-- no banco pra não recalcular a cada página. collate "C": o texto já vem
-- normalizado (minúsculo, sem acento), então comparar byte a byte dá a ordem certa
-- e é ~10x mais rápido que a collation de idioma do banco.
alter table julius.musicas drop column if exists titulo_norm;
alter table julius.musicas drop column if exists artista_norm;
alter table julius.musicas
  add column titulo_norm text collate "C" generated always as (julius._norm(titulo)) stored;
alter table julius.musicas
  add column artista_norm text collate "C" generated always as (julius._norm(artista)) stored;

-- o cardápio lê direto dos índices (ordem + paginação), sem ordenar o catálogo
create index if not exists idx_musicas_titulo on julius.musicas (titulo_norm, numero);
create index if not exists idx_musicas_artista on julius.musicas (artista_norm, titulo_norm, numero);
create index if not exists idx_musicas_categoria on julius.musicas (categoria, titulo_norm, numero);

grant select on julius.musicas to anon, authenticated;

-- 3. busca --------------------------------------------------------------------
-- Cardápio + busca. Sem texto: o catálogo inteiro, em ordem alfabética (por música
-- ou por cantor), paginado com p_limite/p_offset — caminho rápido, direto pelos
-- índices (sem ordenar nem contar o catálogo todo a cada página). Com texto: número
-- digitado casa pelo começo; texto casa se TODAS as palavras aparecem em título ou
-- cantor (em qualquer ordem), e o filtro de texto só vale a partir de 2 caracteres.
-- Resultado do filtro: número exato, começa com o que foi digitado, depois a ordem
-- pedida. `total` = quantas músicas casam (sem contar a paginação).
drop function if exists julius.buscar_musicas(text, text, int);
drop function if exists julius.buscar_musicas(text, text, int, int, text);

create or replace function julius.buscar_musicas(
  p_q text default '',
  p_categoria text default null,
  p_limite int default 50,
  p_offset int default 0,
  p_ordem text default 'titulo'
)
returns table (numero text, titulo text, artista text, categoria text, total bigint)
language plpgsql
stable
security definer
set search_path = julius
as $$
#variable_conflict use_column
declare
  v_txt text := julius._norm(p_q);
  v_palavras text[];
  v_limite int := greatest(1, least(coalesce(p_limite, 50), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total bigint;
begin
  if char_length(v_txt) < 2 then
    v_txt := '';
  end if;

  -- cardápio sem filtro de texto: índice + limit, sem sort
  if v_txt = '' then
    -- o total só é contado na primeira página; nas seguintes vem 0 (o cliente já tem)
    if v_offset = 0 then
      select count(*) into v_total
        from julius.musicas m
       where p_categoria is null or m.categoria = p_categoria;
    else
      v_total := 0;
    end if;

    if p_ordem = 'artista' then
      return query
        select m.numero, m.titulo, m.artista, m.categoria, v_total
          from julius.musicas m
         where p_categoria is null or m.categoria = p_categoria
         order by m.artista_norm, m.titulo_norm, m.numero
         limit v_limite offset v_offset;
    else
      return query
        select m.numero, m.titulo, m.artista, m.categoria, v_total
          from julius.musicas m
         where p_categoria is null or m.categoria = p_categoria
         order by m.titulo_norm, m.numero
         limit v_limite offset v_offset;
    end if;
    return;
  end if;

  -- palavra longa perde o "s" do plural: "evidencias" acha "Evidência"
  v_palavras := array(
    select case when char_length(w) >= 5 then regexp_replace(w, 's$', '') else w end
      from unnest(string_to_array(v_txt, ' ')) w
     where w <> ''
  );

  return query
    with achadas as (
      select m.*
        from julius.musicas m
       where (p_categoria is null or m.categoria = p_categoria)
         and (
           m.numero like v_txt || '%'
           or not exists (
             select 1 from unnest(v_palavras) w where m.busca not like '%' || w || '%'
           )
         )
    )
    select a.numero, a.titulo, a.artista, a.categoria, count(*) over ()
      from achadas a
     order by (a.numero = v_txt) desc,
              (a.busca like v_txt || '%') desc,
              case when p_ordem = 'artista' then a.artista_norm end,
              a.titulo_norm,
              a.numero
     limit v_limite offset v_offset;
end;
$$;

grant execute on function julius.buscar_musicas(text, text, int, int, text) to anon, authenticated;

-- 4. sugestões: mais cantadas + destaques -------------------------------------
-- Retorno ganhou `artista`, então a função antiga sai antes.
drop function if exists julius.musicas_sugeridas(int);

create or replace function julius.musicas_sugeridas(p_limite int default 8)
returns table (numero text, titulo text, artista text, vezes int, destaque boolean)
language sql
stable
security definer
set search_path = julius
as $$
  with q as (
    select numero_musica as numero, count(*)::int as vezes
      from julius.queue_entries
     where status in ('playing', 'done')
     group by numero_musica
  ), base as (
    select q.numero, q.vezes from q
    union all
    select m.numero, 0
      from julius.musicas m
     where m.destaque and not exists (select 1 from q where q.numero = m.numero)
  )
  select b.numero, m.titulo, m.artista, b.vezes, coalesce(m.destaque, false) as destaque
    from base b
    left join julius.musicas m on m.numero = b.numero
   order by b.vezes desc, m.titulo nulls last, b.numero
   limit greatest(1, least(coalesce(p_limite, 8), 100));
$$;

grant execute on function julius.musicas_sugeridas(int) to anon, authenticated;
