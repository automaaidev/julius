// Mensagens de erro do painel. Os códigos (NOME_INVALIDO...) vêm das funções
// do Postgres (supabase/migrations); o resto é erro cru do PostgREST/rede.
const MIGRATION = 'Falta rodar a migration 20261002_pedidos_do_cliente.sql no SQL Editor do Supabase.'
const MIGRATION_AVISOS = 'Falta rodar a migration 20261005_avisos_e_sinais.sql no SQL Editor do Supabase.'
const MIGRATION_CATALOGO = 'Falta rodar a migration 20261004_catalogo_musicas.sql no SQL Editor do Supabase.'

const MAPA = {
  NOME_INVALIDO: 'Coloca um nome de 1 a 24 letras.',
  NUMERO_INVALIDO: 'O número da música tem de 1 a 5 dígitos.',
  TITULO_INVALIDO: 'O nome da música tem de 1 a 120 letras.',
  ARTISTA_INVALIDO: 'O nome do cantor pode ter até 120 letras.',
  AVISO_INVALIDO: 'Tipo de texto inválido.',
  AVISO_TITULO_INVALIDO: 'O título/pergunta tem de 1 a 120 letras.',
  AVISO_TEXTO_INVALIDO: 'O texto tem de 1 a 600 letras.',
  SINAL_INVALIDO: 'Sinal inválido.',
  CODIGO_EXISTE: 'Já existe uma música com esse código. Edite a que já está no cardápio.',
  CASA_FECHADA: 'A casa está fechada agora. Muda pra "Forçar aberto" na aba Casa pra incluir.',
  NAO_AUTORIZADO: 'Sem permissão. Sai e entra no painel de novo.',
}

export function mapErroAdmin(msg) {
  if (!msg) return 'Não deu certo. Tenta de novo.'
  if (MAPA[msg]) return MAPA[msg]
  if (/could not find the function|schema cache|column .* does not exist|relation .* does not exist/i.test(msg)) {
    if (/avisos|sinal/i.test(msg)) return MIGRATION_AVISOS
    return /musicas|destaque|artista|categoria|buscar_musicas/i.test(msg) ? MIGRATION_CATALOGO : MIGRATION
  }
  return msg
}
