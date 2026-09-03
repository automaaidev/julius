// Modo local: roda a fila inteira no navegador (persistência em localStorage),
// sem depender do Supabase. Útil pra desenvolver/testar antes de o banco estar
// no ar.
//
// Liga com VITE_LOCAL=1 no .env — ou automaticamente quando não há
// VITE_SUPABASE_URL configurada.
const flag = import.meta.env.VITE_LOCAL

export const LOCAL =
  flag === '1' || flag === 'true' || !import.meta.env.VITE_SUPABASE_URL
