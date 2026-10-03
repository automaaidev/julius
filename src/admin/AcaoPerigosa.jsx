import { useState } from 'react'

// mensagens de erro conhecidas — o resto mostra a mensagem crua do Postgres
// mesmo (painel só pra staff, não é tela pública; ajuda a diagnosticar).
function mapErro(msg) {
  if (!msg) return 'Não deu certo. Tenta de novo.'
  if (msg === 'NAO_AUTORIZADO') {
    return 'Seu usuário não tem a permissão de admin marcada no Supabase (app_metadata.role = "admin"). Desloga e loga de novo depois de marcar.'
  }
  if (/could not find the function|schema cache/i.test(msg)) {
    return 'A função ainda não existe no banco — falta rodar a migration no SQL Editor do Supabase.'
  }
  return msg
}

// ação destrutiva e irreversível — pede a palavra certa digitada, não só um
// confirm() de navegador (clique acidental não basta pra executar).
export default function AcaoPerigosa({ icone: Icon, titulo, descricao, confirmacao, palavra, rotulo, feedback, executar, primeira }) {
  const [aberto, setAberto] = useState(false)
  const [digitado, setDigitado] = useState('')
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)

  function cancelar() {
    setAberto(false)
    setDigitado('')
    setErro('')
  }

  async function confirmar() {
    setExecutando(true)
    setErro('')
    const r = await executar()
    setExecutando(false)
    if (!r.ok) {
      setErro(mapErro(r.erro))
      return
    }
    setAberto(false)
    setDigitado('')
    setFeito(true)
    setTimeout(() => setFeito(false), 4000)
  }

  return (
    <div className={primeira ? undefined : 'adm-danger__item'}>
      <p className="adm-danger__titulo"><Icon size={14} /> {titulo}</p>

      {!aberto ? (
        <>
          <p className="adm-modo__hint" style={{ marginTop: 0 }}>{descricao}</p>
          <button type="button" className="q-btn q-btn--danger q-btn--sm" onClick={() => setAberto(true)}>
            <Icon size={15} /> {titulo}
          </button>
          {feito && <p className="adm-danger__ok">{feedback}</p>}
        </>
      ) : (
        <>
          <p className="adm-modo__hint" style={{ marginTop: 0 }}>
            {confirmacao} Digite <b>{palavra}</b> pra confirmar.
          </p>
          <input
            className="adm-danger__input"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder={palavra}
            autoFocus
          />
          {erro && <p className="q-error">{erro}</p>}
          <div className="adm-danger__acts">
            <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={cancelar} disabled={executando}>
              Cancelar
            </button>
            <button
              type="button"
              className="q-btn q-btn--danger q-btn--sm"
              onClick={confirmar}
              disabled={executando || digitado.trim().toLowerCase() !== palavra}
            >
              <Icon size={15} /> {executando ? 'Executando…' : rotulo}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
