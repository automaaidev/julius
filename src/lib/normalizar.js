// Texto de busca: minúscula, sem acento, pontuação vira espaço, apóstrofo some
// ("I'm" -> "im", como a pessoa digita) e espaços colapsam. Espelha
// julius._norm no Postgres (supabase/migrations/20261004_catalogo_musicas.sql) —
// o servidor normaliza a consulta sozinho; esta cópia é do modo local (SQLite).
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_.,;:!?()[\]"/&%]/g, ' ')
    .replace(/['’´`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
