import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await signIn(email, password)
    setEnviando(false)
    if (error) setErro('Email ou senha inválidos.')
  }

  return (
    <div className="container" style={{ maxWidth: 380 }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '1rem' }}>Admin — Juliu's</h1>
      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '0.9rem' }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Senha
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        {erro && <p style={{ color: 'var(--pessego)' }}>{erro}</p>}
        <button className="btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
