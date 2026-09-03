// "Perfil" do cliente na fila — sem login.
//
// Cada navegador ganha um id estável (perfil_id) guardado no localStorage.
// É esse id que amarra as músicas de uma pessoa/dupla e faz valer o limite
// de 2 músicas ativas (a checagem final é no servidor, na função join_queue).
// O nome é só exibição — pode ser o nome da dupla e dá pra trocar sem perder
// o perfil.

const ID_KEY = 'juliu_perfil_id'
const NOME_KEY = 'juliu_perfil_nome'

function randomId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// lê o id; cria e persiste se ainda não existe
export function getPerfilId() {
  try {
    let id = localStorage.getItem(ID_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : randomId()
      localStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    // localStorage bloqueado (aba privada, etc): id só pra esta sessão
    return randomId()
  }
}

export function getPerfilNome() {
  try {
    return localStorage.getItem(NOME_KEY) || ''
  } catch {
    return ''
  }
}

export function setPerfilNome(nome) {
  try {
    localStorage.setItem(NOME_KEY, nome)
  } catch {
    /* ignore */
  }
}
