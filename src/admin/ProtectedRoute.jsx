import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import '../pages/queue.css'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="q-page">
        <div className="q-shell">
          <p className="q-note">Carregando…</p>
        </div>
      </div>
    )
  }
  if (!session) return <Navigate to="/app/admin/login" replace />

  return children
}
