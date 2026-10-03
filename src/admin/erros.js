// Mensagens de erro do painel. Os códigos (NOME_INVALIDO...) vêm das funções
// do Postgres (supabase/migrations); o resto é erro cru do PostgREST/rede.
const MIGRATION = 'Falta rodar a migration 20261002_pedidos_do_cliente.sql no SQL Editor do Supabase.'
const MIGRATION_CATALOGO = 'Falta rodar a migration 20261004_catalogo_musicas.sql no SQL Editor do Supabase.'

const MAPA = {
  NOME_INVALIDO: 'Coloca um nome de 1 a 24 letras.',
  NUMERO_INVALIDO: 'O número da música tem de 1 a 5 dígitos.',
  TITULO_INVALIDO: 'O nome da música tem de 1 a 120 letras.',
  CASA_FECHADA: 'A casa está fechada agora. Muda pra "Forçar aberto" na aba Casa pra incluir.',
  NAO_AUTORIZADO: 'Sem permissão. Sai e entra no painel de novo.',
}

export function mapErroAdmin(msg) {
  if (!msg) return 'Não deu certo. Tenta de novo.'
  if (MAPA[msg]) return MAPA[msg]
  if (/could not find the function|schema cache|column .* does not exist|relation .* does not exist/i.test(msg)) {
    return /musicas|destaque|artista|categoria|buscar_musicas/i.test(msg) ? MIGRATION_CATALOGO : MIGRATION
  }
  return msg
}
