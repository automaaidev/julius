// Engine SQLite no navegador (sql.js / WebAssembly).
//
// O banco inteiro roda em memória e é persistido como um blob base64 numa
// chave de localStorage. Sem servidor, sem rede — só dev/teste.
//
// - init assíncrono (WASM). `dbReady` resolve quando o banco está de pé.
// - leituras (`all`/`one`) são síncronas; antes do init retornam vazio e os
//   hooks re-renderizam quando `emit()` dispara no fim do init.
// - `run()` grava, persiste o blob e notifica assinantes.
// - `storage` event sincroniza entre abas.

import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const DB_KEY = 'juliu_sqlite_v1'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  abertura_modo TEXT NOT NULL DEFAULT 'auto',
  horario_funcionamento TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS queue_entries (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  perfil_id     TEXT NOT NULL,
  telefone      TEXT,
  numero_musica TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting',
  posicao       INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
`

let SQL = null
let db = null
const subs = new Set()

export function subscribe(cb) {
  subs.add(cb)
  return () => subs.delete(cb)
}

function emit() {
  subs.forEach((cb) => {
    try {
      cb()
    } catch {
      /* ignore */
    }
  })
}

// ---- persistência (Uint8Array <-> base64 em localStorage) ----

function toBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function fromBase64(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function persist() {
  try {
    localStorage.setItem(DB_KEY, toBase64(db.export()))
  } catch {
    /* ignore */
  }
}

// ---- seed de dados fake (mexa à vontade) ----

const HORARIO = {
  qui: '19:00-23:00',
  sex: '19:00-01:00',
  sab: '19:00-01:00',
  dom: '18:00-23:00',
}

// timestamps relativos a agora, pra alimentar o painel de estatísticas
const iso = (minAtras) => new Date(Date.now() - minAtras * 60_000).toISOString()

const SEED_QUEUE = [
  ['p_rafa', 'Rafa', '11987650001', '1042', 'playing', 1, iso(8)],
  ['p_bia', 'Bia e Dan', '11987650002', '733', 'waiting', 2, iso(6)],
  ['p_rafa', 'Rafa', '11987650001', '2210', 'waiting', 4, iso(5)],
  ['p_leo', 'Léo', '11987650003', '188', 'waiting', 5, iso(3)],
  ['p_carol', 'Carol', '11987650004', '990', 'waiting', 6, iso(1)],
  ['p_bia', 'Bia', '11987650002', '415', 'done', 0, iso(35)],
  ['p_marina', 'Marina', '11987650005', '1200', 'done', 0, iso(70)],
  ['p_tati', 'Tati e Ju', '11987650006', '640', 'done', 0, iso(1500)], // ~ontem
]

function seed() {
  db.run(
    'INSERT INTO settings (id, abertura_modo, horario_funcionamento) VALUES (1, ?, ?)',
    ['aberto', JSON.stringify(HORARIO)]
  )
  const stmt = db.prepare(
    `INSERT INTO queue_entries
       (id, nome, perfil_id, telefone, numero_musica, status, posicao, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const row of SEED_QUEUE) {
    stmt.run([crypto.randomUUID(), row[1], row[0], row[2], row[3], row[4], row[5], row[6]])
  }
  stmt.free()
}

// ---- init ----

export const dbReady = (async () => {
  SQL = await initSqlJs({ locateFile: () => wasmUrl })

  let saved = null
  try {
    saved = localStorage.getItem(DB_KEY)
  } catch {
    /* ignore */
  }

  if (saved) {
    db = new SQL.Database(fromBase64(saved))
  } else {
    db = new SQL.Database()
    db.run(SCHEMA)
    seed()
    persist()
  }

  emit()
  return true
})()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY && e.newValue && SQL) {
      try {
        db = new SQL.Database(fromBase64(e.newValue))
        emit()
      } catch {
        /* ignore */
      }
    }
  })
}

// ---- API de query ----

export function all(sql, params = []) {
  if (!db) return []
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

export function one(sql, params = []) {
  return all(sql, params)[0] || null
}

export function run(sql, params = []) {
  if (!db) return
  db.run(sql, params)
  persist()
  emit()
}

// resema o banco do zero (botão "reset" do painel)
export function reseed() {
  if (!db) return
  db.run('DROP TABLE IF EXISTS queue_entries; DROP TABLE IF EXISTS settings;')
  db.run(SCHEMA)
  seed()
  persist()
  emit()
}
