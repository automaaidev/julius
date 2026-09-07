// Telefone do cliente — só pra avisar no WhatsApp quando a vez chega.
// NÃO é identidade na fila (isso continua sendo o perfil_id, ver perfil.js).
//
// Guardamos só dígitos. wa.me exige número internacional sem "+".
// Assumimos Brasil: 55 + DDD (2) + número (8 ou 9 dígitos).

// "(11) 91234-5678", "11991234567", "+55 11 9..." -> "5511991234567" | ''
export function normalizarTel(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  // tira zeros de operadora / trunk à esquerda
  d = d.replace(/^0+/, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return ''
}

// dígitos -> "(11) 91234-5678" pra exibir no painel
export function formatTelBR(raw) {
  const d = normalizarTel(raw)
  if (!d) return String(raw || '')
  const nac = d.slice(2) // sem o 55
  const ddd = nac.slice(0, 2)
  const num = nac.slice(2)
  const meio = num.length === 9 ? num.slice(0, 5) : num.slice(0, 4)
  const fim = num.length === 9 ? num.slice(5) : num.slice(4)
  return `(${ddd}) ${meio}-${fim}`
}

// link que abre o WhatsApp do admin já na conversa certa, texto pronto
export function linkWhatsApp(tel, texto) {
  const d = normalizarTel(tel)
  if (!d) return ''
  return `https://wa.me/${d}?text=${encodeURIComponent(texto || '')}`
}
