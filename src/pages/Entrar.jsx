import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, Mic } from 'lucide-react'
import { LOCAL } from '../lib/flags'
import { useChatCliente } from '../hooks/useChat'
import { getPerfilId, getPerfilChave, getPerfilNome, setPerfilNome, nomeCompleto } from '../lib/perfil'
import Abertura from '../components/Abertura'
import './queue.css'
import './entrar.css'

// Entrada de quem ainda não tem nome (1ª visita ou depois de "Sair") ou tem só o primeiro nome
// (salvo antes de pedirmos o sobrenome): a logo abre como um app e pousa em cima de um
// formulário curto de nome e sobrenome. Com nome e sobrenome, segue pra conversa.
export default function Entrar() {
  const navigate = useNavigate()
  const [perfilId] = useState(getPerfilId)
  const [chave] = useState(getPerfilChave)
  const { iniciar } = useChatCliente(perfilId, chave, { ativo: false })
  const [fase, setFase] = useState('abertura') // abertura -> voo (formulário entra) -> pronto
  const [salvo] = useState(getPerfilNome) // só o primeiro nome ("will"): vem no campo pra completar
  const [nome, setNome] = useState(() => (salvo ? `${salvo} ` : ''))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const logoRef = useRef(null)
  const campoRef = useRef(null)

  const aoVoar = useCallback(() => setFase((f) => (f === 'abertura' ? 'voo' : f)), [])
  const aoPousar = useCallback(() => setFase('pronto'), [])

  // com mouse, já deixa o cursor no campo; no celular não (o teclado cobriria a logo recém-pousada)
  useEffect(() => {
    if (fase === 'pronto' && window.matchMedia('(pointer: fine)').matches) campoRef.current?.focus()
  }, [fase])

  // primeiro nome já no campo: o cursor vai pro fim, onde entra o sobrenome (no próximo tique:
  // o navegador só posiciona o cursor depois do evento de foco)
  function cursorNoFim(e) {
    const el = e.target
    if (salvo && el.value === `${salvo} `) setTimeout(() => el.setSelectionRange(el.value.length, el.value.length))
  }

  if (nomeCompleto(getPerfilNome())) return <Navigate to="/minha-fila" replace />

  async function entrar(e) {
    e.preventDefault()
    const n = nome.trim().replace(/\s+/g, ' ')
    if (!nomeCompleto(n)) {
      setErro(
        n.split(' ')[0].replace(/[^\p{L}]/gu, '').length >= 2
          ? 'Faltou o sobrenome. Ex.: Ana Souza'
          : 'Coloca seu nome e sobrenome. Ex.: Ana Souza'
      )
      campoRef.current?.focus()
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const r = await iniciar(n)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setPerfilNome(n)
      navigate('/minha-fila', { replace: true })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="entrar">
      {LOCAL && (
        <p className="q-local entrar__teste" role="status">
          Modo teste — dados falsos deste navegador, não o banco real.
        </p>
      )}

      <div className={`entrar__caixa ${fase === 'abertura' ? 'is-esperando' : ''}`}>
        <img
          ref={logoRef}
          className={`entrar__logo ${fase === 'pronto' ? '' : 'is-oculta'}`}
          src="/logo-lockup.png"
          alt="Juliu's — o videokê da cidade"
          width="1066"
          height="419"
        />

        <form className="entrar__form" onSubmit={entrar} noValidate>
          <h1 className="entrar__titulo">Bora cantar?</h1>
          <p className="entrar__texto">
            {salvo
              ? 'Agora a gente chama todo mundo pelo nome e sobrenome. Completa aí:'
              : 'Coloca seu nome e sobrenome pra gente te chamar no palco.'}
          </p>

          <label className="entrar__rotulo" htmlFor="entrar-nome">
            Nome e sobrenome
          </label>
          <input
            id="entrar-nome"
            ref={campoRef}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value.slice(0, 24))
              setErro('')
            }}
            onFocus={cursorNoFim}
            placeholder="Ex.: Ana Souza"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={24}
            aria-invalid={erro ? 'true' : undefined}
            aria-describedby={erro ? 'entrar-erro' : 'entrar-dica'}
          />
          {erro ? (
            <p id="entrar-erro" className="q-error entrar__erro" role="alert">
              <AlertCircle size={16} /> {erro}
            </p>
          ) : (
            <p id="entrar-dica" className="entrar__dica">
              Vai cantar em dupla? Coloca o nome dos dois.
            </p>
          )}

          <button className="q-btn q-btn--primary entrar__botao" type="submit" disabled={enviando}>
            <Mic size={18} /> {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>

      {fase !== 'pronto' && <Abertura alvoRef={logoRef} onVoo={aoVoar} onFim={aoPousar} />}
    </main>
  )
}
