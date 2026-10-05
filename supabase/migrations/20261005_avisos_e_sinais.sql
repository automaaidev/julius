-- Juliu's — banco de avisos / respostas prontas + sinais na fila (2026-10-05).
--
-- Pedidos do dono que estavam pela metade:
--
-- 1. "Banco de avisos e respostas automáticas pra pessoa não ficar indo no balcão"
--    julius.avisos guarda três tipos de texto, todos editáveis no painel (aba Avisos):
--      * 'faq'      perguntas e respostas: o cliente abre em "Dúvidas" no site
--      * 'aviso'    aviso da casa: aparece no topo da tela do cliente enquanto estiver ativo
--      * 'resposta' respostas prontas: viram botões no chat do operador (1 toque = mensagem)
--
-- 2. "Sinalizar que foi visualizado / já cantou"
--    queue_entries.sinal: o operador marca cada pedido com 👀 visto, 🎶 no aparelho ou
--    ❓ confirmar número, e o cliente enxerga na própria música. "Já cantou" (✅) é o
--    próprio status 'done'.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo: é idempotente
-- (os textos de exemplo só entram se a tabela estiver vazia).

set search_path = julius;

-- 1. avisos --------------------------------------------------------------------
create table if not exists julius.avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('faq', 'aviso', 'resposta')),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto text not null check (char_length(btrim(texto)) between 1 and 600),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_avisos_tipo on julius.avisos (tipo, ordem, created_at);

alter table julius.avisos enable row level security;

-- cliente (anon) só lê o que está ativo e só o que é pra ele; operador lê e escreve tudo.
-- 'resposta' é ferramenta do operador: não vai pro cliente.
revoke insert, update, delete on julius.avisos from anon;

drop policy if exists "avisos_select_public" on julius.avisos;
create policy "avisos_select_public" on julius.avisos
  for select using (
    auth.role() = 'authenticated'
    or (ativo and tipo in ('faq', 'aviso'))
  );

drop policy if exists "avisos_write_admin" on julius.avisos;
create policy "avisos_write_admin" on julius.avisos
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- textos de exemplo (no tom da casa; o dono edita no painel). Só entram na primeira vez.
insert into julius.avisos (tipo, titulo, texto, ordem)
select v.tipo, v.titulo, v.texto, v.ordem
  from (values
    ('faq', 'Como peço uma música?',
      'Digite seu nome e depois é só mandar o número da música aqui no chat. Quem manda primeiro entra primeiro na fila — não precisa esperar ninguém.', 1),
    ('faq', 'Não sei o número da música',
      'Toque em “Cardápio de músicas”, procure pelo nome da música ou do cantor e toque nela. O número aparece ao lado do nome.', 2),
    ('faq', 'Mandei o número errado',
      'Toque em “Errou o número? Cancelar e mandar outro” no seu pedido e mande o número certo. Você entra de novo no fim da fila.', 3),
    ('faq', 'Em que posição estou? Quanto falta?',
      'A sua posição aparece no pedido e se atualiza sozinha. Quando você for o próximo — e quando for a sua vez — o sistema avisa aqui no chat.', 4),
    ('faq', 'Posso pedir mais de uma música?',
      'Cada pessoa pode ter um número limitado de músicas na fila ao mesmo tempo. Se você já estiver no limite, o sistema avisa; quando uma terminar, é só pedir outra.', 5),
    ('faq', 'O que significam os sinais no meu pedido?',
      '👀 Visto: a equipe já viu o seu pedido. 🎶 No aparelho: a sua música já está na sequência. ❓ Confirmar: a equipe precisa conferir o número com você. ✅ Já cantou: a música foi concluída.', 6),
    ('faq', 'Como anoto o que já cantei?',
      'Use a aba “Meu caderninho”: anote o que quer cantar e marque o que já cantou. É só seu — fica guardado neste celular, sem papel e caneta.', 7),
    ('faq', 'A que horas a fila encerra?',
      'A fila encerra automaticamente à meia-noite. Quem ainda estava esperando recebe uma mensagem de agradecimento.', 8),
    ('resposta', 'Conferir número',
      'Não achei esse número no aparelho. Confere se digitou certo ou procura pelo nome no “Cardápio de músicas”. 😉', 1),
    ('resposta', 'Fila cheia',
      'A fila está cheia hoje, mas a sua música está garantida! O sistema avisa quando for a sua vez. 🎶', 2),
    ('resposta', 'Tá chegando',
      'Tá chegando a sua vez — vai se preparando perto do palco! 🎤', 3),
    ('resposta', 'Aparelho ajustando',
      'Estamos ajustando o aparelho rapidinho. Já volta ao normal, valeu pela paciência! 🙏', 4),
    ('resposta', 'Obrigado',
      'Valeu por cantar com a gente! Volta sempre. 🎶', 5)
  ) as v(tipo, titulo, texto, ordem)
 where not exists (select 1 from julius.avisos);

-- 2. sinais na fila --------------------------------------------------------------
-- null = ainda sem sinal. O cliente enxerga (é a coluna que ele precisa ver na própria
-- música); a escrita continua só do operador (policy queue_update_admin).
alter table julius.queue_entries add column if not exists sinal text;

alter table julius.queue_entries drop constraint if exists queue_entries_sinal_check;
alter table julius.queue_entries
  add constraint queue_entries_sinal_check check (sinal in ('visto', 'aparelho', 'ajuda'));

-- a anon key só lê as colunas listadas (telefone legado fica de fora): libera a nova
grant select (sinal) on julius.queue_entries to anon;
