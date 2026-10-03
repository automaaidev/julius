// "Meu caderninho": as músicas que a pessoa quer cantar e as que já cantou.
//
// Fica só no navegador dela (localStorage) — privado de verdade: sem
// servidor, sem login, ninguém mais enxerga. Troca de celular ou limpar os
// dados do navegador = perde a lista (o aviso está na própria tela).
//
// Formato salvo:
//   itens:  [{ id, numero, titulo, feita, feitaEm, criadaEm }]
//   vistos: ids de entradas da fila que já viraram "cantada" aqui — evita que
//           uma música apagada da lista volte sozinha na próxima sincronização.

import { useSyncExternalStore } from 'react'

const KEY = 'juliu_cantadas'
const MAX_ITENS = 300
const MAX_VISTOS = 200

let estado = null // cache em memória; também é o fallback se o localStorage falhar
const assinantes = new Set()

function novoId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function ler() {
  try {
    const raw = localStorage.getItem(KEY)
    const dados = raw ? JSON.parse(raw) : null
    return {
      itens: Array.isArray(dados?.itens) ? dados.itens : [],
      vistos: Array.isArray(dados?.vistos) ? dados.vistos : [],
    }
  } catch {
    return { itens: [], vistos: [] }
  }
}

function atual() {
  if (!estado) estado = ler()
  return estado
}

function gravar(novo) {
  estado = novo
  try {
    localStorage.setItem(KEY, JSON.stringify(novo))
  } catch {
    /* sem storage (aba privada): vale só enquanto a página estiver aberta */
  }
  assinantes.forEach((cb) => cb())
}

function assinar(cb) {
  assinantes.add(cb)
  return () => assinantes.delete(cb)
}

// outra aba do mesmo navegador mexeu no caderninho
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      estado = ler()
      assinantes.forEach((cb) => cb())
    }
  })
}

export function useCantadas() {
  return useSyncExternalStore(assinar, atual, atual)
}

export function adicionarMusica({ numero, titulo = '' }) {
  const n = String(numero || '').replace(/\D/g, '').slice(0, 5)
  if (!n) return { ok: false }
  const t = String(titulo || '').trim().slice(0, 40)
  const { itens, vistos } = atual()

  const existente = itens.find((i) => i.numero === n)
  if (existente) {
    // já está na lista: só completa o título se faltava
    if (t && !existente.titulo) {
      gravar({ itens: itens.map((i) => (i.id === existente.id ? { ...i, titulo: t } : i)), vistos })
    }
    return { ok: true, repetida: true }
  }
  if (itens.length >= MAX_ITENS) return { ok: false, erro: 'Caderninho cheio.' }

  gravar({
    itens: [
      { id: novoId(), numero: n, titulo: t, feita: false, feitaEm: null, criadaEm: new Date().toISOString() },
      ...itens,
    ],
    vistos,
  })
  return { ok: true }
}

export function marcarFeita(id, feita) {
  const { itens, vistos } = atual()
  gravar({
    itens: itens.map((i) =>
      i.id === id ? { ...i, feita, feitaEm: feita ? new Date().toISOString() : null } : i
    ),
    vistos,
  })
}

export function removerItem(id) {
  const { itens, vistos } = atual()
  gravar({ itens: itens.filter((i) => i.id !== id), vistos })
}

// uma entrada minha da fila foi concluída: vira "já cantei" no caderninho
// (marca a que já existe, ou cria). Cada entrada só conta uma vez.
export function registrarCantada(entradaId, numero) {
  const { itens, vistos } = atual()
  if (vistos.includes(entradaId)) return
  const novosVistos = [...vistos, entradaId].slice(-MAX_VISTOS)
  const agora = new Date().toISOString()

  const existente = itens.find((i) => i.numero === numero)
  if (existente) {
    gravar({
      itens: itens.map((i) => (i.id === existente.id ? { ...i, feita: true, feitaEm: i.feitaEm || agora } : i)),
      vistos: novosVistos,
    })
    return
  }
  gravar({
    itens: [{ id: novoId(), numero, titulo: '', feita: true, feitaEm: agora, criadaEm: agora }, ...itens].slice(0, MAX_ITENS),
    vistos: novosVistos,
  })
}

export function jaCantei(itens, numero) {
  return itens.some((i) => i.numero === numero && i.feita)
}
