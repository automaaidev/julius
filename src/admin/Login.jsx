import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LockKeyhole, ChevronRight } from 'lucide-react'
import { LOCAL } from '../lib/flags'
import { useAuth } from '../hooks/useAuth'
import '../pages/queue.css'

export default function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/app/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await signIn(email, password)
    setEnviando(false)
    if (error) setErro('Email ou senha inválidos.')
  }

  return (
    <div className="q-page">
      <div className="q-shell">
        <div className="q-top">
          <Link to="/" className="q-brand">
            <img className="q-brand__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
          </Link>
        </div>

        <div className="q-head">
          <h1>Painel</h1>
          <p>Acesso da equipe da casa.</p>
        </div>

        <motion.form
          className="q-card q-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <label className="q-field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus />
          </label>
          <label className="q-field">
            <span><LockKeyhole size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Senha</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>

          {LOCAL && (
            <p className="q-note q-note--soft" style={{ textAlign: 'left' }}>
              Modo local: qualquer email/senha entra.
            </p>
          )}
          {erro && <p className="q-error">{erro}</p>}

          <button className="q-btn q-btn--primary" type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'} <ChevronRight size={18} />
          </button>
        </motion.form>
      </div>
    </div>
  )
}
