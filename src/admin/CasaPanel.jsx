import { useState } from 'react'
import { DoorOpen, DoorClosed, CalendarClock, Clock, Save, AlertTriangle, Trash2, Moon, Users, AlertCircle, Timer } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'
import AcaoPerigosa from './AcaoPerigosa'
import { mapErroAdmin } from './erros'
import { modoRepetir } from '../lib/fila'

const DIAS = [
  ['seg', 'segunda'], ['ter', 'terça'], ['qua', 'quarta'], ['qui', 'quinta'],
  ['sex', 'sexta'], ['sab', 'sábado'], ['dom', 'domingo'],
]

const MODOS = [
  ['auto', 'Automático', CalendarClock],
  ['aberto', 'Forçar aberto', DoorOpen],
  ['fechado', 'Forçar fechado', DoorClosed],
]

// controles da casa: modo de abertura + horário de funcionamento.
export default function CasaPanel({ settings, onChanged, onLimparTudo }) {
  return (
    <>
      <div className="q-card">
        <h3 className="adm-h2"><DoorOpen size={15} /> Casa aberta ao público?</h3>
        <p className="adm-modo__desc">Escolhe como a casa decide se tá aberta agora.</p>
        <ModoControls settings={settings} onChanged={onChanged} />
      </div>
      <div className="q-card">
        <h3 className="adm-h2"><Users size={15} /> Regras da fila</h3>
        <RegrasFila settings={settings} onChanged={onChanged} />
      </div>
      <div className="q-card">
        <h3 className="adm-h2"><Clock size={15} /> Horário de funcionamento</h3>
        <p className="adm-modo__desc">Só vale no modo Automático — dia fechado ou com horário fora do previsto não deixa pedir música.</p>
        <HorarioForm settings={settings} onChanged={onChanged} />
      </div>
      {onLimparTudo && (
        <div className="q-card adm-danger">
          <h3 className="adm-h2 adm-h2--danger"><AlertTriangle size={15} /> Zona de perigo</h3>
          <AcaoPerigosa
            primeira
            icone={Trash2}
            titulo="Limpar tudo"
            descricao="Apaga a fila, os chats e os pedidos de música de verdade. Não dá pra desfazer."
            confirmacao="Isso apaga toda a fila, os chats e os pedidos de música — pra sempre."
            palavra="apagar"
            rotulo="Confirmar, apagar tudo"
            feedback="Dados apagados."
            executar={onLimparTudo}
          />
        </div>
      )}
    </>
  )
}

// grava um pedaço de `settings` (singleton id = 1); devolve o erro já legível
async function salvarSettings(patch) {
  try {
    if (LOCAL) {
      localDb.updateSettings(patch)
    } else {
      const { error } = await supabase.from('settings').update(patch).eq('id', 1)
      if (error) throw error
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mapErroAdmin(e.message) }
  }
}

// encerramento à meia-noite + quantas músicas cada pessoa pode ter na fila + música repetida
function RegrasFila({ settings, onChanged }) {
  const encerra = settings.encerramento_automatico === true
  const limite = settings.limite_musicas ?? 1
  const intervalo = settings.intervalo_repetir_min ?? 0
  const musicas = settings.intervalo_repetir_musicas ?? 5
  // 'tempo' com 0 min (só mexendo por SQL) é o mesmo que liberar assim que cantar
  const modoSalvo = modoRepetir(settings)
  const modo = modoSalvo === 'tempo' && intervalo === 0 ? 'ao_terminar' : modoSalvo
  // atalhos comuns; se o banco tiver outro valor (ex: mexido por SQL) ele aparece também
  const opcoesTempo = [...new Set([15, 30, 60, 120, intervalo])].filter((n) => n > 0).sort((a, b) => a - b)
  const opcoesMusicas = [...new Set([3, 5, 10, musicas])].sort((a, b) => a - b)
  const dicaRepetida = {
    livre: 'Desligado: qualquer pessoa pode pedir um número que já está na fila ou no palco.',
    ao_terminar: 'Ligado: o número fica bloqueado enquanto está na fila ou no palco e libera assim que é cantado.',
    tempo: `Ligado: o número fica bloqueado enquanto está na fila ou no palco e só volta ${rotuloIntervalo(intervalo, true)} depois de cantado.`,
    musicas: `Ligado: o número fica bloqueado enquanto está na fila ou no palco e só volta depois de mais ${rotuloMusicas(musicas)} cantadas.`,
  }[modo]
  const [erro, setErro] = useState('')

  async function aplicar(patch) {
    setErro('')
    const r = await salvarSettings(patch)
    if (!r.ok) setErro(r.erro)
    onChanged?.()
  }

  // botão de uma opção da música repetida; não grava de novo o que já está escolhido
  const opcao = (on, patch, rotulo) => (
    <button
      key={rotulo}
      type="button"
      className={`adm-modo ${on ? 'adm-modo--on' : ''}`}
      onClick={() => !on && aplicar(patch)}
    >
      {rotulo}
    </button>
  )

  return (
    <>
      <div className="adm-regra">
        <label className="adm-switch">
          <input
            type="checkbox"
            checked={encerra}
            onChange={(e) => aplicar({ encerramento_automatico: e.target.checked })}
          />
          <span className="adm-switch__track"><span className="adm-switch__thumb" /></span>
        </label>
        <span className="adm-regra__txt">
          <b><Moon size={13} /> Encerrar a fila à meia-noite</b>
          <span>
            À meia-noite a casa fecha pra novos pedidos, quem ficou na fila sai e quem conversou recebe um
            agradecimento. Vale mesmo se o horário passar da meia-noite.
          </span>
        </span>
      </div>

      <div className="adm-regra adm-regra--col">
        <span className="adm-regra__txt">
          <b><Users size={13} /> Músicas por pessoa</b>
          <span>Quantas músicas cada pessoa pode ter na fila ao mesmo tempo.</span>
        </span>
        <div className="adm-modos">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`adm-modo ${limite === n ? 'adm-modo--on' : ''}`}
              onClick={() => limite !== n && aplicar({ limite_musicas: n })}
            >
              {n} {n === 1 ? 'música' : 'músicas'}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-regra adm-regra--col">
        <span className="adm-regra__txt">
          <b><Timer size={13} /> Música repetida</b>
          <span>
            Se alguém já pediu um número, outra pessoa só pede o mesmo depois que ele for cantado. Escolhe
            quando ele libera. O operador pode incluir mesmo assim (ex: dueto).
          </span>
        </span>
        <div className="adm-modos adm-modos--linha">
          {opcao(modo === 'ao_terminar', { repetir_modo: 'ao_terminar' }, 'Assim que cantar')}
          {opcao(modo === 'livre', { repetir_modo: 'livre' }, 'Desligado')}
        </div>
        <span className="adm-modos__rotulo">Ou depois de um tempo</span>
        <div className="adm-modos adm-modos--linha">
          {opcoesTempo.map((n) =>
            opcao(modo === 'tempo' && intervalo === n, { repetir_modo: 'tempo', intervalo_repetir_min: n }, rotuloIntervalo(n))
          )}
        </div>
        <span className="adm-modos__rotulo">Ou depois de mais músicas cantadas</span>
        <div className="adm-modos adm-modos--linha">
          {opcoesMusicas.map((n) =>
            opcao(
              modo === 'musicas' && musicas === n,
              { repetir_modo: 'musicas', intervalo_repetir_musicas: n },
              rotuloMusicas(n)
            )
          )}
        </div>
        <p className="adm-modo__hint" style={{ marginTop: 0 }}>
          {dicaRepetida}
        </p>
      </div>

      {erro && (
        <p className="q-error">
          <AlertCircle size={16} /> {erro}
        </p>
      )}
    </>
  )
}

const rotuloMusicas = (n) => `${n} ${n === 1 ? 'música' : 'músicas'}`

// 15 -> "15 min" | 60 -> "1 h" ; `frase` = forma pra usar no meio do texto
function rotuloIntervalo(min, frase = false) {
  if (min < 60 || min % 60 !== 0) return frase ? `${min} minutos` : `${min} min`
  const h = min / 60
  return frase ? `${h} ${h === 1 ? 'hora' : 'horas'}` : `${h} h`
}

function ModoControls({ settings, onChanged }) {
  const modo = settings.abertura_modo || 'auto'

  async function setModo(novo) {
    if (novo === modo) return
    if (LOCAL) localDb.updateSettings({ abertura_modo: novo })
    else await supabase.from('settings').update({ abertura_modo: novo }).eq('id', 1)
    onChanged?.()
  }

  return (
    <>
      <div className="adm-modos">
        {MODOS.map(([val, label, Icon]) => (
          <button
            key={val}
            type="button"
            className={`adm-modo ${modo === val ? 'adm-modo--on' : ''}`}
            onClick={() => setModo(val)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <p className="adm-modo__hint">
        {modo === 'auto'
          ? 'Abre e fecha sozinho pelo horário de funcionamento.'
          : modo === 'aberto'
            ? 'Casa forçada aberta — ignora o horário até você voltar pra Automático.'
            : 'Casa forçada fechada — ignora o horário até você voltar pra Automático.'}
      </p>
    </>
  )
}

// "19:00-23:00" -> { fechado: false, abre: '19:00', fecha: '23:00' }
// "fechado" / vazio -> { fechado: true, abre/fecha: sugestão padrão }
function paraDia(faixa) {
  if (!faixa || faixa === 'fechado') return { fechado: true, abre: '19:00', fecha: '23:00' }
  const [abre, fecha] = String(faixa).split('-')
  return { fechado: false, abre: (abre || '19:00').trim(), fecha: (fecha || '23:00').trim() }
}

function deDia({ fechado, abre, fecha }) {
  return fechado ? 'fechado' : `${abre}-${fecha}`
}

function HorarioForm({ settings, onChanged }) {
  const [dias, setDias] = useState(() => {
    const h = settings.horario_funcionamento || {}
    return Object.fromEntries(DIAS.map(([key]) => [key, paraDia(h[key])]))
  })
  const [salvando, setSalvando] = useState(false)

  function atualizar(key, patch) {
    setDias((atual) => ({ ...atual, [key]: { ...atual[key], ...patch } }))
  }

  async function salvarHorario(e) {
    e.preventDefault()
    setSalvando(true)
    const horario = Object.fromEntries(Object.entries(dias).map(([key, d]) => [key, deDia(d)]))
    if (LOCAL) localDb.updateSettings({ horario_funcionamento: horario })
    else await supabase.from('settings').update({ horario_funcionamento: horario }).eq('id', 1)
    setSalvando(false)
    onChanged?.()
  }

  return (
    <form onSubmit={salvarHorario}>
      <div className="adm-hlist2">
        {DIAS.map(([key, label]) => {
          const d = dias[key]
          return (
            <div key={key} className="adm-hrow2">
              <label className="adm-switch">
                <input
                  type="checkbox"
                  checked={!d.fechado}
                  onChange={(e) => atualizar(key, { fechado: !e.target.checked })}
                />
                <span className="adm-switch__track"><span className="adm-switch__thumb" /></span>
              </label>
              <span className="adm-hrow2__dia">{label}</span>
              {d.fechado ? (
                <span className="adm-hrow2__fechado">Fechado</span>
              ) : (
                <span className="adm-hrow2__horas">
                  <input
                    type="time"
                    value={d.abre}
                    onChange={(e) => atualizar(key, { abre: e.target.value })}
                    aria-label={`${label}: horário de abertura`}
                  />
                  <span>até</span>
                  <input
                    type="time"
                    value={d.fecha}
                    onChange={(e) => atualizar(key, { fecha: e.target.value })}
                    aria-label={`${label}: horário de fechamento`}
                  />
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="adm-modo__hint">
        {settings.encerramento_automatico === true
          ? 'Com o encerramento à meia-noite ligado, a casa fecha às 00:00 mesmo que o "até" seja depois disso.'
          : 'Fecha depois da meia-noite? Deixa o "até" menor que o "das" — ex: das 19:00 até 01:00.'}
      </p>
      <button className="q-btn q-btn--primary q-btn--sm" type="submit" disabled={salvando}>
        <Save size={15} /> {salvando ? 'Salvando…' : 'Salvar horário'}
      </button>
    </form>
  )
}
