// Fila da casa em cima do SQLite do navegador (ver ./sqlite.js).
//
// Mantém a mesma superfície que o app já consumia do adaptador antigo:
//  - getSettings / updateSettings
//  - getQueue
//  - joinQueue  (mesmas regras da função julius.join_queue do Postgres)
//  - setEntryStatus / deleteEntry / swapPositions / reset
//  - subscribe  (reatividade: mesma aba + entre abas)
//  - ready      (promise que resolve quando o banco terminou de subir)
//
// Sem login: o painel é aberto. Dados são 100% fake, pra teste.

import { subscribe, all, one, run, reseed, dbReady } from './sqlite'
import { abertoAgora } from './schedule'
import { normalizarTel } from './telefone'

const SESSION_KEY = 'juliu_local_session'
const authSubs = new Set()

const DEFAULT_HORARIO = {
  qui: '19:00-23:00',
  sex: '19:00-01:00',
  sab: '19:00-01:00',
  dom: '18:00-23:00',
}

function parseSettings(row) {
  if (!row) {
    return { id: 1, abertura_modo: 'auto', horario_funcionamento: DEFAULT_HORARIO }
  }
  let horario = DEFAULT_HORARIO
  try {
    horario = JSON.parse(row.horario_funcionamento) || DEFAULT_HORARIO
  } catch {
    /* ignore */
  }
  return { id: 1, abertura_modo: row.abertura_modo, horario_funcionamento: horario }
}

function ativos() {
  return all(
    "SELECT * FROM queue_entries WHERE status IN ('waiting', 'playing') ORDER BY posicao ASC"
  )
}

export const localDb = {
  ready: dbReady,
  subscribe,

  // ---- settings ----
  getSettings() {
    return parseSettings(one('SELECT * FROM settings WHERE id = 1'))
  },

  updateSettings(patch) {
    const next = { ...this.getSettings(), ...patch }
    run(
      `INSERT INTO settings (id, abertura_modo, horario_funcionamento)
         VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         abertura_modo = excluded.abertura_modo,
         horario_funcionamento = excluded.horario_funcionamento`,
      [next.abertura_modo, JSON.stringify(next.horario_funcionamento)]
    )
  },

  // ---- queue ----
  getQueue() {
    return all('SELECT * FROM queue_entries ORDER BY posicao ASC')
  },

  // mesma lógica da função julius.join_queue (Postgres)
  joinQueue({ nome, perfil, numero, telefone }) {
    const n = String(nome || '').trim()
    const p = String(perfil || '').trim()
    const tel = normalizarTel(telefone)
    if (!n) throw new Error('NOME_VAZIO')
    if (!p) throw new Error('PERFIL_INVALIDO')
    if (!tel) throw new Error('TELEFONE_INVALIDO')
    if (!abertoAgora(this.getSettings())) throw new Error('CASA_FECHADA')

    const list = ativos()
    if (list.filter((e) => e.perfil_id === p).length >= 2) {
      throw new Error('LIMITE_2_MUSICAS')
    }

    const tail = list[list.length - 1]
    let novaPosicao
    if (!tail) {
      novaPosicao = 1
    } else {
      const temOutros = list.some((e) => e.perfil_id !== p)
      novaPosicao = tail.perfil_id === p && temOutros ? tail.posicao + 2 : tail.posicao + 1
    }

    const row = {
      id: crypto.randomUUID(),
      nome: n,
      perfil_id: p,
      telefone: tel,
      numero_musica: String(numero).trim(),
      status: 'waiting',
      posicao: novaPosicao,
      created_at: new Date().toISOString(),
    }
    run(
      `INSERT INTO queue_entries
         (id, nome, perfil_id, telefone, numero_musica, status, posicao, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.nome,
        row.perfil_id,
        row.telefone,
        row.numero_musica,
        row.status,
        row.posicao,
        row.created_at,
      ]
    )
    return row
  },

  // ---- admin ----
  setEntryStatus(id, status) {
    run('UPDATE queue_entries SET status = ? WHERE id = ?', [status, id])
  },

  deleteEntry(id) {
    run('DELETE FROM queue_entries WHERE id = ?', [id])
  },

  swapPositions(idA, idB) {
    const a = one('SELECT posicao FROM queue_entries WHERE id = ?', [idA])
    const b = one('SELECT posicao FROM queue_entries WHERE id = ?', [idB])
    if (!a || !b) return
    run('UPDATE queue_entries SET posicao = ? WHERE id = ?', [b.posicao, idA])
    run('UPDATE queue_entries SET posicao = ? WHERE id = ?', [a.posicao, idB])
  },

  reset() {
    reseed()
  },

  // ---- auth fake (modo local: qualquer email/senha entra) ----
  auth: {
    getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    signIn(email) {
      const session = { user: { email: email || 'admin@local' }, local: true }
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      } catch {
        /* ignore */
      }
      authSubs.forEach((cb) => cb(session))
      return session
    },
    signOut() {
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch {
        /* ignore */
      }
      authSubs.forEach((cb) => cb(null))
    },
    subscribe(cb) {
      authSubs.add(cb)
      return () => authSubs.delete(cb)
    },
  },
}
