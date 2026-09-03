// Adaptador de fila 100% local (modo VITE_LOCAL).
//
// Replica o comportamento do Supabase que o app usa:
//  - tabela settings (status aberto/fechado + horário)
//  - tabela queue_entries
//  - função join_queue (mesmas regras da versão Postgres em supabase/schema.sql)
//  - "realtime" via pub/sub (mesma aba) + evento `storage` (entre abas)
//  - auth de admin fake (qualquer email/senha; sessão no localStorage)
//
// Persistência: uma chave de localStorage. Sem servidor, sem rede.

const DB_KEY = 'juliu_localdb'
const SESSION_KEY = 'juliu_local_session'

const SEED = {
  settings: {
    status_aberto: true,
    horario_funcionamento: {
      qui: '19:00-23:00',
      sex: '19:00-01:00',
      sab: '19:00-01:00',
      dom: '18:00-23:00',
    },
  },
  queue: [], // { id, nome, perfil_id, numero_musica, status, posicao, created_at }
}

function clone(x) {
  return JSON.parse(JSON.stringify(x))
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return { ...clone(SEED), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return clone(SEED)
}

let db = load()
const subs = new Set()
const authSubs = new Set()

function emit() {
  subs.forEach((cb) => {
    try {
      cb()
    } catch {
      /* ignore */
    }
  })
}

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* ignore */
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
      db = load()
      emit()
    }
  })
}

function ativos() {
  return db.queue.filter((e) => e.status === 'waiting' || e.status === 'playing')
}

export const localDb = {
  subscribe(cb) {
    subs.add(cb)
    return () => subs.delete(cb)
  },

  // ---- settings ----
  getSettings() {
    return { id: 1, ...db.settings }
  },
  updateSettings(patch) {
    db.settings = { ...db.settings, ...patch }
    persist()
  },

  // ---- queue ----
  getQueue() {
    return [...db.queue].sort((a, b) => a.posicao - b.posicao)
  },

  // mesma lógica da função julius.join_queue (Postgres)
  joinQueue({ nome, perfil, numero }) {
    const n = String(nome || '').trim()
    const p = String(perfil || '').trim()
    if (!n) throw new Error('NOME_VAZIO')
    if (!p) throw new Error('PERFIL_INVALIDO')
    if (!db.settings.status_aberto) throw new Error('CASA_FECHADA')

    const list = ativos()
    if (list.filter((e) => e.perfil_id === p).length >= 2) {
      throw new Error('LIMITE_2_MUSICAS')
    }

    const ordenados = [...list].sort((a, b) => a.posicao - b.posicao)
    const tail = ordenados[ordenados.length - 1]
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
      numero_musica: String(numero).trim(),
      status: 'waiting',
      posicao: novaPosicao,
      created_at: new Date().toISOString(),
    }
    db.queue.push(row)
    persist()
    return row
  },

  // ---- admin ----
  setEntryStatus(id, status) {
    const e = db.queue.find((x) => x.id === id)
    if (e) {
      e.status = status
      persist()
    }
  },
  deleteEntry(id) {
    db.queue = db.queue.filter((x) => x.id !== id)
    persist()
  },
  swapPositions(idA, idB) {
    const a = db.queue.find((x) => x.id === idA)
    const b = db.queue.find((x) => x.id === idB)
    if (a && b) {
      const t = a.posicao
      a.posicao = b.posicao
      b.posicao = t
      persist()
    }
  },
  reset() {
    db = clone(SEED)
    persist()
  },

  // ---- auth fake ----
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
