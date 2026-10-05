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
import { normalizar } from './normalizar'
import { AVISOS_PADRAO } from './avisosPadrao'

const DB_KEY = 'juliu_sqlite_v1'

// crypto.randomUUID só existe em contexto seguro (https ou localhost) — testar
// pelo IP do celular na rede local (http puro) derruba o modo LOCAL inteiro
// sem isso.
export function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// SCHEMA usa IF NOT EXISTS e roda também em cima de um banco salvo (ver
// dbReady) — assim um blob salvo antes do chat existir ganha as tabelas
// novas sem precisar resetar os dados.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  abertura_modo TEXT NOT NULL DEFAULT 'auto',
  horario_funcionamento TEXT NOT NULL DEFAULT '{}',
  encerramento_automatico INTEGER NOT NULL DEFAULT 1,
  limite_musicas INTEGER NOT NULL DEFAULT 1,
  ultimo_encerramento TEXT,
  intervalo_repetir_min INTEGER NOT NULL DEFAULT 30
);
CREATE TABLE IF NOT EXISTS queue_entries (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  perfil_id     TEXT NOT NULL,
  numero_musica TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting',
  posicao       INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  cantada_em    TEXT
);
CREATE TABLE IF NOT EXISTS conversas (
  perfil_id        TEXT PRIMARY KEY,
  chave            TEXT NOT NULL,
  nome             TEXT NOT NULL,
  ultima_msg_em    TEXT,
  ultima_msg_texto TEXT,
  nao_lidas_admin  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id             TEXT PRIMARY KEY,
  perfil_id      TEXT NOT NULL,
  autor          TEXT NOT NULL,
  texto          TEXT NOT NULL,
  queue_entry_id TEXT,
  created_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS avisos (
  id         TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  texto      TEXT NOT NULL,
  ativo      INTEGER NOT NULL DEFAULT 1,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS musicas (
  numero     TEXT PRIMARY KEY,
  titulo     TEXT NOT NULL,
  artista    TEXT,
  categoria  TEXT,
  destaque   INTEGER NOT NULL DEFAULT 0,
  busca      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`

// colunas que entraram depois: CREATE TABLE IF NOT EXISTS não mexe numa tabela
// que já existe no blob salvo, então adiciona uma a uma (PRAGMA table_info diz
// o que já tem).
const COLUNAS_NOVAS = [
  ['settings', 'encerramento_automatico', 'INTEGER NOT NULL DEFAULT 1'],
  ['settings', 'limite_musicas', 'INTEGER NOT NULL DEFAULT 1'],
  ['settings', 'ultimo_encerramento', 'TEXT'],
  ['settings', 'intervalo_repetir_min', 'INTEGER NOT NULL DEFAULT 30'],
  ['queue_entries', 'cantada_em', 'TEXT'],
  ['queue_entries', 'sinal', 'TEXT'],
  ['musicas', 'artista', 'TEXT'],
  ['musicas', 'categoria', 'TEXT'],
  ['musicas', 'destaque', 'INTEGER NOT NULL DEFAULT 0'],
  ['musicas', 'busca', "TEXT NOT NULL DEFAULT ''"],
]

function migrar() {
  for (const [tabela, coluna, ddl] of COLUNAS_NOVAS) {
    const tem = all(`PRAGMA table_info(${tabela})`).some((c) => c.name === coluna)
    if (tem) continue
    db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`)
    // o que já estava cadastrado eram as sugestões do painel (mesma regra do Postgres)
    if (coluna === 'destaque') db.run('UPDATE musicas SET destaque = 1')
    if (coluna === 'busca') {
      for (const m of all('SELECT numero, titulo, artista FROM musicas')) {
        db.run('UPDATE musicas SET busca = ? WHERE numero = ?', [normalizar(`${m.titulo} ${m.artista ?? ''}`), m.numero])
      }
    }
  }
}

// textos de exemplo do banco de avisos: só entram se a tabela estiver vazia
function semearAvisos() {
  if (Number(all('SELECT COUNT(*) AS n FROM avisos')[0]?.n) > 0) return
  for (const [tipo, titulo, texto, ordem] of AVISOS_PADRAO) {
    db.run('INSERT INTO avisos (id, tipo, titulo, texto, ativo, ordem, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)', [
      uuid(),
      tipo,
      titulo,
      texto,
      ordem,
      new Date().toISOString(),
    ])
  }
}

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

// minutosAtras (não iso() já resolvido) — precisa calcular na hora do
// seed/reset, não uma vez só quando o módulo carrega. Congelado, um reset
// horas depois da aba aberta reinsere sempre os MESMOS timestamps antigos
// e o placar (Hoje/Semana/Mês/Ano) não bate com o reset.
const SEED_QUEUE = [
  ['p_rafa', 'Rafa', '1042', 'playing', 1, 8],
  ['p_bia', 'Bia e Dan', '733', 'waiting', 2, 6],
  ['p_leo', 'Léo', '188', 'waiting', 3, 3],
  ['p_carol', 'Carol', '990', 'waiting', 4, 1],
  ['p_bia2', 'Bia', '415', 'done', 0, 35],
  ['p_marina', 'Marina', '1200', 'done', 0, 70],
  ['p_tati', 'Tati e Ju', '640', 'done', 0, 1500], // ~ontem
]

// conversas de exemplo — perfil_id bate com o SEED_QUEUE acima, pra abrir
// o painel já com fila + chat coerentes entre si.
const SEED_CONVERSAS = [
  ['p_rafa', 'k_rafa', 'Rafa'],
  ['p_bia', 'k_bia', 'Bia e Dan'],
  ['p_leo', 'k_leo', 'Léo'],
  ['p_carol', 'k_carol', 'Carol'],
]

// títulos de exemplo pras sugestões (números inventados, só pra teste local) —
// entram como destaque. O catálogo de verdade vem do painel (Músicas -> Importar).
const SEED_MUSICAS = [
  ['1042', 'Evidências', 'Chitãozinho e Xororó'],
  ['733', 'Faz Parte do Meu Show', 'Cazuza'],
  ['188', 'Anna Júlia', 'Los Hermanos'],
  ['990', 'Trem-Bala', 'Ana Vilela'],
  ['415', 'Último Romance', 'Los Hermanos'],
]

function seed() {
  db.run(
    'INSERT INTO settings (id, abertura_modo, horario_funcionamento) VALUES (1, ?, ?)',
    ['aberto', JSON.stringify(HORARIO)]
  )
  for (const [numero, titulo, artista] of SEED_MUSICAS) {
    db.run(
      'INSERT INTO musicas (numero, titulo, artista, categoria, destaque, busca, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [numero, titulo, artista, 'Nacionais', normalizar(`${titulo} ${artista}`), iso(0)]
    )
  }
  const stmt = db.prepare(
    `INSERT INTO queue_entries
       (id, nome, perfil_id, numero_musica, status, posicao, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const row of SEED_QUEUE) {
    stmt.run([uuid(), row[1], row[0], row[2], row[3], row[4], iso(row[5])])
  }
  stmt.free()

  seedChat()
  semearAvisos()
}

function seedChat() {
  const stmtConv = db.prepare(
    `INSERT INTO conversas (perfil_id, chave, nome, ultima_msg_em, ultima_msg_texto, nao_lidas_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const stmtMsg = db.prepare(
    `INSERT INTO chat_mensagens (id, perfil_id, autor, texto, queue_entry_id, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`
  )

  for (const [i, [perfil, chave, nome]] of SEED_CONVERSAS.entries()) {
    const minAtras = 10 - i * 2
    const criadoEm = iso(minAtras + 5)
    const entrada = SEED_QUEUE.find((r) => r[0] === perfil)
    const naoLidas = i === 0 ? 0 : 1
    const ultimaTexto = entrada ? `Nº ${entrada[2]} na fila` : ''

    stmtConv.run([perfil, chave, nome, iso(minAtras), ultimaTexto, naoLidas, criadoEm])

    stmtMsg.run([uuid(), perfil, 'sistema', `Oi, ${nome}! Manda o número da música que você quer cantar 🎤`, iso(minAtras + 4)])
    if (entrada) {
      stmtMsg.run([uuid(), perfil, 'cliente', entrada[2], iso(minAtras + 2)])
      stmtMsg.run([uuid(), perfil, 'sistema', ultimaTexto, iso(minAtras)])
    }
  }

  stmtConv.free()
  stmtMsg.free()
}

// ---- init ----

export const dbReady = (async () => {
  try {
    SQL = await initSqlJs({ locateFile: () => wasmUrl })

    let saved = null
    try {
      saved = localStorage.getItem(DB_KEY)
    } catch {
      /* ignore */
    }

    if (saved) {
      db = new SQL.Database(fromBase64(saved))
      db.run(SCHEMA) // idempotente: só cria o que ainda não existe nesse blob
      migrar()
      semearAvisos()
      persist()
    } else {
      db = new SQL.Database()
      db.run(SCHEMA)
      seed()
      persist()
    }

    emit()
    return true
  } catch (e) {
    // WASM não carregou (offline, CSP, blob salvo corrompido, etc) — resolve
    // mesmo assim (não rejeita) pra quem faz `.then()` sair do "Carregando…";
    // `db` fica null e all/one/run já tratam isso retornando vazio/no-op.
    console.error('Modo local: banco não iniciou.', e)
    emit()
    return false
  }
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

// mesma instrução pra várias linhas, numa transação só e UMA persistência no
// fim (run() em loop regravaria o blob inteiro no localStorage a cada linha).
export function runMany(sql, listaParams) {
  if (!db) return
  db.run('BEGIN')
  try {
    const stmt = db.prepare(sql)
    for (const params of listaParams) stmt.run(params)
    stmt.free()
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  persist()
  emit()
}

// reseta o banco do zero (botão "reset" do painel)
export function reseed() {
  if (!db) return
  db.run(
    'DROP TABLE IF EXISTS queue_entries; DROP TABLE IF EXISTS settings; DROP TABLE IF EXISTS conversas; DROP TABLE IF EXISTS chat_mensagens; DROP TABLE IF EXISTS musicas; DROP TABLE IF EXISTS avisos;'
  )
  db.run(SCHEMA)
  seed()
  persist()
  emit()
}
