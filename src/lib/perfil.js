// "Perfil" do cliente na fila — sem login.
//
// Cada navegador ganha um id estável (perfil_id) guardado no localStorage.
// É esse id que amarra a música de uma pessoa/dupla à fila e ao chat. A
// "chave" é um segredo que só esse navegador conhece — o servidor confere
// perfil_id + chave antes de aceitar qualquer mensagem, pra ninguém falar
// pela conversa de outra pessoa. O nome é só exibição — pode ser o nome da
// dupla e dá pra trocar sem perder o perfil.

const ID_KEY = 'juliu_perfil_id'
const CHAVE_KEY = 'juliu_perfil_chave'
const NOME_KEY = 'juliu_perfil_nome'

function randomId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function idEstavel(key) {
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : randomId()
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    // localStorage bloqueado (aba privada, etc): id só pra esta sessão
    return randomId()
  }
}

export function getPerfilId() {
  return idEstavel(ID_KEY)
}

export function getPerfilChave() {
  return idEstavel(CHAVE_KEY)
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
