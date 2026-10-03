// Fila + chat da casa em cima do SQLite do navegador (ver ./sqlite.js).
//
// Espelha a mesma superfície que o app consome do Supabase (RPCs +
// select/update direto), pra que hooks e páginas não precisem saber se
// estão em modo local ou remoto. Sem login. Dados são 100% fake, pra teste.

import { subscribe, all, one, run, runMany, reseed, dbReady, uuid } from './sqlite'
import { normalizar } from './normalizar'
import { abertoAgora } from './schedule'
import { MSG } from './avisos'

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
    return {
      id: 1,
      abertura_modo: 'auto',
      horario_funcionamento: DEFAULT_HORARIO,
      encerramento_automatico: true,
      limite_musicas: 1,
      ultimo_encerramento: null,
      intervalo_repetir_min: 30,
    }
  }
  let horario = DEFAULT_HORARIO
  try {
    horario = JSON.parse(row.horario_funcionamento) || DEFAULT_HORARIO
  } catch {
    /* ignore */
  }
  return {
    id: 1,
    abertura_modo: row.abertura_modo,
    horario_funcionamento: horario,
    encerramento_automatico: Number(row.encerramento_automatico) !== 0,
    limite_musicas: Number(row.limite_musicas) || 1,
    ultimo_encerramento: row.ultimo_encerramento || null,
    intervalo_repetir_min: Number.isFinite(Number(row.intervalo_repetir_min)) ? Number(row.intervalo_repetir_min) : 30,
  }
}

// "2026-10-02" no fuso do navegador (o servidor usa America/Sao_Paulo)
function dataLocal(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
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
      `INSERT INTO settings
         (id, abertura_modo, horario_funcionamento, encerramento_automatico, limite_musicas, ultimo_encerramento, intervalo_repetir_min)
         VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         abertura_modo = excluded.abertura_modo,
         horario_funcionamento = excluded.horario_funcionamento,
         encerramento_automatico = excluded.encerramento_automatico,
         limite_musicas = excluded.limite_musicas,
         ultimo_encerramento = excluded.ultimo_encerramento,
         intervalo_repetir_min = excluded.intervalo_repetir_min`,
      [
        next.abertura_modo,
        JSON.stringify(next.horario_funcionamento),
        next.encerramento_automatico ? 1 : 0,
        next.limite_musicas,
        next.ultimo_encerramento,
        next.intervalo_repetir_min,
      ]
    )
  },

  // ---- queue ----
  getQueue() {
    return all('SELECT * FROM queue_entries ORDER BY posicao ASC')
  },

  // mesma lógica da função julius._entrar_fila (Postgres): ordem de chegada
  // (posição = fim da fila), até `limite_musicas` ativas por perfil_id, sem
  // repetir o mesmo número e respeitando o intervalo pra repetir música
  // (`ignorarRepeticao`: o operador passa por cima, como no Postgres).
  _entrarFila({ nome, perfil, numero, ignorarRepeticao = false }) {
    const n = String(nome || '').trim()
    const p = String(perfil || '').trim()
    if (!n) throw new Error('NOME_VAZIO')
    if (!p) throw new Error('PERFIL_INVALIDO')
    const settings = this.getSettings()
    if (!abertoAgora(settings)) throw new Error('CASA_FECHADA')

    const list = ativos()
    const minhas = list.filter((e) => e.perfil_id === p)
    if (minhas.some((e) => e.numero_musica === String(numero).trim())) {
      throw new Error('MUSICA_REPETIDA')
    }

    const intervalo = settings.intervalo_repetir_min
    if (intervalo > 0 && !ignorarRepeticao) {
      const num = String(numero).trim()
      const naFila = list.find((e) => e.numero_musica === num)
      if (naFila) {
        const err = new Error('MUSICA_NA_FILA')
        err.detalhe =
          naFila.status === 'playing' ? '0' : String(list.filter((e) => e.posicao < naFila.posicao).length + 1)
        throw err
      }
      const janelaMs = intervalo * 60_000
      const cantadaHa = all(
        "SELECT cantada_em, created_at FROM queue_entries WHERE numero_musica = ? AND status = 'done'",
        [num]
      )
        .map((e) => new Date(e.cantada_em || e.created_at).getTime())
        .filter((t) => t > Date.now() - janelaMs)
        .sort((a, b) => b - a)[0]
      if (cantadaHa) {
        const err = new Error('MUSICA_RECENTE')
        err.detalhe = String(Math.max(1, Math.ceil((cantadaHa + janelaMs - Date.now()) / 60_000)))
        throw err
      }
    }

    if (minhas.length >= settings.limite_musicas) {
      throw new Error('LIMITE_MUSICAS')
    }

    const tail = list[list.length - 1]
    const novaPosicao = tail ? tail.posicao + 1 : 1

    const row = {
      id: uuid(),
      nome: n,
      perfil_id: p,
      numero_musica: String(numero).trim(),
      status: 'waiting',
      posicao: novaPosicao,
      created_at: new Date().toISOString(),
    }
    run(
      `INSERT INTO queue_entries
         (id, nome, perfil_id, numero_musica, status, posicao, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.nome, row.perfil_id, row.numero_musica, row.status, row.posicao, row.created_at]
    )
    return row
  },

  // ---- chat: mensagens (interno) ----
  _addMensagem(perfilId, autor, texto, queueEntryId = null) {
    if (!one('SELECT 1 FROM conversas WHERE perfil_id = ?', [perfilId])) return
    const agora = new Date().toISOString()
    run(
      `INSERT INTO chat_mensagens (id, perfil_id, autor, texto, queue_entry_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), perfilId, autor, texto, queueEntryId, agora]
    )
    run(
      `UPDATE conversas SET ultima_msg_em = ?, ultima_msg_texto = ?,
         nao_lidas_admin = nao_lidas_admin + ?
       WHERE perfil_id = ?`,
      [agora, texto, autor === 'cliente' ? 1 : 0, perfilId]
    )
  },

  // ---- chat: cliente ----
  chatIniciar({ perfil, chave, nome }) {
    const p = String(perfil || '').trim()
    const k = String(chave || '').trim()
    const n = String(nome || '').trim()
    if (!p || !k) throw new Error('PERFIL_INVALIDO')
    if (n.length < 1 || n.length > 24) throw new Error('NOME_INVALIDO')

    const existente = one('SELECT * FROM conversas WHERE perfil_id = ?', [p])
    const agora = new Date().toISOString()

    if (!existente) {
      run(
        `INSERT INTO conversas (perfil_id, chave, nome, nao_lidas_admin, created_at)
         VALUES (?, ?, ?, 0, ?)`,
        [p, k, n, agora]
      )
      this._addMensagem(p, 'sistema', MSG.boasVindas(n))
    } else if (existente.chave !== k) {
      throw new Error('PERFIL_INVALIDO')
    } else if (existente.nome !== n) {
      run('UPDATE conversas SET nome = ? WHERE perfil_id = ?', [n, p])
    }
  },

  chatMensagens(perfilId) {
    return all('SELECT * FROM chat_mensagens WHERE perfil_id = ? ORDER BY created_at ASC', [perfilId])
  },

  chatPedirMusica({ perfil, chave, numero }) {
    const p = String(perfil || '').trim()
    const conv = one('SELECT * FROM conversas WHERE perfil_id = ?', [p])
    if (!conv || conv.chave !== chave) throw new Error('PERFIL_INVALIDO')

    const num = String(numero || '').trim()
    if (!/^[0-9]{1,5}$/.test(num)) throw new Error('NUMERO_INVALIDO')

    const ultima = one(
      `SELECT created_at FROM chat_mensagens
       WHERE perfil_id = ? AND autor = 'cliente'
       ORDER BY created_at DESC LIMIT 1`,
      [p]
    )
    if (ultima && Date.now() - new Date(ultima.created_at).getTime() < 3000) {
      throw new Error('DEVAGAR')
    }

    this.encerrarFilaVencida()

    this._addMensagem(p, 'cliente', num)

    try {
      const row = this._entrarFila({ nome: conv.nome, perfil: p, numero: num })
      const rank = ativos().filter((e) => e.posicao < row.posicao).length + 1
      this._addMensagem(p, 'sistema', MSG.entrouNaFila(num, rank), row.id)
    } catch (e) {
      const texto =
        e.message === 'CASA_FECHADA'
          ? MSG.casaFechada
          : e.message === 'MUSICA_REPETIDA'
            ? MSG.musicaRepetida
            : e.message === 'MUSICA_NA_FILA'
              ? MSG.musicaNaFila(e.detalhe)
              : e.message === 'MUSICA_RECENTE'
                ? MSG.musicaRecente(e.detalhe)
                : e.message === 'LIMITE_MUSICAS'
                  ? MSG.limiteMusicas(this.getSettings().limite_musicas)
                  : MSG.erroGenerico
      this._addMensagem(p, 'sistema', texto)
    }
  },

  // sai da fila sem ter cantado (errou o número): 'cancelled', como no
  // Postgres (julius.chat_cancelar_musica). Só quem ainda está esperando.
  cancelarMusica({ perfil, chave, entryId }) {
    const p = String(perfil || '').trim()
    const conv = one('SELECT * FROM conversas WHERE perfil_id = ?', [p])
    if (!conv || conv.chave !== chave) throw new Error('PERFIL_INVALIDO')

    const entry = one('SELECT * FROM queue_entries WHERE id = ? AND perfil_id = ?', [entryId, p])
    if (!entry) throw new Error('ENTRADA_NAO_ENCONTRADA')
    if (entry.status !== 'waiting') throw new Error('NAO_PODE_CANCELAR')

    run("UPDATE queue_entries SET status = 'cancelled' WHERE id = ?", [entry.id])
    this._addMensagem(p, 'sistema', MSG.canceladaPelaPessoa(entry.numero_musica))
  },

  // ---- encerramento automático à meia-noite ----
  // Espelha julius.encerrar_fila_vencida: no máx. 1x por dia; quem estava no
  // palco vira 'done', quem esperava vira 'cancelled'; quem conversou ontem
  // ganha o agradecimento (só se a virada foi há menos de 6h).
  encerrarFilaVencida() {
    const settings = this.getSettings()
    if (!settings.encerramento_automatico) return 0

    const agora = new Date()
    const hoje = dataLocal(agora)
    if (settings.ultimo_encerramento && settings.ultimo_encerramento >= hoje) return 0

    const inicio = new Date(agora)
    inicio.setHours(0, 0, 0, 0)
    const inicioIso = inicio.toISOString()
    const inicioOntemIso = new Date(inicio.getTime() - 86_400_000).toISOString()

    run("UPDATE queue_entries SET status = 'done' WHERE status = 'playing' AND created_at < ?", [inicioIso])
    const fechadas = all(
      "SELECT id FROM queue_entries WHERE status = 'waiting' AND created_at < ?",
      [inicioIso]
    ).length
    run("UPDATE queue_entries SET status = 'cancelled' WHERE status = 'waiting' AND created_at < ?", [inicioIso])

    if (agora.getTime() < inicio.getTime() + 6 * 3_600_000) {
      const conversas = all(
        'SELECT perfil_id FROM conversas WHERE ultima_msg_em < ? AND ultima_msg_em >= ?',
        [inicioIso, inicioOntemIso]
      )
      for (const c of conversas) this._addMensagem(c.perfil_id, 'sistema', MSG.encerramento)
    }

    run('UPDATE settings SET ultimo_encerramento = ? WHERE id = 1', [hoje])
    return fechadas
  },

  // ---- sugestões (mais cantadas + destaques) e catálogo ----
  // Espelha julius.musicas_sugeridas.
  musicasSugeridas(limite = 8) {
    const vezes = new Map(
      all(
        `SELECT numero_musica AS numero, COUNT(*) AS vezes FROM queue_entries
         WHERE status IN ('playing', 'done') GROUP BY numero_musica`
      ).map((r) => [r.numero, Number(r.vezes)])
    )
    const musicas = new Map(
      all('SELECT numero, titulo, artista, destaque FROM musicas WHERE destaque = 1 OR numero IN (SELECT numero_musica FROM queue_entries)').map(
        (r) => [r.numero, r]
      )
    )
    const numeros = new Set([...vezes.keys(), ...[...musicas.values()].filter((m) => Number(m.destaque) === 1).map((m) => m.numero)])
    return [...numeros]
      .map((numero) => {
        const m = musicas.get(numero)
        return {
          numero,
          titulo: m?.titulo ?? null,
          artista: m?.artista ?? null,
          vezes: vezes.get(numero) ?? 0,
          destaque: Number(m?.destaque) === 1,
        }
      })
      .sort(
        (a, b) =>
          b.vezes - a.vezes ||
          (a.titulo === null) - (b.titulo === null) ||
          String(a.titulo ?? '').localeCompare(String(b.titulo ?? '')) ||
          a.numero.localeCompare(b.numero)
      )
      .slice(0, Math.max(1, Math.min(limite, 100)))
  },

  // Espelha julius.buscar_musicas (cardápio paginado + filtro). `termo` já vem
  // normalizado. É modo de teste: filtra e ordena em JS em vez de montar índices.
  buscarMusicas(termo, categoria = null, limite = 50, offset = 0, ordem = 'titulo') {
    const filtra = termo.length >= 2
    // palavra longa perde o "s" do plural: "evidencias" acha "Evidência" (igual ao Postgres)
    const palavras = filtra
      ? termo
          .split(' ')
          .filter(Boolean)
          .map((w) => (w.length >= 5 ? w.replace(/s$/, '') : w))
      : []
    const condicoes = []
    const params = []
    if (categoria) {
      condicoes.push('categoria = ?')
      params.push(categoria)
    }
    if (filtra) {
      condicoes.push(`(numero LIKE ? OR (${palavras.map(() => 'busca LIKE ?').join(' AND ')}))`)
      params.push(`${termo}%`, ...palavras.map((w) => `%${w}%`))
    }
    const rows = all(
      `SELECT numero, titulo, artista, categoria, busca FROM musicas${condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : ''}`,
      params
    ).map((m) => ({ ...m, chaveTitulo: normalizar(m.titulo), chaveArtista: normalizar(m.artista ?? '') }))

    rows.sort(
      (a, b) =>
        (filtra ? Number(b.numero === termo) - Number(a.numero === termo) || Number(b.busca.startsWith(termo)) - Number(a.busca.startsWith(termo)) : 0) ||
        (ordem === 'artista' ? a.chaveArtista.localeCompare(b.chaveArtista) : 0) ||
        a.chaveTitulo.localeCompare(b.chaveTitulo) ||
        a.numero.localeCompare(b.numero)
    )
    const pagina = rows.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, Math.min(limite, 100)))
    return {
      itens: pagina.map(({ numero, titulo, artista, categoria: cat }) => ({ numero, titulo, artista, categoria: cat })),
      total: rows.length,
    }
  },

  getMusicas(numeros) {
    if (!numeros.length) return []
    return all(
      `SELECT numero, titulo, artista FROM musicas WHERE numero IN (${numeros.map(() => '?').join(',')})`,
      numeros
    )
  },

  contarCatalogo() {
    return Number(one('SELECT COUNT(*) AS n FROM musicas')?.n ?? 0)
  },

  // itens: [[numero, titulo, artista, categoria]] — insere ou atualiza, sem mexer no destaque
  importarCatalogo(itens) {
    runMany(
      `INSERT INTO musicas (numero, titulo, artista, categoria, busca, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET titulo = excluded.titulo, artista = excluded.artista,
         categoria = excluded.categoria, busca = excluded.busca`,
      itens.map(([numero, titulo, artista, categoria]) => [
        numero,
        titulo,
        artista || null,
        categoria,
        normalizar(`${titulo} ${artista ?? ''}`),
        new Date().toISOString(),
      ])
    )
  },

  // título digitado no painel: entra como sugestão (destaque)
  salvarMusica(numero, titulo) {
    const n = String(numero || '').trim()
    const t = String(titulo || '').trim()
    if (!/^[0-9]{1,5}$/.test(n)) throw new Error('NUMERO_INVALIDO')
    if (t.length < 1 || t.length > 120) throw new Error('TITULO_INVALIDO')
    const existente = one('SELECT artista FROM musicas WHERE numero = ?', [n])
    run(
      `INSERT INTO musicas (numero, titulo, destaque, busca, created_at) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET titulo = excluded.titulo, busca = excluded.busca`,
      [n, t, normalizar(`${t} ${existente?.artista ?? ''}`), new Date().toISOString()]
    )
  },

  definirDestaque(numero, valor) {
    run('UPDATE musicas SET destaque = ? WHERE numero = ?', [valor ? 1 : 0, numero])
  },

  // ---- chat: admin ----
  getConversas() {
    return all('SELECT * FROM conversas ORDER BY ultima_msg_em DESC')
  },

  getMensagens(perfilId) {
    return this.chatMensagens(perfilId)
  },

  adminEnviar(perfilId, texto) {
    const t = String(texto || '').trim()
    if (!t) return
    this._addMensagem(perfilId, 'admin', t)
  },

  apagarMensagem(id) {
    run('DELETE FROM chat_mensagens WHERE id = ?', [id])
  },

  marcarLida(perfilId) {
    run('UPDATE conversas SET nao_lidas_admin = 0 WHERE perfil_id = ?', [perfilId])
  },

  // ---- admin: fila ----
  setEntryStatus(id, status) {
    const entry = one('SELECT * FROM queue_entries WHERE id = ?', [id])
    if (!entry) return

    if (status === 'playing' && ativos().some((e) => e.status === 'playing' && e.id !== id)) {
      throw new Error('JA_TEM_UM_NO_PALCO')
    }

    run('UPDATE queue_entries SET status = ? WHERE id = ?', [status, id])
    if (status === 'done') {
      run('UPDATE queue_entries SET cantada_em = ? WHERE id = ?', [new Date().toISOString(), id])
    }

    if (status === 'playing') {
      this._addMensagem(entry.perfil_id, 'sistema', MSG.suaVez(entry.numero_musica), entry.id)
      const proximo = ativos().find((e) => e.status === 'waiting')
      if (proximo) {
        this._addMensagem(proximo.perfil_id, 'sistema', MSG.proximo(proximo.numero_musica), proximo.id)
      }
    } else if (status === 'done' && entry.status === 'playing') {
      this._addMensagem(entry.perfil_id, 'sistema', MSG.concluido, entry.id)
    }
  },

  // operador inclui quem não tem celular (julius.admin_adicionar_fila): cada
  // inclusão é um "perfil" novo, então o limite por pessoa não vale.
  adminAdicionar({ nome, numero }) {
    const n = String(nome || '').trim()
    const num = String(numero || '').trim()
    if (n.length < 1 || n.length > 24) throw new Error('NOME_INVALIDO')
    if (!/^[0-9]{1,5}$/.test(num)) throw new Error('NUMERO_INVALIDO')
    this.encerrarFilaVencida()
    return this._entrarFila({ nome: n, perfil: `manual-${uuid()}`, numero: num, ignorarRepeticao: true })
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
